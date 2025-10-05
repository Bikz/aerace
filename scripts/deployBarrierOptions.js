import { promises as fs } from "fs";
import {
  AeSdk,
  AccountMemory,
  CompilerHttp,
  Contract,
  Node,
  getFileSystem,
} from "@aeternity/aepp-sdk";

const CONTRACT_PATH = process.env.CONTRACT_PATH ?? "./contracts/BarrierOptions.aes";
const NODE_URL = process.env.AE_NODE_URL ?? "https://testnet.aeternity.io";
const COMPILER_URL = process.env.AE_COMPILER_URL ?? "https://v8.compiler.aepps.com";
const SECRET_KEY = process.env.DEPLOYER_SECRET_KEY;

async function loadContractSource(path) {
  return fs.readFile(path, "utf-8");
}

async function deploy() {
  if (!SECRET_KEY) {
    throw new Error("DEPLOYER_SECRET_KEY env var is required");
  }

  const sourceCode = await loadContractSource(CONTRACT_PATH);

  const node = new Node(NODE_URL);
  const account = new AccountMemory(SECRET_KEY);
  const aeSdk = new AeSdk({
    nodes: [{ name: "target-node", instance: node }],
    accounts: [account],
    onCompiler: new CompilerHttp(COMPILER_URL),
  });

  const fileSystem = await getFileSystem(CONTRACT_PATH);
  const contract = await Contract.initialize({
    ...aeSdk.getContext(),
    sourceCode,
    fileSystem,
  });

  console.log("Compiling BarrierOptions...");
  await contract.$compile();

  console.log("Deploying BarrierOptions...");
  const deployInfo = await contract.$deploy([], {
    onAccount: account,
  });

  console.log("Deployment successful");
  console.log(`  contract address: ${deployInfo.address}`);
  console.log(`  owner account: ${account.address}`);
  console.log(`  tx hash: ${deployInfo.transaction}`);

  return deployInfo.address;
}

deploy()
  .then((address) => {
    console.log("BarrierOptions deployed at", address);
    process.exit(0);
  })
  .catch((error) => {
    console.error("Failed to deploy BarrierOptions:", error);
    process.exit(1);
  });
