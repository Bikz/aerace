# Oracle Deployment & Configuration Guide

This guide wires the `BarrierOptions` contract to an æternity native oracle using
the bundled `ExchangeOracle` helper.

## Prerequisites

- Node.js ≥ 18 and npm
- Docker (for `aeproject env`)
- Project dependencies installed: `npm install`
- An æternity account with funds on the target network (defaults assumed by AEproject)

## 1. Start the local æternity stack (optional)

```bash
npx aeproject env
```

Use `aeproject env --stop` to shut it down after testing. Add `--nodeVersion` / `--compilerVersion`
flags if you need specific protocol versions.

## 2. Deploy `BarrierOptions`

If you have not deployed the markets contract yet, deploy it using your preferred
workflow (AEproject CLI, SDK script, or test harness). Record the deployed address;
you will pass it to the configuration script later.

Example with AEproject:

```bash
npx aeproject contracts deploy ./contracts/BarrierOptions.aes
```

## 3. Deploy the AE oracle

`ExchangeOracle.aes` registers an on-chain oracle owned by the deployer. Run the
script to deploy and register it in one transaction:

```bash
node scripts/deployOracle.js
```

Environment overrides:
- `ORACLE_QUERY_FEE` (default `1000000000000000`, i.e. 0.001 AE)
- `ORACLE_REGISTER_TTL` (default `500` blocks)

The script prints the contract address and the oracle ID (`ok_...`). Keep
both values—especially the oracle ID—for the next step.

## 4. Point `BarrierOptions` at the oracle

Set the required environment variables and run the configuration helper:

```bash
export BARRIER_CONTRACT_ADDRESS=<ct_xxx from step 2>
export PRICE_ORACLE_ID=<ok_xxx from step 3>
# optional overrides
# export ORACLE_QUERY_FEE=1000000000000000
# export ORACLE_QUERY_TTL=500
# export ORACLE_RESPONSE_TTL=250

node scripts/configureBarrierOracle.js
```

`configureOracle` stores the oracle settings on-chain and emits
`OracleConfigured` on success.

## 5. Request prices and settle markets

1. Create or fund a market with `createMarket` / `placeBet`.
2. Request a price from the oracle owner:
   ```bash
   npx aeproject contracts call \
     --contract ./contracts/BarrierOptions.aes \
     --function requestOraclePrice \
     --args "<market_id>, \"AE/USD\"" \
     --amount 1000000000000000
   ```
   (Adjust fee and payload as needed.)
3. The oracle owner runs a responder that calls `ExchangeOracle.respond` with the
   computed price for the returned `oracle_query` ID.
   - Set `COINGECKO_DEMO_API_KEY` (or `COINGECKO_API_KEY`) so the responder can
     send the `x-cg-demo-api-key` header to CoinGecko's demo API. A default key
     is bundled for local testing.
4. Finish settlement via `checkMarketFromOracle <market_id>`.

You can automate steps 2–4 by writing a small Node.js daemon that listens for
`OraclePriceRequested` / `OraclePriceConsumed` events and talks to an external
price API (CoinGecko, Pyth relay, etc.).

## 6. Keep the oracle alive

Oracles expire unless their TTL is extended. Periodically call:

```bash
npx aeproject contracts call \
  --contract ./contracts/ExchangeOracle.aes \
  --function extend \
  --args "500"
```

to renew the oracle’s TTL (adjust the block count to your needs).

---

With these pieces deployed, `BarrierOptions` can request and consume price data
without manual price parameters, enabling automated market settlement.
