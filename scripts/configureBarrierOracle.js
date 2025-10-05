import { utils } from "@aeternity/aeproject";
import { Contract, getFileSystem } from "@aeternity/aepp-sdk";

const BARRIER_SOURCE = "./contracts/BarrierOptions.aes";
const CONTRACT_ADDRESS = process.env.BARRIER_CONTRACT_ADDRESS;
const ORACLE_ID = process.env.PRICE_ORACLE_ID;
const QUERY_FEE = BigInt(process.env.ORACLE_QUERY_FEE ?? "1000000000000000");
const QUERY_TTL = parseInt(process.env.ORACLE_QUERY_TTL ?? "500", 10);
const RESPONSE_TTL = parseInt(process.env.ORACLE_RESPONSE_TTL ?? "250", 10);

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

  const ownerAccount = utils.getDefaultAccounts()[0];
  const aeSdk = utils.getSdk({});
  const fileSystem = await getFileSystem(BARRIER_SOURCE);
  const sourceCode = utils.getContractContent(BARRIER_SOURCE);

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
      onAccount: ownerAccount,
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
