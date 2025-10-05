import { useCallback, useEffect, useMemo, useState } from "react";
import type { ChangeEvent, ComponentType } from "react";
import type { Encoded } from "@aeternity/aepp-sdk";
import { AE_AMOUNT_FORMATS, Contract } from "@aeternity/aepp-sdk";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";

import "./App.css";
import useAeternitySDK from "./hooks/useAeternitySDK";
import network from "./configs/network";
import contracts from "./configs/contracts";
import { barrierOptionsSource } from "./contracts/barrierOptionsSource";

const STATUS_LABELS = {
  StatusOpen: "Open",
  StatusTouchedUp: "Touched Up",
  StatusTouchedDown: "Touched Down",
  StatusExpired: "Expired",
} as const;

type MarketStatus = keyof typeof STATUS_LABELS;

type RawMarket = {
  id: number | string;
  asset: string;
  barrier_up: number | string;
  barrier_down: number | string;
  expiry: number | string;
  is_race: boolean;
  status: MarketStatus;
  total_up: number | string | bigint;
  total_down: number | string | bigint;
};

type MarketView = {
  id: number;
  asset: AssetOption;
  barrierUp: number;
  barrierDown: number;
  expiry: number;
  isRace: boolean;
  status: MarketStatus;
  totalUp: bigint;
  totalDown: bigint;
};

const AE_DECIMALS = 1_000_000_000_000_000_000n;
const ASSETS = ["AE", "BTC", "ETH", "SOL", "AVAX", "DOGE"] as const;
const ASSET_CONFIG: Record<AssetOption, string> = {
  AE: "aeternity",
  BTC: "bitcoin",
  ETH: "ethereum",
  SOL: "solana",
  AVAX: "avalanche-2",
  DOGE: "dogecoin",
};
const DURATION_OPTIONS = [
  { label: "30 minutes", blocks: 600 },
  { label: "1 hour", blocks: 1200 },
  { label: "6 hours", blocks: 7200 },
  { label: "24 hours", blocks: 28800 },
  { label: "3 days", blocks: 86400 },
];
const DEFAULT_RAKE_PPM = 20000;
const RAKE_SCALE = 1_000_000;
const QUICK_AMOUNTS = [1, 5, 10, 25];

type PricePoint = {
  time: string;
  value: number;
};

type AssetSeries = {
  price: number;
  series: PricePoint[];
  fetchedAt: number;
};

const ResponsiveContainerComponent = ResponsiveContainer as unknown as ComponentType<any>;
const AreaChartComponent = AreaChart as unknown as ComponentType<any>;
const AreaComponent = Area as unknown as ComponentType<any>;
const TooltipComponent = RechartsTooltip as unknown as ComponentType<any>;
const XAxisComponent = XAxis as unknown as ComponentType<any>;
const YAxisComponent = YAxis as unknown as ComponentType<any>;

const PriceTooltip = ({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ value: number }>;
}) => {
  if (!active || !payload?.length) return null;
  const [{ value }] = payload;
  return <div className="chart-tooltip">${value.toFixed(2)}</div>;
};

type AssetOption = (typeof ASSETS)[number];

type CreateFormState = {
  barrierUp: string;
  barrierDown: string;
  duration: string;
  isRace: boolean;
  asset: AssetOption;
};

const defaultCreateForm: CreateFormState = {
  barrierUp: "",
  barrierDown: "",
  duration: DURATION_OPTIONS[2].blocks.toString(),
  isRace: false,
  asset: "AE",
};

type ViewMode = "discover" | "market";

const formatAe = (value: bigint) => {
  if (value === 0n) return "0";
  const integer = value / AE_DECIMALS;
  const fraction = Number(value % AE_DECIMALS) / 1e18;
  return (Number(integer) + fraction).toFixed(3);
};

const toAettos = (amount: string) => {
  const parsed = Number(amount);
  if (Number.isNaN(parsed) || parsed <= 0) {
    throw new Error("Enter a positive amount");
  }
  return BigInt(Math.round(parsed * 1e18));
};

const statusClass = (status: MarketStatus) => {
  switch (status) {
    case "StatusOpen":
      return "status open";
    case "StatusTouchedUp":
      return "status touched-up";
    case "StatusTouchedDown":
      return "status touched-down";
    case "StatusExpired":
      return "status expired";
    default:
      return "status";
  }
};

