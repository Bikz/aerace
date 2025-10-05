import { promises as fs } from "fs";
import {
  AeSdk,
  AccountMemory,
  CompilerHttp,
  Contract,
  Node,
  getFileSystem,
} from "@aeternity/aepp-sdk";

const ORACLE_SOURCE = "./contracts/ExchangeOracle.aes";
const NODE_URL = process.env.AE_NODE_URL ?? "https://testnet.aeternity.io";
const COMPILER_URL = process.env.AE_COMPILER_URL ?? "https://v7.compiler.aepps.com";
const SECRET_KEY = process.env.DEPLOYER_SECRET_KEY;
const DEFAULT_FEE = BigInt(process.env.ORACLE_QUERY_FEE ?? "1000000000000000"); // 0.001 AE
const DEFAULT_TTL = parseInt(process.env.ORACLE_REGISTER_TTL ?? "500", 10);

async function deploy() {
  if (!SECRET_KEY) {
    throw new Error("DEPLOYER_SECRET_KEY env var is required");
  }
  if (DEFAULT_FEE <= 0n) {
    throw new Error("ORACLE_QUERY_FEE must be > 0");
  }
  if (Number.isNaN(DEFAULT_TTL) || DEFAULT_TTL <= 0) {
    throw new Error("ORACLE_REGISTER_TTL must be a positive integer");
  }

  const node = new Node(NODE_URL);
  const account = new AccountMemory(SECRET_KEY);
  const aeSdk = new AeSdk({
    nodes: [{ name: "target-node", instance: node }],
    accounts: [account],
    onCompiler: new CompilerHttp(COMPILER_URL),
  });

  const fileSystem = await getFileSystem(ORACLE_SOURCE);
  const sourceCode = await fs.readFile(ORACLE_SOURCE, "utf-8");

  const oracleContract = await Contract.initialize({
    ...aeSdk.getContext(),
    sourceCode,
    fileSystem,
  });

  console.log("Deploying ExchangeOracle...");
  const initResult = await oracleContract.init(DEFAULT_FEE, DEFAULT_TTL, {
    onAccount: account,
  });

  console.log("ExchangeOracle deployed");
  console.log(`  tx hash: ${initResult.hash}`);
  console.log(`  contract address: ${oracleContract.$options.address}`);

  const { decodedResult: oracleId } = await oracleContract.get_oracle();
  console.log(`  oracle id: ${oracleId}`);

  const { decodedResult: fee } = await oracleContract.query_fee();
  console.log(`  query fee: ${fee}`);

  const { decodedResult: ttl } = await oracleContract.ttl();
  console.log(`  ttl (blocks): ${ttl}`);

  return {
    contractAddress: oracleContract.$options.address,
    oracleId,
  };
}

deploy()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error("Failed to deploy ExchangeOracle:", error);
    process.exit(1);
  });
