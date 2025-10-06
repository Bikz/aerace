import { promises as fs } from "fs";
import {
  AeSdk,
  AccountMemory,
  CompilerHttp,
  Contract,
  Node,
  getFileSystem,
} from "@aeternity/aepp-sdk";

const BARRIER_SOURCE = "./contracts/BarrierOptions.aes";
const PRICE_SCALE = 100000;
const NODE_URL = process.env.AE_NODE_URL ?? "https://testnet.aeternity.io";
const COMPILER_URL = process.env.AE_COMPILER_URL ?? "https://v8.compiler.aepps.com";
const SECRET_KEY = process.env.DEPLOYER_SECRET_KEY;
const BARRIER_CONTRACT_ADDRESS =
  process.env.BARRIER_CONTRACT_ADDRESS ?? "ct_FR2TH3KW7Xb1Wc9Sw58S4oXnmU87QrqZRdbXHErGHPGYXHZNb";

const DEMO_CONFIG = {
  asset: "AE",
  barrierUp: Math.round(0.023 * PRICE_SCALE),
  barrierDown: Math.round(0.021 * PRICE_SCALE),
  duration: 20, // ~1 minute at 3s blocks
  isRace: false,
};

async function loadContract() {
  if (!SECRET_KEY) {
    throw new Error("DEPLOYER_SECRET_KEY env var is required");
  }

  const node = new Node(NODE_URL);
  const account = new AccountMemory(SECRET_KEY);
  const aeSdk = new AeSdk({
    nodes: [{ name: "target-node", instance: node }],
    accounts: [account],
    onCompiler: new CompilerHttp(COMPILER_URL),
  });

  const fileSystem = await getFileSystem(BARRIER_SOURCE);
  const sourceCode = await fs.readFile(BARRIER_SOURCE, "utf-8");

  const contract = await Contract.initialize({
    ...aeSdk.getContext(),
    sourceCode,
    fileSystem,
    address: BARRIER_CONTRACT_ADDRESS,
  });

  return { contract, account };
}

async function createDemoMarket(contract, account) {
  const counter = await contract.getMarketCounter();
  console.log(`Current market counter: ${counter.decodedResult}`);
  console.log("Creating demo market...");
  const tx = await contract.createMarket(
    DEMO_CONFIG.asset,
    DEMO_CONFIG.barrierUp,
    DEMO_CONFIG.barrierDown,
    DEMO_CONFIG.duration,
    DEMO_CONFIG.isRace,
    { onAccount: account },
  );
  console.log(`  tx hash: ${tx.hash}`);

  const newCounter = await contract.getMarketCounter();
  console.log(`Updated market counter: ${newCounter.decodedResult}`);
  return Number(newCounter.decodedResult ?? 0);
}

async function seedLiquidity(contract, account, marketId) {
  const upAmount = BigInt("500000000000000000"); // 0.5 AE
  const downAmount = BigInt("500000000000000000");
  console.log(`Seeding ${upAmount / 10n ** 18n} AE on Touch Up for market #${marketId}...`);
  const resultUp = await contract.placeBet(marketId, true, {
    onAccount: account,
    amount: upAmount,
  });
  console.log(`  up tx hash: ${resultUp.hash}`);
  console.log(`Seeding ${downAmount / 10n ** 18n} AE on Touch Down for market #${marketId}...`);
  const resultDown = await contract.placeBet(marketId, false, {
    onAccount: account,
    amount: downAmount,
  });
  console.log(`  down tx hash: ${resultDown.hash}`);
}

async function main() {
  const { contract, account } = await loadContract();
  const marketCount = await createDemoMarket(contract, account);

  try {
    await seedLiquidity(contract, account, marketCount);
  } catch (error) {
    console.warn("Unable to seed liquidity (maybe already seeded?):", error.message ?? error);
  }

  console.log("Demo market ready.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Failed to bootstrap demo market:", error);
    process.exit(1);
  });
