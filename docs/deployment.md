# Barrier Options Deployment Guide

This guide walks through deploying the contracts to æternity testnet and wiring the off-chain oracle responder.

## 1. Prerequisites
- Node.js ≥ 18, npm
- `npm install` completed
- æternity account with testnet funds (`DEPLOYER_SECRET_KEY` / `ak_…`)
- Access to the æternity compiler (`https://v7.compiler.aepps.com`) and node (`https://testnet.aeternity.io`)
- Ensure the compiler version stays within `>=7.1.1 <8.0.0` until the AEproject stack adds v8 support.

## 2. Deploy `ExchangeOracle`
```bash
env \
  DEPLOYER_SECRET_KEY=sk_... \
  AE_NODE_URL=https://testnet.aeternity.io \
  AE_COMPILER_URL=https://v7.compiler.aepps.com \
  ORACLE_QUERY_FEE=1000000000000000 \
  ORACLE_REGISTER_TTL=500 \
  node scripts/deployOracle.js
```
Output: oracle contract address (`ct_…`) and oracle ID (`ok_…`).

## 3. Deploy `BarrierOptions`
```bash
env \
  DEPLOYER_SECRET_KEY=sk_... \
  AE_NODE_URL=https://testnet.aeternity.io \
  AE_COMPILER_URL=https://v7.compiler.aepps.com \
  node scripts/deployBarrierOptions.js
```
Output: barrier contract address (`ct_…`).

## 4. Configure `BarrierOptions` to use the oracle
```bash
env \
  DEPLOYER_SECRET_KEY=sk_... \
  AE_NODE_URL=https://testnet.aeternity.io \
  AE_COMPILER_URL=https://v7.compiler.aepps.com \
  BARRIER_CONTRACT_ADDRESS=ct_... \
  PRICE_ORACLE_ID=ok_... \
  ORACLE_QUERY_FEE=1000000000000000 \
  ORACLE_QUERY_TTL=5 \
  ORACLE_RESPONSE_TTL=3 \
  node scripts/configureBarrierOracle.js
```
`OracleConfiguredEvent` confirms the settings on-chain.

## 5. Request prices & settle markets
1. Create a market via `createMarket`. Bettors call `placeBet`.
2. Owner (or backend) sends `requestOraclePrice` with a payload string (e.g., `"AE/USD"`).
3. Run the off-chain responder (next section) so the oracle responds and `checkMarketFromOracle` is triggered.
4. Winners call `claimPayout` once the market status updates.

## 6. Oracle responder
Keep `scripts/oracleResponder.js` running to answer queries and extend TTL:
```bash
env \
  DEPLOYER_SECRET_KEY=sk_... \
  AE_NODE_URL=https://testnet.aeternity.io \
  AE_COMPILER_URL=https://v7.compiler.aepps.com \
  ORACLE_CONTRACT_ADDRESS=ct_... \
  BARRIER_CONTRACT_ADDRESS=ct_... \
  ORACLE_EXTEND_TTL=50 \
  ORACLE_POLL_INTERVAL=15000 \
  node scripts/oracleResponder.js
```
The responder fetches AE/USD from CoinGecko (fallback constant) and auto-extends the oracle TTL. If you stop the responder, extend manually with `oracleContract.extend` to keep the oracle alive.

## 7. References
- README for high-level architecture and command summary.
- `docs/oracle_setup.md` for additional background on oracle wiring.
- æScan for deployed contract verification.