const App = () => {
  const { aeSdk, connectToWallet, disconnectWallet, address, networkId } = useAeternitySDK();
  const [showApp, setShowApp] = useState(false);
  const [balance, setBalance] = useState<string>("—");
  const [connectionMessage, setConnectionMessage] = useState<string | undefined>();
  const [isConnecting, setIsConnecting] = useState(false);
  const [contractInstance, setContractInstance] = useState<any>();
  const [markets, setMarkets] = useState<MarketView[]>([]);
  const [marketsLoading, setMarketsLoading] = useState(false);
  const [selectedMarketId, setSelectedMarketId] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("discover");
  const [errorMessage, setErrorMessage] = useState<string | undefined>();
  const [successMessage, setSuccessMessage] = useState<string | undefined>();
  const [createForm, setCreateForm] = useState<CreateFormState>(defaultCreateForm);
  const [betForm, setBetForm] = useState({ amount: "", onUp: true });
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [assetData, setAssetData] = useState<Partial<Record<AssetOption, AssetSeries>>>({});
  const [priceLoading, setPriceLoading] = useState(false);
  const [priceError, setPriceError] = useState<string | undefined>();
  const [autoBarriers, setAutoBarriers] = useState(true);
  const [rakePpm, setRakePpm] = useState<number>(DEFAULT_RAKE_PPM);
  const computeSuggestedBarriers = useCallback(
    (price: number, isRace: boolean) => {
      const upMultiplier = isRace ? 1.03 : 1.05;
      const downMultiplier = isRace ? 0.97 : 0.95;
      const up = Math.max(1, Math.round(price * upMultiplier));
      const down = Math.max(1, Math.round(price * downMultiplier));
      return { up, down };
    },
    [],
  );

  const fetchAssetData = useCallback(
    async (asset: AssetOption, force = false): Promise<AssetSeries | null> => {
      const existing = assetData[asset];
      if (!force && existing && Date.now() - existing.fetchedAt < 60_000) {
        return existing;
      }

      const id = ASSET_CONFIG[asset];
      if (!id) return existing ?? null;

      try {
        setPriceLoading(true);
        setPriceError(undefined);
        const [priceRes, chartRes] = await Promise.all([
          fetch(
            `https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd`,
          ),
          fetch(
            `https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=usd&days=1&interval=hourly`,
          ),
        ]);

        const priceJson = await priceRes.json();
        const price = Number(priceJson?.[id]?.usd ?? 0);

        const chartJson = await chartRes.json();
        const series: PricePoint[] = Array.isArray(chartJson?.prices)
          ? chartJson.prices.map(([ts, value]: [number, number]) => ({
              time: new Date(ts).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              }),
              value: Number(value ?? 0),
            }))
          : [];

        const data: AssetSeries = { price, series, fetchedAt: Date.now() };
        setAssetData((prev) => ({ ...prev, [asset]: data }));
        return data;
      } catch (error) {
        if (error instanceof Error) {
          setPriceError(error.message);
        } else {
          setPriceError("Failed to fetch price data");
        }
        return existing ?? null;
      } finally {
        setPriceLoading(false);
      }
    },
    [assetData],
  );

  const selectedMarket = useMemo(
    () => markets.find((m) => m.id === selectedMarketId) ?? null,
    [markets, selectedMarketId],
  );

  const selectedAssetData = selectedMarket
    ? assetData[selectedMarket.asset]
    : undefined;
  const createAssetData = assetData[createForm.asset];
  const rakeRate = rakePpm / RAKE_SCALE;
  const rakePercentLabel = (rakePpm / 10000).toFixed(2);
  const poolTotal = selectedMarket
    ? selectedMarket.totalUp + selectedMarket.totalDown
    : 0n;
  const poolAe = Number(poolTotal) / 1e18;
  const upStakeAe = selectedMarket ? Number(selectedMarket.totalUp) / 1e18 : 0;
  const downStakeAe = selectedMarket ? Number(selectedMarket.totalDown) / 1e18 : 0;
  const poolAfterRake = poolAe * (1 - rakeRate);
  const upMultiplier = upStakeAe > 0 ? poolAfterRake / upStakeAe : 0;
  const downMultiplier = downStakeAe > 0 ? poolAfterRake / downStakeAe : 0;
  const yesPricePercent = poolAe > 0 ? (upStakeAe / poolAe) * 100 : 50;
  const noPricePercent = poolAe > 0 ? (downStakeAe / poolAe) * 100 : 50;
  const numericStake = Number(betForm.amount) || 0;
  const potentialPayout = numericStake * (betForm.onUp ? upMultiplier || 0 : downMultiplier || 0);
  const calcChangePercent = (asset: AssetOption) => {
    const series = assetData[asset]?.series ?? [];
    if (series.length < 2) return 0;
    const start = series[0]?.value ?? 0;
    const end = series[series.length - 1]?.value ?? 0;
    if (!start) return 0;
    return ((end - start) / start) * 100;
  };
  const selectedChangePercent = selectedMarket ? calcChangePercent(selectedMarket.asset) : 0;
  const selectedSeries = selectedAssetData?.series ?? [];
  const selectedSpot = selectedAssetData?.price ?? null;
  const uniqueAssetCount = new Set(markets.map((market) => market.asset)).size;

  const isOwner = useMemo(
    () =>
      address?.toLowerCase() === contracts.ownerAddress.toLowerCase(),
    [address],
  );

  const isWalletConnected = Boolean(address);

  useEffect(() => {
    if (!showApp || !address) return;

    const loadBalance = async () => {
      try {
        if (networkId && networkId !== network.id) {
          setConnectionMessage(
            `Network "${networkId}" is not supported. Switch to ${network.id}.`,
          );
          setBalance("—");
          return;
        }
        setConnectionMessage(undefined);
        const currentBalance = await aeSdk.getBalance(address, {
          format: AE_AMOUNT_FORMATS.AE,
        });
        setBalance(currentBalance);
      } catch (error) {
        if (error instanceof Error) {
          setConnectionMessage(error.message);
        }
        setBalance("—");
      }
    };

    void loadBalance();
  }, [showApp, aeSdk, address, networkId]);

  useEffect(() => {
    if (!showApp || !address || networkId !== network.id) return;

    const loadContract = async () => {
      try {
        const instance = (await Contract.initialize({
          ...aeSdk.getContext(),
          sourceCode: barrierOptionsSource,
          address: contracts.barrierAddress as Encoded.ContractAddress,
        })) as any;
        setContractInstance(instance);
        try {
          const rakeResult = await instance.methods.getRake();
          const value = Number(rakeResult.decodedResult ?? DEFAULT_RAKE_PPM);
          if (!Number.isNaN(value)) {
            setRakePpm(value);
          }
        } catch (_) {
          setRakePpm(DEFAULT_RAKE_PPM);
        }
      } catch (error) {
        if (error instanceof Error) setErrorMessage(error.message);
      }
    };

    void loadContract();
  }, [showApp, aeSdk, address, networkId]);

  const loadMarkets = useCallback(async (): Promise<MarketView[]> => {
    if (!contractInstance) return [];
    setMarketsLoading(true);
    try {
      const counterResult = await contractInstance.methods.getMarketCounter();
      const count = Number(counterResult.decodedResult ?? 0);
      const items: MarketView[] = [];
      for (let id = 1; id <= count; id += 1) {
        const result = await contractInstance.methods.getMarketData(id);
        const raw = result.decodedResult as RawMarket;
        const totalUp = BigInt(raw.total_up.toString());
        const totalDown = BigInt(raw.total_down.toString());
        items.push({
          id: Number(raw.id),
          asset: (ASSETS.find((a) => a === raw.asset) ?? "AE") as AssetOption,
          barrierUp: Number(raw.barrier_up),
          barrierDown: Number(raw.barrier_down),
          expiry: Number(raw.expiry),
          isRace: Boolean(raw.is_race),
          status: raw.status,
          totalUp,
          totalDown,
        });
      }
      setMarkets(items);
      if (!items.length) {
        setSelectedMarketId(null);
      } else if (!items.some((m) => m.id === selectedMarketId)) {
        setSelectedMarketId(items[0].id);
      }
      return items;
    } catch (error) {
      if (error instanceof Error) setErrorMessage(error.message);
      return [];
    } finally {
      setMarketsLoading(false);
    }
  }, [contractInstance, selectedMarketId]);

  useEffect(() => {
    if (!showApp) return;
    void loadMarkets();
  }, [showApp, loadMarkets]);

  useEffect(() => {
    void fetchAssetData(createForm.asset);
  }, [createForm.asset, fetchAssetData]);

  useEffect(() => {
    if (!selectedMarket) return;
    void fetchAssetData(selectedMarket.asset);
  }, [selectedMarket, fetchAssetData]);

  useEffect(() => {
    if (!autoBarriers) return;
    const data = assetData[createForm.asset];
    if (!data) return;
    const suggestions = computeSuggestedBarriers(data.price, createForm.isRace);
    setCreateForm((prev) => {
      const nextDuration = prev.duration === "" ? DURATION_OPTIONS[2].blocks.toString() : prev.duration;
      if (
        prev.barrierUp === suggestions.up.toString() &&
        prev.barrierDown === suggestions.down.toString() &&
        prev.duration === nextDuration
      ) {
        return prev;
      }
      return {
        ...prev,
        barrierUp: suggestions.up.toString(),
        barrierDown: suggestions.down.toString(),
        duration: nextDuration,
      };
    });
  }, [autoBarriers, assetData, createForm.asset, createForm.isRace, computeSuggestedBarriers]);

  useEffect(() => {
    if (!markets.length) return;
    const uniqueAssets = Array.from(new Set(markets.map((market) => market.asset)));
    uniqueAssets.forEach((asset) => {
      void fetchAssetData(asset);
    });
  }, [markets, fetchAssetData]);

  const guardConnection = useCallback(() => {
    if (!address) {
      setErrorMessage("Connect your wallet to continue.");
      return false;
    }
    if (networkId !== network.id) {
      setErrorMessage(`Switch to network ${network.id} in your wallet.`);
      return false;
    }
    if (!contractInstance) {
      setErrorMessage("Contract not ready yet. Please wait.");
      return false;
    }
    return true;
  }, [address, networkId, contractInstance]);

  const handleBarrierChange = (field: "barrierUp" | "barrierDown") => (
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    setAutoBarriers(false);
    setCreateForm((prev) => ({ ...prev, [field]: event.target.value }));
  };

  const handleUseSuggestedBarriers = () => {
    const data = assetData[createForm.asset];
    if (!data) return;
    const suggestions = computeSuggestedBarriers(data.price, createForm.isRace);
    setAutoBarriers(true);
    setCreateForm((prev) => ({
      ...prev,
      barrierUp: suggestions.up.toString(),
      barrierDown: suggestions.down.toString(),
    }));
  };

  const handleLaunchApp = () => {
    setShowApp(true);
    setViewMode("discover");
  };

  const handleConnectWallet = useCallback(async () => {
    setErrorMessage(undefined);
    setSuccessMessage(undefined);
    try {
      setIsConnecting(true);
      setConnectionMessage("Connecting to wallet…");
      await connectToWallet();
      setConnectionMessage(undefined);
    } catch (error) {
      if (error instanceof Error) {
        setConnectionMessage(error.message);
      } else {
        setConnectionMessage("Unable to connect to wallet");
      }
    } finally {
      setIsConnecting(false);
    }
  }, [connectToWallet]);

  const handleDisconnectWallet = useCallback(() => {
    setErrorMessage(undefined);
    setSuccessMessage(undefined);
    disconnectWallet();
    setConnectionMessage(undefined);
    setIsConnecting(false);
    setBalance("—");
    setContractInstance(undefined);
    setMarkets([]);
    setSelectedMarketId(null);
    setViewMode("discover");
  }, [disconnectWallet]);

  const handleSelectMarket = (marketId: number) => {
    setSelectedMarketId(marketId);
    setViewMode("market");
  };

  const handleBackToDiscover = () => {
    setViewMode("discover");
  };

  const handleQuickAmount = (value: number) => {
    setBetForm((prev) => ({ ...prev, amount: value.toString() }));
  };

  const handleCreateMarket = async () => {
    setErrorMessage(undefined);
    setSuccessMessage(undefined);
    if (!guardConnection() || !isOwner) return;
    try {
      let barrierUp = Number(createForm.barrierUp);
      let barrierDown = Number(createForm.barrierDown);
      const duration = Number(createForm.duration);

      if (autoBarriers) {
        const data = createAssetData ?? (await fetchAssetData(createForm.asset));
        if (!data) {
          throw new Error("Price feed unavailable for selected asset.");
        }
        const suggestions = computeSuggestedBarriers(data.price, createForm.isRace);
        barrierUp = suggestions.up;
        barrierDown = suggestions.down;
      }

      if (Number.isNaN(barrierUp) || barrierUp <= 0) {
        throw new Error("Barrier up must be positive.");
      }
      if (createForm.isRace && (Number.isNaN(barrierDown) || barrierDown <= 0)) {
        throw new Error("Barrier down must be positive for race markets.");
      }
      if (!createForm.isRace && Number.isNaN(barrierDown)) {
        throw new Error("Barrier down is required.");
      }
      if (Number.isNaN(duration) || duration <= 0) {
        throw new Error("Duration must be a positive number of blocks.");
      }

      setPendingAction("create-market");
      await contractInstance.methods.createMarket(
        createForm.asset,
        barrierUp,
        barrierDown,
        duration,
        createForm.isRace,
      );
      const items = await loadMarkets();
      if (items.length) {
        const latest = items[items.length - 1]?.id;
        if (latest != null) {
          setSelectedMarketId(latest);
        }
      }
      setCreateForm(defaultCreateForm);
      setAutoBarriers(true);
      setSuccessMessage("Market created.");
    } catch (error) {
      if (error instanceof Error) setErrorMessage(error.message);
    } finally {
      setPendingAction(null);
    }
  };

  const handlePlaceBet = async () => {
    setErrorMessage(undefined);
    setSuccessMessage(undefined);
    if (!guardConnection() || !selectedMarket) return;
    try {
      const amount = toAettos(betForm.amount);
      setPendingAction("place-bet");
      await contractInstance.methods.placeBet(selectedMarket.id, betForm.onUp, {
        amount,
      });
      setBetForm((prev) => ({ ...prev, amount: "" }));
      setSuccessMessage("Bet placed successfully.");
      await loadMarkets();
    } catch (error) {
      if (error instanceof Error) setErrorMessage(error.message);
    } finally {
      setPendingAction(null);
    }
  };

  const handleRequestOracle = async () => {
    setErrorMessage(undefined);
    setSuccessMessage(undefined);
    if (!guardConnection() || !isOwner || !selectedMarket) return;
    try {
      const asset = selectedMarket.asset ?? "AE";
      const payload = `${asset}/USD`;
      setPendingAction("request-oracle");
      await contractInstance.methods.requestOraclePrice(
        selectedMarket.id,
        payload,
        {
          amount: contracts.oracleQueryFee,
        },
      );
      setSuccessMessage("Oracle request submitted. Responder will settle soon.");
    } catch (error) {
      if (error instanceof Error) setErrorMessage(error.message);
    } finally {
      setPendingAction(null);
    }
  };

  const handleClaimPayout = async () => {
    setErrorMessage(undefined);
    setSuccessMessage(undefined);
    if (!guardConnection() || !selectedMarket) return;
    try {
      setPendingAction("claim");
      await contractInstance.methods.claimPayout(selectedMarket.id);
      setSuccessMessage("Claim transaction sent.");
      await loadMarkets();
    } catch (error) {
      if (error instanceof Error) setErrorMessage(error.message);
    } finally {
      setPendingAction(null);
    }
  };

  const assetLabel = (marketId: number | null) => {
    if (marketId == null) return "AE";
    const market = markets.find((m) => m.id === marketId);
    return market?.asset ?? "AE";
  };

  if (!showApp) {
    return (
      <div className="landing">
        <header className="landing-nav">
          <span className="brand">AERace</span>
          <button className="launch-button" onClick={handleLaunchApp}>
            Launch App
          </button>
        </header>
        <main className="hero">
          <div className="hero-copy">
            <h1>
              Trade the instant
              <br /> markets breach your line.
            </h1>
            <p>
              AERace lets you launch price-touch and race markets with oracle
              settlement, live odds, and pro-grade visuals—built for serious
              traders on æternity.
            </p>
            <div className="hero-actions">
              <button className="launch-button" onClick={handleLaunchApp}>
                Launch Trading Interface
              </button>
              <a
                className="secondary-link"
                href="https://github.com/aeternity"
                target="_blank"
                rel="noreferrer"
              >
                View Docs
              </a>
            </div>
            <div className="hero-stats">
              <div>
                <span className="stat">≤ 0.2s</span>
                <span className="label">Settlement</span>
              </div>
              <div>
                <span className="stat">1</span>
                <span className="label">Tap settlement</span>
              </div>
              <div>
                <span className="stat">∞</span>
                <span className="label">Asset markets</span>
              </div>
            </div>
          </div>
          <div className="hero-visual">
            <div className="orb" />
            <div className="glow" />
            <div className="card-preview">
              <span className="tiny-pill">Live preview</span>
              <h3>AERace Barrier Market</h3>
              <p>Asset AE/USD • barrier ±5% • 24h horizon</p>
            </div>
          </div>
        </main>
        <section className="features">
          <article>
            <h3>Oracle-first</h3>
            <p>
              Tie each market to automated price feeds with TTL management and
              real-time settlement flows.
            </p>
          </article>
          <article>
            <h3>Trader centric</h3>
            <p>
              Dynamic odds, liquidity incentives, and polished UI components
              inspired by leading prediction venues.
            </p>
          </article>
          <article>
            <h3>Composable rails</h3>
            <p>
              Open Sophia contracts + SDK tooling let you plug AERace into any
              analytics, NFT, or DAO layer out of the box.
            </p>
          </article>
        </section>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <header className="top-bar">
        <div className="top-bar-primary">
          <h1>AERace Markets</h1>
          <p className="tagline">Discovery-driven barrier options on æternity</p>
          <div className="view-tabs">
            <button
              type="button"
              className={`tab ${viewMode === "discover" ? "active" : ""}`}
              onClick={() => setViewMode("discover")}
            >
              Discover
            </button>
            <button
              type="button"
              className={`tab ${viewMode === "market" ? "active" : ""}`}
              onClick={() => {
                if (selectedMarketId) setViewMode("market");
              }}
              disabled={!selectedMarketId}
            >
              Market
            </button>
          </div>
        </div>
        <div className="wallet-info">
          {connectionMessage ? (
            <p className="warning">{connectionMessage}</p>
          ) : (
            <>
              <p>
                Wallet: <span className="mono">{address ?? "—"}</span>
              </p>
              <p>
                Balance: <strong>{balance}</strong> AE
              </p>
              <p>Network: {networkId ?? "—"}</p>
            </>
          )}
          <div className="wallet-actions">
            {!isWalletConnected ? (
              <button
                className="connect-button"
                onClick={() => void handleConnectWallet()}
                disabled={isConnecting}
              >
                {isConnecting ? "Connecting…" : "Connect Wallet"}
              </button>
            ) : (
              <button className="disconnect-button" onClick={handleDisconnectWallet}>
                Disconnect
              </button>
            )}
          </div>
        </div>
      </header>

      {viewMode === "discover" && (
        <main className="discover-layout">
          <section className="discover-header">
            <div>
              <h2>Explore live barrier markets</h2>
              <p>Curated race and touch plays with oracle settlement and pooled liquidity.</p>
              <div className="discover-stats">
                <span>
                  {markets.length} {markets.length === 1 ? "market" : "markets"}
                </span>
                <span>
                  {uniqueAssetCount} {uniqueAssetCount === 1 ? "asset" : "assets"}
                </span>
              </div>
            </div>
            <div className="discover-actions">
              <button
                type="button"
                className="refresh-button"
                onClick={() => void loadMarkets()}
                disabled={marketsLoading}
              >
                {marketsLoading ? "Refreshing…" : "Refresh"}
              </button>
            </div>
          </section>

          <ul className="discover-grid">
            {markets.length ? (
              markets.map((market) => {
                const assetEntry = assetData[market.asset];
                const spot = assetEntry?.price ?? null;
                const series = assetEntry?.series ?? [];
                const hasSeries = series.length > 1;
                const change = hasSeries ? calcChangePercent(market.asset) : 0;
                const gradientId = `spark-${market.id}`;
                const changeLabel = hasSeries
                  ? `${change >= 0 ? "+" : ""}${change.toFixed(1)}%`
                  : "—";
                return (
                  <li key={market.id}>
                    <button
                      type="button"
                      className="discover-card"
                      onClick={() => handleSelectMarket(market.id)}
                    >
                      <div className="discover-card-top">
                        <div className="asset-meta">
                          <span className="asset-pill">{market.asset}</span>
                          {market.isRace && <span className="race-pill">Race</span>}
                        </div>
                        <span className={statusClass(market.status)}>
                          {STATUS_LABELS[market.status]}
                        </span>
                      </div>
                      <h3>#{market.id} · {market.asset} touch</h3>
                      <p className="expiry">
                        Touch {market.barrierDown} ↔ {market.barrierUp} · block {market.expiry}
                      </p>
                      <div className="discover-price-line">
                        <span className="spot">
                          {spot ? `$${spot.toFixed(2)}` : "Loading…"}
                        </span>
                        <span className={`change ${change >= 0 ? "up" : "down"}`}>
                          {changeLabel}
                        </span>
                      </div>
                      <div className="sparkline">
                        {hasSeries ? (
                          <ResponsiveContainerComponent width="100%" height={60}>
                            <AreaChartComponent data={series}>
                              <defs>
                                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.6} />
                                  <stop offset="100%" stopColor="var(--accent)" stopOpacity={0.05} />
                                </linearGradient>
                              </defs>
                              <XAxisComponent dataKey="time" hide />
                              <YAxisComponent hide domain={["auto", "auto"]} />
                              <TooltipComponent content={<PriceTooltip />} />
                              <AreaComponent
                                type="monotone"
                                dataKey="value"
                                stroke="var(--accent)"
                                strokeWidth={2}
                                fill={`url(#${gradientId})`}
                              />
                            </AreaChartComponent>
                          </ResponsiveContainerComponent>
                        ) : (
                          <div className="sparkline-empty">Price sample pending…</div>
                        )}
                      </div>
                      <div className="pool-line">
                        <span>Up pool {formatAe(market.totalUp)} AE</span>
                        <span>Down pool {formatAe(market.totalDown)} AE</span>
                      </div>
                    </button>
                  </li>
                );
              })
            ) : (
              <li className="discover-empty">
                No markets yet. Owners can launch one below.
              </li>
            )}
          </ul>

          {isOwner && (
            <section className="create-market-section">
              <h2>Launch a market</h2>
              <div className="form create-form">
                <div className="field-group">
                  <label htmlFor="asset">Asset</label>
                  <select
                    id="asset"
                    value={createForm.asset}
                    onChange={(event) =>
                      setCreateForm((prev) => ({
                        ...prev,
                        asset: event.target.value as AssetOption,
                      }))
                    }
                  >
                    {ASSETS.map((asset) => (
                      <option key={asset} value={asset}>
                        {asset}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field-group price-row">
                  <div>
                    <span className="label">Spot price</span>
                    <div className="spot-line">
                      {priceLoading ? (
                        <span className="spot-value">Loading…</span>
                      ) : createAssetData ? (
                        <span className="spot-value">
                          ${createAssetData.price.toFixed(2)}
                        </span>
                      ) : (
                        <span className="spot-value">No data</span>
                      )}
                      <button
                        type="button"
                        className="refresh-price"
                        onClick={() => void fetchAssetData(createForm.asset, true)}
                      >
                        Refresh
                      </button>
                    </div>
                    {priceError && <p className="hint error-text">{priceError}</p>}
                  </div>
                  <label className="auto-toggle">
                    <input
                      type="checkbox"
                      checked={autoBarriers}
                      onChange={(event) => setAutoBarriers(event.target.checked)}
                    />
                    Auto barriers
                  </label>
                </div>
                <div className="field-group">
                  <label htmlFor="barrier-up">Barrier Up</label>
                  <input
                    id="barrier-up"
                    type="number"
                    value={createForm.barrierUp}
                    disabled={autoBarriers}
                    onChange={handleBarrierChange("barrierUp")}
                  />
                </div>
                <div className="field-group">
                  <label htmlFor="barrier-down">Barrier Down</label>
                  <input
                    id="barrier-down"
                    type="number"
                    value={createForm.barrierDown}
                    disabled={autoBarriers}
                    onChange={handleBarrierChange("barrierDown")}
                  />
                </div>
                <button
                  type="button"
                  className="secondary-link use-suggested"
                  onClick={handleUseSuggestedBarriers}
                >
                  Use suggested range
                </button>
                <div className="field-group">
                  <label htmlFor="duration">Duration</label>
                  <select
                    id="duration"
                    value={createForm.duration}
                    onChange={(event) =>
                      setCreateForm((prev) => ({
                        ...prev,
                        duration: event.target.value,
                      }))
                    }
                  >
                    {DURATION_OPTIONS.map((option) => (
                      <option key={option.blocks} value={option.blocks}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={createForm.isRace}
                    onChange={(event) =>
                      setCreateForm((prev) => ({
                        ...prev,
                        isRace: event.target.checked,
                      }))
                    }
                  />
                  Race market (requires both barriers)
                </label>
                <p className="hint">
                  Rake: {rakePercentLabel}% goes to the house on each settlement.
                </p>
                <button
                  onClick={handleCreateMarket}
                  disabled={pendingAction === "create-market" || !isOwner}
                >
                  {pendingAction === "create-market"
                    ? "Creating…"
                    : "Create Market"}
                </button>
                {!isOwner && (
                  <p className="hint">Only the owner can create markets.</p>
                )}
              </div>

              <div className="info">
                <h3>Oracle</h3>
                <p>
                  Oracle ID:
                  <span className="mono"> {contracts.oracleId}</span>
                </p>
                <p>Query fee: {Number(contracts.oracleQueryFee) / 1e18} AE</p>
                <p className="hint">
                  Keep `oracleResponder.js` running so price requests are settled automatically.
                </p>
              </div>
            </section>
          )}
        </main>
      )}

      {viewMode === "market" && (
        <main className="market-layout">
          {!selectedMarket ? (
            <p className="empty detail-empty">Pick a market from Discover.</p>
          ) : (
            <>
              <div className="market-nav">
                <button
                  type="button"
                  className="back-button"
                  onClick={handleBackToDiscover}
                >
                  ← Back to Discover
                </button>
                <span className={statusClass(selectedMarket.status)}>
                  {STATUS_LABELS[selectedMarket.status]}
                </span>
              </div>

              <div className="market-summary">
                <div className="market-identity">
                  <span className="asset-pill large">{selectedMarket.asset}</span>
                  <div>
                    <h2>{selectedMarket.asset}/USD barrier market</h2>
                    <p>
                      Touch range {selectedMarket.barrierDown} – {selectedMarket.barrierUp} · block {selectedMarket.expiry}
                    </p>
                  </div>
                </div>
                <div className="market-metrics">
                  <div>
                    <span className="label">Spot</span>
                    <strong>{selectedSpot ? `$${selectedSpot.toFixed(2)}` : "Loading…"}</strong>
                  </div>
                  <div>
                    <span className="label">24h change</span>
                    <strong className={selectedChangePercent >= 0 ? "up" : "down"}>
                      {selectedSeries.length > 1
                        ? `${selectedChangePercent >= 0 ? "+" : ""}${selectedChangePercent.toFixed(2)}%`
                        : "—"}
                    </strong>
                  </div>
                  <div>
                    <span className="label">Pool</span>
                    <strong>{poolAe.toFixed(3)} AE</strong>
                  </div>
                </div>
              </div>

              <section className="market-content">
                <div className="chart-column">
                  <div className="chart-card">
                    <div className="chart-header">
                      <div>
                        <h3>{selectedMarket.asset}/USD</h3>
                        <p>
                          {selectedSpot ? `Spot $${selectedSpot.toFixed(2)}` : "Fetching spot…"} · {selectedSeries.length} points
                        </p>
                      </div>
                      <button
                        type="button"
                        className="refresh-price"
                        onClick={() => void fetchAssetData(selectedMarket.asset, true)}
                      >
                        Refresh
                      </button>
                    </div>
                    {selectedSeries.length > 1 ? (
                      <ResponsiveContainerComponent width="100%" height={280}>
                        <AreaChartComponent data={selectedSeries}>
                          <defs>
                            <linearGradient id="detailGradient" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.6} />
                              <stop offset="100%" stopColor="var(--accent)" stopOpacity={0.05} />
                            </linearGradient>
                          </defs>
                          <XAxisComponent dataKey="time" />
                          <YAxisComponent domain={["auto", "auto"]} />
                          <TooltipComponent content={<PriceTooltip />} />
                          <AreaComponent
                            type="monotone"
                            dataKey="value"
                            stroke="var(--accent)"
                            strokeWidth={2}
                            fill="url(#detailGradient)"
                          />
                        </AreaChartComponent>
                      </ResponsiveContainerComponent>
                    ) : (
                      <div className="sparkline-empty chart-empty">Waiting on price history…</div>
                    )}
                  </div>

                  <div className="outcome-card">
                    <div className="outcome-row">
                      <div>
                        <h4>Touch Up</h4>
                        <p>Barrier ≥ {selectedMarket.barrierUp}</p>
                      </div>
                      <div className="outcome-chance">
                        {poolAe > 0 ? `${yesPricePercent.toFixed(1)}%` : "—"}
                      </div>
                      <button
                        type="button"
                        className="outcome-buy yes"
                        onClick={() => setBetForm((prev) => ({ ...prev, onUp: true }))}
                      >
                        Buy Touch Up {poolAe > 0 ? `${yesPricePercent.toFixed(1)}¢` : ""}
                      </button>
                    </div>
                    <div className="outcome-row">
                      <div>
                        <h4>Touch Down</h4>
                        <p>Barrier ≤ {selectedMarket.barrierDown}</p>
                      </div>
                      <div className="outcome-chance">
                        {poolAe > 0 ? `${noPricePercent.toFixed(1)}%` : "—"}
                      </div>
                      <button
                        type="button"
                        className="outcome-buy no"
                        onClick={() => setBetForm((prev) => ({ ...prev, onUp: false }))}
                      >
                        Buy Touch Down {poolAe > 0 ? `${noPricePercent.toFixed(1)}¢` : ""}
                      </button>
                    </div>
                    <footer className="outcome-pools">
                      <span>Up pool {formatAe(selectedMarket.totalUp)} AE</span>
                      <span>Down pool {formatAe(selectedMarket.totalDown)} AE</span>
                    </footer>
                  </div>
                </div>

                <aside className="trade-card">
                  <h3>Place a trade</h3>
                  <div className="trade-toggle">
                    <button
                      type="button"
                      className={`toggle ${betForm.onUp ? "active" : ""}`}
                      onClick={() => setBetForm((prev) => ({ ...prev, onUp: true }))}
                    >
                      Touch Up
                      <span>{poolAe > 0 ? `${yesPricePercent.toFixed(1)}¢` : "—"}</span>
                    </button>
                    <button
                      type="button"
                      className={`toggle ${!betForm.onUp ? "active" : ""}`}
                      onClick={() => setBetForm((prev) => ({ ...prev, onUp: false }))}
                    >
                      Touch Down
                      <span>{poolAe > 0 ? `${noPricePercent.toFixed(1)}¢` : "—"}</span>
                    </button>
                  </div>
                  <label className="label" htmlFor="bet-amount">
                    Stake (AE)
                  </label>
                  <input
                    id="bet-amount"
                    type="number"
                    min="0"
                    step="0.01"
                    value={betForm.amount}
                    onChange={(event) =>
                      setBetForm((prev) => ({
                        ...prev,
                        amount: event.target.value,
                      }))
                    }
                  />
                  <div className="quick-amounts">
                    {QUICK_AMOUNTS.map((amount) => (
                      <button
                        key={amount}
                        type="button"
                        onClick={() => handleQuickAmount(amount)}
                      >
                        +{amount}
                      </button>
                    ))}
                  </div>
                  <div className="trade-meta">
                    <span className="label">Potential payout</span>
                    <strong>
                      {potentialPayout > 0 ? `${potentialPayout.toFixed(3)} AE` : "—"}
                    </strong>
                  </div>
                  <button
                    type="button"
                    onClick={handlePlaceBet}
                    disabled={pendingAction === "place-bet" || !betForm.amount}
                  >
                    {pendingAction === "place-bet" ? "Submitting…" : "Trade"}
                  </button>
                  <p className="trade-note">
                    By trading, you supply AE liquidity. Pools rebalance when the oracle closes the market.
                  </p>
                </aside>
              </section>

              <section className="market-actions">
                <div className="form action-card">
                  <h3>Claim payout</h3>
                  <p className="hint">
                    Available after the oracle settles and your position wins.
                  </p>
                  <button
                    type="button"
                    onClick={handleClaimPayout}
                    disabled={pendingAction === "claim"}
                  >
                    {pendingAction === "claim" ? "Submitting…" : "Claim"}
                  </button>
                </div>

                {isOwner && (
                  <div className="form action-card">
                    <h3>Oracle request</h3>
                    <p className="hint">
                      Payload: {assetLabel(selectedMarket.id)}/USD — responder will use this to fetch price data.
                    </p>
                    <button
                      type="button"
                      onClick={handleRequestOracle}
                      disabled={pendingAction === "request-oracle"}
                    >
                      {pendingAction === "request-oracle" ? "Requesting…" : "Trigger Oracle"}
                    </button>
                  </div>
                )}
              </section>
            </>
          )}
        </main>
      )}

      {(errorMessage || successMessage) && (
        <div className="toast">
          {errorMessage && <p className="error">{errorMessage}</p>}
          {successMessage && <p className="success">{successMessage}</p>}
          <button
            className="toast-close"
            onClick={() => {
              setErrorMessage(undefined);
              setSuccessMessage(undefined);
            }}
          >
            ×
          </button>
        </div>
      )}

      {isConnecting && <div className="overlay" />}
    </div>
  );
};

export default App;
