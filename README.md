# Barrier Options dApp (æternity Hackathon)

**🏆 Winner — æternity Hackathon**

This project implements a barrier-options betting platform on the æternity blockchain. Participants wager on whether an asset price will touch an upper or lower barrier before expiry (one-touch / no-touch markets) or race between barriers. The stack includes:

- **Sophia contracts** (`contracts/BarrierOptions.aes`, `contracts/ExchangeOracle.aes`) running on æternity testnet.
- **Node scripts** for deployment, oracle configuration, and an off-chain oracle responder.
- **Mocha/Chai tests** via AEproject to validate settlement flows (manual price inputs and oracle responses).

## Table of Contents
- [Architecture](#architecture)
- [Local Setup](#local-setup)
- [Testing](#testing)
- [Deployment (Testnet)](#deployment-testnet)
- [Oracle Responder](#oracle-responder)
- [Environment Variables](#environment-variables)
- [Useful Addresses](#useful-addresses)
- [License](#license)

## Architecture
- `BarrierOptions.aes`: main contract storing markets, bets, and status. Supports owner-managed price checks and oracle-based settlements. Emits streamlined events for front-end consumption.
- `ExchangeOracle.aes`: minimal owner-only oracle registration contract. Returns oracle ID used by `BarrierOptions`.
- `scripts/*.js`: deployment, oracle configuration, and responder tooling using `@aeternity/aepp-sdk`.
- `test/barrierOptionsTest.js`: end-to-end tests simulating manual and oracle-based market resolution.

## Local Setup
```bash
npm install
# optional: start a local æproject env if you want to test locally
aeproject env
```

## Testing
```bash
npm test
```
Runs the Mocha suite (`test/*.js`) against the local AEproject environment (or whichever node/compiler you configure).

## Deployment (Testnet)
### Prerequisites
- æternity account with testnet funds (we used `ak_mK1NyxjzK4GzZKXWxDfGbeqwEhQfZsNAx24J2NzJGQGUdu6sJ`).
- Deployer private key (`sk_…`).
- Node URL & compiler URL (defaults to testnet / v7).
- Sophia compiler must stay on `>=7.1.1 <8.0.0` for the current AEproject toolchain.

### 1. Deploy Exchange Oracle
```bash
env \
  DEPLOYER_SECRET_KEY=sk_... \
  AE_NODE_URL=https://testnet.aeternity.io \
  AE_COMPILER_URL=https://v7.compiler.aepps.com \
  ORACLE_QUERY_FEE=1000000000000000 \
  ORACLE_REGISTER_TTL=500 \
  node scripts/deployOracle.js
```
Outputs:
- Oracle contract address (`ct_...`)
- Oracle ID (`ok_...`) (needed for BarrierOptions configuration)

### 2. Deploy BarrierOptions
```bash
env \
  DEPLOYER_SECRET_KEY=sk_... \
  AE_NODE_URL=https://testnet.aeternity.io \
  AE_COMPILER_URL=https://v7.compiler.aepps.com \
  node scripts/deployBarrierOptions.js
```
Outputs contract address (`ct_...`).

### 3. Configure BarrierOptions to use the oracle
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

## Oracle Responder
The dApp relies on an off-chain service to answer oracle price requests. A ready-to-run responder is provided:
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
This script:
1. Polls `BarrierOptions` for pending oracle queries.
2. Fetches AE/USD price from CoinGecko Demo API (fallback to a default).
3. Calls `ExchangeOracle.respond`, then triggers `checkMarketFromOracle`.
4. Extends the oracle TTL periodically.

Keep the responder running continuously while your front end is live.

## Environment Variables
| Variable | Description | Default |
|----------|-------------|---------|
| `DEPLOYER_SECRET_KEY` | Private key (`sk_...`) for the deployment/responder account | — |
| `AE_NODE_URL` | æternity node RPC URL | `https://testnet.aeternity.io` |
| `AE_COMPILER_URL` | Sophia compiler URL | `https://v7.compiler.aepps.com` |
| `ORACLE_QUERY_FEE` | Fee (in aettos) paid when requesting oracle price | `1000000000000000` |
| `ORACLE_REGISTER_TTL` | TTL (blocks) when registering the oracle | `500` |
| `ORACLE_QUERY_TTL` | TTL (blocks) for price queries | `500` |
| `ORACLE_RESPONSE_TTL` | TTL (blocks) for oracle responses | `250` |
| `ORACLE_EXTEND_TTL` | TTL extension used by responder | `200` |
| `ORACLE_POLL_INTERVAL` | Responder loop interval (ms) | `10000` |
| `BARRIER_CONTRACT_ADDRESS` | Deployed BarrierOptions address (`ct_...`) | — |
| `PRICE_ORACLE_ID` | Oracle ID (`ok_...`) returned by ExchangeOracle | — |
| `ORACLE_CONTRACT_ADDRESS` | Deployed ExchangeOracle address (`ct_...`) | — |
| `COINGECKO_DEMO_API_KEY` | Demo API key injected into CoinGecko requests | `CG-4t3P7yT5rUFYFz5JHTzuuDRg` |

## Useful Addresses
- BarrierOptions (testnet): `ct_7jTDxrEWXGBBSmhtQPP89aoNZ1qPXreGrszW8rJ86v9QYgu4a`
- ExchangeOracle (testnet): `ct_tmkuVj9TbRZiGwEJChGBCzFNBz44biwWeMAMKeqbTw54PMwvz`
- Oracle ID: `ok_tmkuVj9TbRZiGwEJChGBCzFNBz44biwWeMAMKeqbTw54PMwvz`

## Frontend (React)
- Located in `frontend/` (bootstrapped from `aepp-boilerplate-react`).
- Install and run:

  ```bash
  cd frontend
  npm install
  npm start
  ```

- Configure via `.env` (prefix vars with `REACT_APP_`):
  - `REACT_APP_BARRIER_CONTRACT_ADDRESS`
  - `REACT_APP_PRICE_ORACLE_ID`
  - `REACT_APP_OWNER_ADDRESS`
  - `REACT_APP_ORACLE_QUERY_FEE`
  - `REACT_APP_COINGECKO_API_KEY` (or `REACT_APP_COINGECKO_DEMO_API_KEY`)

- Features: wallet connect, market list/detail, betting form, owner controls, oracle trigger, payout claim UI. Uses `AeSdkAepp` to compile the contract source at runtime.

## License
MIT
