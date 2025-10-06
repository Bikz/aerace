import { promises as fs } from "fs";
import {
  AeSdk,
  AccountMemory,
  CompilerHttp,
  Contract,
  Node,
  getFileSystem,
} from "@aeternity/aepp-sdk";

const NODE_URL = process.env.AE_NODE_URL ?? "https://testnet.aeternity.io";
const COMPILER_URL = process.env.AE_COMPILER_URL ?? "https://v7.compiler.aepps.com";
const SECRET_KEY = process.env.DEPLOYER_SECRET_KEY;
const ORACLE_CONTRACT = process.env.ORACLE_CONTRACT_ADDRESS;
const BARRIER_CONTRACT = process.env.BARRIER_CONTRACT_ADDRESS;
const ORACLE_EXTEND_TTL = parseInt(process.env.ORACLE_EXTEND_TTL ?? "200", 10);
const POLL_INTERVAL_MS = parseInt(process.env.ORACLE_POLL_INTERVAL ?? "10000", 10);

if (!SECRET_KEY) {
  throw new Error("DEPLOYER_SECRET_KEY env var is required");
}
if (!ORACLE_CONTRACT) {
  throw new Error("ORACLE_CONTRACT_ADDRESS env var is required");
}
if (!BARRIER_CONTRACT) {
  throw new Error("BARRIER_CONTRACT_ADDRESS env var is required");
}

function variantValue(option) {
  if (option === "None" || option == null) return undefined;
  if (Array.isArray(option)) {
    const [tag, value] = option;
    if (tag === "Some") return value;
    return option;
  }
  return option;
}

const COINGECKO_PRICE_URL =
  "https://api.coingecko.com/api/v3/simple/price?ids=aeternity&vs_currencies=usd";
const PRICE_SCALE = 100000;
const COINGECKO_API_KEY =
  process.env.COINGECKO_DEMO_API_KEY ??
  process.env.COINGECKO_API_KEY ??
  "CG-4t3P7yT5rUFYFz5JHTzuuDRg";

async function fetchPrice(payload) {
  const defaultPrice = Math.round(100 * PRICE_SCALE); // 100.00000
  try {
    const headers = COINGECKO_API_KEY
      ? { "x-cg-demo-api-key": COINGECKO_API_KEY }
      : undefined;
    const response = await fetch(COINGECKO_PRICE_URL, { headers });
    if (!response.ok) {
      console.warn("Price API response not ok", response.status);
      return defaultPrice;
    }
    const data = await response.json();
    const usd = data?.aeternity?.usd;
    if (typeof usd !== "number" || Number.isNaN(usd)) {
      return defaultPrice;
    }
    // scale to match frontend barrier precision (5 decimals)
    return Math.round(usd * PRICE_SCALE);
  } catch (error) {
    console.warn("Failed to fetch price", error);
    return defaultPrice;
  }
}

async function main() {
  const node = new Node(NODE_URL);
  const account = new AccountMemory(SECRET_KEY);
  const aeSdk = new AeSdk({
    nodes: [{ name: "target-node", instance: node }],
    accounts: [account],
    onCompiler: new CompilerHttp(COMPILER_URL),
  });

  const oracleSourcePath = "./contracts/ExchangeOracle.aes";
  const barrierSourcePath = "./contracts/BarrierOptions.aes";

  const oracleContract = await Contract.initialize({
    ...aeSdk.getContext(),
    sourceCode: await fs.readFile(oracleSourcePath, "utf-8"),
    fileSystem: await getFileSystem(oracleSourcePath),
    address: ORACLE_CONTRACT,
  });

  const barrierContract = await Contract.initialize({
    ...aeSdk.getContext(),
    sourceCode: await fs.readFile(barrierSourcePath, "utf-8"),
    fileSystem: await getFileSystem(barrierSourcePath),
    address: BARRIER_CONTRACT,
  });

  const processedQueries = new Set();
  let iteration = 0;

  const loop = async () => {
    iteration += 1;
    try {
      const counterCall = await barrierContract.getMarketCounter();
      const marketCount = Number(counterCall.decodedResult ?? 0);

      for (let id = 1; id <= marketCount; id += 1) {
        const queryCall = await barrierContract.getOracleQuery(id);
        const option = queryCall.decodedResult;
        const queryId = variantValue(option);
        if (!queryId || processedQueries.has(queryId)) {
          continue;
        }

        const price = await fetchPrice();
        console.log(
          `Responding to market ${id} query ${queryId} with price ${price}`,
        );

        await oracleContract.respond(queryId, price, {
          onAccount: account,
        });

        await barrierContract.checkMarketFromOracle(id, {
          onAccount: account,
        });

        processedQueries.add(queryId);
      }

      if (iteration % 10 === 0) {
        console.log("Extending oracle TTL...");
        await oracleContract.extend(ORACLE_EXTEND_TTL, {
          onAccount: account,
        });
      }
    } catch (error) {
      console.error("Responder loop error", error);
    }
  };

  await loop();
  setInterval(loop, POLL_INTERVAL_MS);
  console.log("Oracle responder started. Ctrl+C to exit.");
}

main().catch((error) => {
  console.error("Failed to start oracle responder:", error);
  process.exit(1);
});
