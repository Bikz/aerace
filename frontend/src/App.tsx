import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AE_AMOUNT_FORMATS,
  Encoded,
  Tag,
} from "@aeternity/aepp-sdk";

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
  barrierUp: number;
  barrierDown: number;
  expiry: number;
  isRace: boolean;
  status: MarketStatus;
  totalUp: bigint;
  totalDown: bigint;
};

const AE_DECIMALS = 1_000_000_000_000_000_000n; // 1e18

const formatAe = (value: bigint) => {
  if (value === 0n) return "0";
  const integer = Number(value / AE_DECIMALS);
  const fraction = Number(value % AE_DECIMALS) / 1e18;
  return (integer + fraction).toFixed(3);
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

const emptyMarketView: MarketView | null = null;

const App = () => {
  const { aeSdk, connectToWallet, address, networkId } = useAeternitySDK();
  const [balance, setBalance] = useState<string>("loading...");
  const [isConnecting, setIsConnecting] = useState<boolean>(false);
  const [connectionMessage, setConnectionMessage] = useState<string | undefined>(
    undefined,
  );
  const [contractInstance, setContractInstance] = useState<any>();
  const [markets, setMarkets] = useState<MarketView[]>([]);
  const [marketsLoading, setMarketsLoading] = useState(false);
  const [selectedMarketId, setSelectedMarketId] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | undefined>();
  const [successMessage, setSuccessMessage] = useState<string | undefined>();
  const [createForm, setCreateForm] = useState({
    barrierUp: "",
    barrierDown: "",
    duration: "",
    isRace: false,
  });
  const [betForm, setBetForm] = useState({ amount: "", onUp: true });
  const [priceRequestPayload, setPriceRequestPayload] = useState("AE/USD");
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  const isOwner = useMemo(
    () =>
      address?.toLowerCase() === contracts.ownerAddress.toLowerCase(),
    [address],
  );

  const selectedMarket = useMemo(
    () => markets.find((m) => m.id === selectedMarketId) ?? emptyMarketView,
    [markets, selectedMarketId],
  );

  useEffect(() => {
    const init = async () => {
      try {
        setIsConnecting(true);
        setConnectionMessage("Searching for wallet...");
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
    };

    void init();
  }, [connectToWallet]);

  useEffect(() => {
    const loadBalance = async () => {
      if (!address || !networkId) return;
      if (networkId !== network.id) {
        setConnectionMessage(
          `Network "${networkId}" is not supported. Switch to ${network.id}.`,
        );
        return;
      }
      setConnectionMessage(undefined);
      const currentBalance = await aeSdk.getBalance(address, {
        format: AE_AMOUNT_FORMATS.AE,
      });
      setBalance(currentBalance);
    };

    void loadBalance();
  }, [aeSdk, address, networkId]);

  useEffect(() => {
    const loadContract = async () => {
      if (!address || !networkId || networkId !== network.id) return;
      try {
        const instance = await aeSdk.initializeContract({
          sourceCode: barrierOptionsSource,
          address: contracts.barrierAddress,
        });
        setContractInstance(instance);
      } catch (error) {
        if (error instanceof Error) {
          setErrorMessage(error.message);
        }
      }
    };

    void loadContract();
  }, [aeSdk, address, networkId]);

  const loadMarkets = useCallback(async () => {
    if (!contractInstance) return;
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
    } catch (error) {
      if (error instanceof Error) setErrorMessage(error.message);
    } finally {
      setMarketsLoading(false);
    }
  }, [contractInstance, selectedMarketId]);

  useEffect(() => {
    void loadMarkets();
  }, [loadMarkets]);

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

  const handleCreateMarket = async () => {
    setErrorMessage(undefined);
    setSuccessMessage(undefined);
    if (!guardConnection()) return;
    if (!isOwner) {
      setErrorMessage("Only the contract owner can create markets.");
      return;
    }
    try {
      const barrierUp = Number(createForm.barrierUp);
      const barrierDown = Number(createForm.barrierDown);
      const duration = Number(createForm.duration);
      if (Number.isNaN(barrierUp) || barrierUp <= 0) {
        throw new Error("Barrier up must be positive.");
      }
      if (createForm.isRace && (Number.isNaN(barrierDown) || barrierDown <= 0)) {
        throw new Error("Barrier down must be positive for race markets.");
      }
      if (!createForm.isRace) {
        // allow down barrier to be 0 in touch/no-touch markets
        if (Number.isNaN(barrierDown)) throw new Error("Barrier down is required.");
      }
      if (Number.isNaN(duration) || duration <= 0) {
        throw new Error("Duration must be a positive number of blocks.");
      }
      setPendingAction("create-market");
      await contractInstance.methods.createMarket(
        barrierUp,
        barrierDown,
        duration,
        createForm.isRace,
      );
      setCreateForm({ barrierUp: "", barrierDown: "", duration: "", isRace: false });
      setSuccessMessage("Market created. Refreshing...");
      await loadMarkets();
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
      setBetForm({ amount: "", onUp: betForm.onUp });
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
      setPendingAction("request-oracle");
      await contractInstance.methods.requestOraclePrice(
        selectedMarket.id,
        priceRequestPayload,
        {
          amount: contracts.oracleQueryFee,
        },
      );
      setSuccessMessage("Oracle price requested. Waiting for responder.");
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
      setSuccessMessage("Claim submitted. Updating markets...");
      await loadMarkets();
    } catch (error) {
      if (error instanceof Error) setErrorMessage(error.message);
    } finally {
      setPendingAction(null);
    }
  };

  return (
    <div className="app-shell">
      <header className="top-bar">
        <div>
          <h1>Barrier Options</h1>
          <p className="tagline">Real-time touch/no-touch markets on æternity</p>
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
        </div>
      </header>

      <main className="layout">
        <section className="panel markets">
          <div className="panel-header">
            <h2>Markets</h2>
            <button
              className="refresh-button"
              onClick={() => loadMarkets()}
              disabled={marketsLoading}
            >
              {marketsLoading ? "Refreshing…" : "Refresh"}
            </button>
          </div>
          {!markets.length && !marketsLoading && (
            <p className="empty">No markets yet. Owners can create one below.</p>
          )}
          <ul className="market-list">
            {markets.map((market) => (
              <li
                key={market.id}
                className={`market-card ${
                  selectedMarketId === market.id ? "selected" : ""
                }`}
                onClick={() => setSelectedMarketId(market.id)}
              >
                <div className={statusClass(market.status)}>
                  {STATUS_LABELS[market.status]}
                </div>
                <header>
                  <h3>Market #{market.id}</h3>
                  {market.isRace && <span className="race-pill">Race</span>}
                </header>
                <dl>
                  <div>
                    <dt>Barrier Up</dt>
                    <dd>{market.barrierUp}</dd>
                  </div>
                  <div>
                    <dt>Barrier Down</dt>
                    <dd>{market.barrierDown}</dd>
                  </div>
                  <div>
                    <dt>Expiry (block)</dt>
                    <dd>{market.expiry}</dd>
                  </div>
                </dl>
                <footer>
                  <span>Up Pool: {formatAe(market.totalUp)} AE</span>
                  <span>Down Pool: {formatAe(market.totalDown)} AE</span>
                </footer>
              </li>
            ))}
          </ul>
        </section>

        <section className="panel details">
          <h2>Market Details</h2>
          {selectedMarket ? (
            <>
              <div className="detail-grid">
                <div>
                  <span className="label">Status</span>
                  <span className={statusClass(selectedMarket.status)}>
                    {STATUS_LABELS[selectedMarket.status]}
                  </span>
                </div>
                <div>
                  <span className="label">Race</span>
                  <span>{selectedMarket.isRace ? "Yes" : "No"}</span>
                </div>
                <div>
                  <span className="label">Barrier Up</span>
                  <span>{selectedMarket.barrierUp}</span>
                </div>
                <div>
                  <span className="label">Barrier Down</span>
                  <span>{selectedMarket.barrierDown}</span>
                </div>
                <div>
                  <span className="label">Expiry (block)</span>
                  <span>{selectedMarket.expiry}</span>
                </div>
                <div>
                  <span className="label">Up Pool</span>
                  <span>{formatAe(selectedMarket.totalUp)} AE</span>
                </div>
                <div>
                  <span className="label">Down Pool</span>
                  <span>{formatAe(selectedMarket.totalDown)} AE</span>
                </div>
              </div>

              <div className="form">
                <h3>Place a Bet</h3>
                <div className="field-group">
                  <label htmlFor="bet-amount">Stake (AE)</label>
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
                </div>
                <div className="field-group inline">
                  <label>
                    <input
                      type="radio"
                      checked={betForm.onUp}
                      onChange={() => setBetForm({ ...betForm, onUp: true })}
                    />
                    Touch Up
                  </label>
                  <label>
                    <input
                      type="radio"
                      checked={!betForm.onUp}
                      onChange={() => setBetForm({ ...betForm, onUp: false })}
                    />
                    Touch Down / No-touch
                  </label>
                </div>
                <button
                  onClick={handlePlaceBet}
                  disabled={pendingAction === "place-bet" || !betForm.amount}
                >
                  {pendingAction === "place-bet" ? "Submitting…" : "Place Bet"}
                </button>
              </div>

              <div className="form">
                <h3>Claim Payout</h3>
                <p className="hint">
                  Available after the market settles and your side wins.
                </p>
                <button
                  onClick={handleClaimPayout}
                  disabled={pendingAction === "claim"}
                >
                  {pendingAction === "claim" ? "Submitting…" : "Claim"}
                </button>
              </div>

              {isOwner && (
                <div className="form">
                  <h3>Oracle Request</h3>
                  <label htmlFor="payload" className="label">
                    Payload (optional)
                  </label>
                  <input
                    id="payload"
                    value={priceRequestPayload}
                    onChange={(event) => setPriceRequestPayload(event.target.value)}
                  />
                  <button
                    onClick={handleRequestOracle}
                    disabled={pendingAction === "request-oracle"}
                  >
                    {pendingAction === "request-oracle"
                      ? "Requesting…"
                      : "Trigger Oracle"}
                  </button>
                  <p className="hint">
                    Requires {Number(contracts.oracleQueryFee) / 1e18} AE fee; ensure
                    the responder service is running.
                  </p>
                </div>
              )}
            </>
          ) : (
            <p className="empty">Select a market to view details.</p>
          )}
        </section>

        <aside className="panel owner">
          <h2>Create Market</h2>
          <div className="form">
            <div className="field-group">
              <label htmlFor="barrier-up">Barrier Up</label>
              <input
                id="barrier-up"
                type="number"
                value={createForm.barrierUp}
                onChange={(event) =>
                  setCreateForm((prev) => ({
                    ...prev,
                    barrierUp: event.target.value,
                  }))
                }
              />
            </div>
            <div className="field-group">
              <label htmlFor="barrier-down">Barrier Down</label>
              <input
                id="barrier-down"
                type="number"
                value={createForm.barrierDown}
                onChange={(event) =>
                  setCreateForm((prev) => ({
                    ...prev,
                    barrierDown: event.target.value,
                  }))
                }
              />
            </div>
            <div className="field-group">
              <label htmlFor="duration">Duration (blocks)</label>
              <input
                id="duration"
                type="number"
                value={createForm.duration}
                onChange={(event) =>
                  setCreateForm((prev) => ({
                    ...prev,
                    duration: event.target.value,
                  }))
                }
              />
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
            <p>
              Responder fee: {Number(contracts.oracleQueryFee) / 1e18} AE
            </p>
          </div>
        </aside>
      </main>

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
