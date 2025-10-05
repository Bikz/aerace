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
const CONTRACT_ADDRESS = process.env.BARRIER_CONTRACT_ADDRESS;
const ORACLE_ID = process.env.PRICE_ORACLE_ID;
const QUERY_FEE = BigInt(process.env.ORACLE_QUERY_FEE ?? "1000000000000000");
const QUERY_TTL = parseInt(process.env.ORACLE_QUERY_TTL ?? "500", 10);
const RESPONSE_TTL = parseInt(process.env.ORACLE_RESPONSE_TTL ?? "250", 10);
const NODE_URL = process.env.AE_NODE_URL ?? "https://testnet.aeternity.io";
const COMPILER_URL = process.env.AE_COMPILER_URL ?? "https://v8.compiler.aepps.com";
const SECRET_KEY = process.env.DEPLOYER_SECRET_KEY;

function validateEnvironment() {
  if (!CONTRACT_ADDRESS) {
    throw new Error("BARRIER_CONTRACT_ADDRESS env var is required");
  }
  if (!ORACLE_ID) {
    throw new Error("PRICE_ORACLE_ID env var is required");
  }
  if (QUERY_FEE <= 0n) {
    throw new Error("ORACLE_QUERY_FEE must be > 0");
  }
  if (Number.isNaN(QUERY_TTL) || QUERY_TTL <= 0) {
    throw new Error("ORACLE_QUERY_TTL must be a positive integer");
  }
  if (Number.isNaN(RESPONSE_TTL) || RESPONSE_TTL <= 0) {
    throw new Error("ORACLE_RESPONSE_TTL must be a positive integer");
  }
}

async function configureOracle() {
  validateEnvironment();

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

  const barrierContract = await Contract.initialize({
    ...aeSdk.getContext(),
    sourceCode,
    fileSystem,
    address: CONTRACT_ADDRESS,
  });

  const tx = await barrierContract.configureOracle(
    ORACLE_ID,
    QUERY_FEE,
    QUERY_TTL,
    RESPONSE_TTL,
    {
      onAccount: account,
    }
  );

  console.log("BarrierOptions oracle configured");
  console.log(`  tx hash: ${tx.hash}`);
  console.log(`  oracle id: ${ORACLE_ID}`);
  console.log(`  query fee: ${QUERY_FEE}`);
  console.log(`  query ttl: ${QUERY_TTL}`);
  console.log(`  response ttl: ${RESPONSE_TTL}`);
}

configureOracle()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Failed to configure BarrierOptions oracle:", error);
    process.exit(1);
  });
