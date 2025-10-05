import { utils } from "@aeternity/aeproject";
import { Contract, getFileSystem } from "@aeternity/aepp-sdk";

const ORACLE_SOURCE = "./contracts/ExchangeOracle.aes";
const DEFAULT_FEE = BigInt(process.env.ORACLE_QUERY_FEE ?? "1000000000000000"); // 0.001 AE
const DEFAULT_TTL = parseInt(process.env.ORACLE_REGISTER_TTL ?? "500", 10);

async function deploy() {
  if (DEFAULT_FEE <= 0n) {
    throw new Error("ORACLE_QUERY_FEE must be > 0");
  }
  if (Number.isNaN(DEFAULT_TTL) || DEFAULT_TTL <= 0) {
    throw new Error("ORACLE_REGISTER_TTL must be a positive integer");
  }

  const ownerAccount = utils.getDefaultAccounts()[0];
  const aeSdk = utils.getSdk({});
  const fileSystem = await getFileSystem(ORACLE_SOURCE);
  const sourceCode = utils.getContractContent(ORACLE_SOURCE);

  const oracleContract = await Contract.initialize({
    ...aeSdk.getContext(),
    sourceCode,
    fileSystem,
  });

  const initResult = await oracleContract.init(DEFAULT_FEE, DEFAULT_TTL, {
    onAccount: ownerAccount,
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
}

deploy()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error("Failed to deploy ExchangeOracle:", error);
    process.exit(1);
  });
