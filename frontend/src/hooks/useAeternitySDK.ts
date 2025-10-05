import {
  AeSdkAepp,
  BrowserWindowMessageConnection,
  CompilerHttp,
  Encoded,
  Node,
  SUBSCRIPTION_TYPES,
  walletDetector,
} from "@aeternity/aepp-sdk";
import { useCallback, useMemo, useState } from "react";

import network from "../configs/network";

/**
 * æternitySDK Hook
 */
const useAeternitySDK = () => {
  const [address, setAddress] = useState<Encoded.AccountAddress | undefined>();
  const [networkId, setNetworkId] = useState<string | undefined>();

  const aeSdk = useMemo(
    () =>
      new AeSdkAepp({
        name: "aerace-frontend",
        nodes: [{ name: network.id, instance: new Node(network.url) }],
        onCompiler: new CompilerHttp(network.compilerUrl),
        onAddressChange: ({ current }) => {
          setAddress(Object.keys(current)[0] as Encoded.AccountAddress);
        },
        onNetworkChange: ({ networkId: nextNetworkId }) => {
          setNetworkId(nextNetworkId);
        },
        onDisconnect: () => {
          setAddress(undefined);
          setNetworkId(undefined);
          console.log("Wallet disconnected");
        },
      }),
    [],
  );

  const connectToWallet = useCallback(async (): Promise<void> => {
    type HandleWallets = Parameters<typeof walletDetector>[1];
    // TODO: remove NonNullable after releasing https://github.com/aeternity/aepp-sdk-js/pull/1801
    type Wallet = NonNullable<Parameters<HandleWallets>[0]["newWallet"]>;

    const wallet = await new Promise<Wallet>((resolve) => {
      let stopScan: ReturnType<typeof walletDetector>;
      const handleWallets: HandleWallets = async ({ wallets, newWallet }) => {
        const nextWallet = newWallet || Object.values(wallets)[0];
        stopScan();
        resolve(nextWallet as Wallet);
      };
      const scannerConnection = new BrowserWindowMessageConnection();
      stopScan = walletDetector(scannerConnection, handleWallets);
    });

    await aeSdk.connectToWallet(await wallet.getConnection());
    await aeSdk.subscribeAddress(SUBSCRIPTION_TYPES.subscribe, "current");
    // TODO: remove after releasing https://github.com/aeternity/aepp-sdk-js/issues/1802
    aeSdk.onAddressChange({ current: { [aeSdk.address]: {} }, connected: {} });
  }, [aeSdk]);

  const disconnectWallet = useCallback(() => {
    try {
      aeSdk.disconnectWallet();
    } catch (error) {
      if (error instanceof Error) {
        console.warn("Wallet disconnect failed", error);
      }
    }
    setAddress(undefined);
    setNetworkId(undefined);
  }, [aeSdk]);

  return { aeSdk, connectToWallet, disconnectWallet, address, networkId };
};

export default useAeternitySDK;
