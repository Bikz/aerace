import { utils } from "@aeternity/aeproject";
import { Contract, getFileSystem } from "@aeternity/aepp-sdk";
import * as chai from "chai";
import { assert } from "chai";
import chaiAsPromised from "chai-as-promised";
import { before, describe, afterEach, it } from "mocha";

chai.use(chaiAsPromised);

const BARRIER_SOURCE = "./contracts/BarrierOptions.aes";
const ORACLE_SOURCE = "./contracts/ExchangeOracle.aes";

// Helper constants
const AE = 10n ** 18n;
const UP_BET = AE / 10n; // 0.1 AE
const DOWN_BET = AE / 20n; // 0.05 AE
const ORACLE_FEE = AE / 100n; // 0.01 AE
const ORACLE_REGISTER_TTL = 50;
const QUERY_TTL = 5;
const RESPONSE_TTL = 3;

function findEvent(tx, name) {
  return tx.decodedEvents.find((event) => event.name === name);
}

describe("BarrierOptions", () => {
  let aeSdk;
  let owner;
  let bettorUp;
  let bettorDown;
  let barrierContract;
  let oracleContract;

  before(async () => {
    aeSdk = utils.getSdk({});
    const accounts = utils.getDefaultAccounts();
    owner = accounts[0];
    bettorUp = accounts[1];
    bettorDown = accounts[2];

    // Deploy BarrierOptions
    const barrierFs = await getFileSystem(BARRIER_SOURCE);
    const barrierSource = utils.getContractContent(BARRIER_SOURCE);
    barrierContract = await Contract.initialize({
      ...aeSdk.getContext(),
      sourceCode: barrierSource,
      fileSystem: barrierFs,
    });

    await barrierContract.init({
      onAccount: owner,
    });

    const oracleFs = await getFileSystem(ORACLE_SOURCE);
    const oracleSource = utils.getContractContent(ORACLE_SOURCE);
    oracleContract = await Contract.initialize({
      ...aeSdk.getContext(),
      sourceCode: oracleSource,
      fileSystem: oracleFs,
    });

    await oracleContract.init(ORACLE_FEE, ORACLE_REGISTER_TTL, {
      onAccount: owner,
    });

    await utils.createSnapshot(aeSdk);
  });

  afterEach(async () => {
    await utils.rollbackSnapshot(aeSdk);
  });

  it("pays winners correctly for manual settlement", async () => {
    const marketId = 1;
    const barrierUp = 150;
    const barrierDown = 100;
    const duration = 50;

    await barrierContract.createMarket("AE", barrierUp, barrierDown, duration, false, {
      onAccount: owner,
    });

    await barrierContract.placeBet(marketId, true, {
      amount: UP_BET,
      onAccount: bettorUp,
    });

    await barrierContract.placeBet(marketId, false, {
      amount: DOWN_BET,
      onAccount: bettorDown,
    });

    await barrierContract.checkMarket(marketId, 200, {
      onAccount: owner,
    });

    const claimWinner = await barrierContract.claimPayout(marketId, {
      onAccount: bettorUp,
    });

    const payoutEvent = findEvent(claimWinner, "PayoutClaimed");
    assert.isDefined(payoutEvent, "Payout event should be emitted");

    const payoutAmount = BigInt(payoutEvent.args[2]);
    const expectedPayout =
      (UP_BET + DOWN_BET) - ((UP_BET + DOWN_BET) * 20000n) / 1000000n;
    assert.equal(
      payoutAmount.toString(),
      expectedPayout.toString(),
      "Winner should receive pool minus rake"
    );

    await assert.isRejected(
      barrierContract.claimPayout(marketId, { onAccount: bettorDown }),
      /ERR_NOT_WINNER/
    );

    await assert.isRejected(
      barrierContract.claimPayout(marketId, { onAccount: bettorUp }),
      /ERR_NO_BET/
    );
  });

  it("settles markets using oracle responses", async () => {
    const marketId = 1;
    const barrierUp = 200;
    const barrierDown = 90;
    const duration = 80;

    const { decodedResult: oracleId } = await oracleContract.get_oracle();

    await barrierContract.configureOracle(
      oracleId,
      ORACLE_FEE,
      QUERY_TTL,
      RESPONSE_TTL,
      {
        onAccount: owner,
      }
    );

    await barrierContract.createMarket("BTC", barrierUp, barrierDown, duration, true, {
      onAccount: owner,
    });

    await barrierContract.placeBet(marketId, true, {
      amount: UP_BET,
      onAccount: bettorUp,
    });

    await barrierContract.placeBet(marketId, false, {
      amount: DOWN_BET,
      onAccount: bettorDown,
    });

    const requestTx = await barrierContract.requestOraclePrice(marketId, "BTC/USD", {
      amount: ORACLE_FEE,
      onAccount: owner,
    });

    const requestEvent = findEvent(requestTx, "OraclePriceRequested");
    assert.isDefined(requestEvent, "OraclePriceRequested event should fire");

    const { decodedResult: storedQueryOption } =
      await barrierContract.getOracleQuery(marketId);

    const queryId = Array.isArray(storedQueryOption)
      ? (assert.equal(
          storedQueryOption[0],
          "Some",
          "Expected query to be saved before oracle response",
        ), storedQueryOption[1])
      : storedQueryOption;

    await oracleContract.respond(queryId, 210, {
      onAccount: owner,
    });

    await barrierContract.checkMarketFromOracle(marketId, {
      onAccount: owner,
    });

    const claimWinner = await barrierContract.claimPayout(marketId, {
      onAccount: bettorUp,
    });

    const payoutEvent = findEvent(claimWinner, "PayoutClaimed");
    const payoutAmount = BigInt(payoutEvent.args[2]);
    const expectedPayout =
      (UP_BET + DOWN_BET) - ((UP_BET + DOWN_BET) * 20000n) / 1000000n;
    assert.equal(
      payoutAmount.toString(),
      expectedPayout.toString(),
      "Oracle settlement should pay winning side minus rake"
    );

    await assert.isRejected(
      barrierContract.claimPayout(marketId, { onAccount: bettorDown }),
      /ERR_NOT_WINNER/
    );

    const { decodedResult: storedQuery } = await barrierContract.getOracleQuery(
      marketId,
    );
    const isNoneOption =
      storedQuery === "None" ||
      (Array.isArray(storedQuery) && storedQuery[0] === "None") ||
      storedQuery == null;
    assert.isTrue(isNoneOption, "Query should be cleared after settlement");
  });
});
