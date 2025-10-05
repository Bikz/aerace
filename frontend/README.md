# AERace Frontend

This package contains the React interface for the AERace barrier options platform. It connects to æternity wallets, renders live market data, and exposes owner tooling for market creation, oracle requests, and rake management.

## Prerequisites

- Node.js 18+
- npm 9+
- An æternity-compatible browser wallet (for example Superhero) if you plan to interact with a live node

## Installation

```bash
npm install
```

## Available Scripts

- `npm start` – launch the development server. Uses `REACT_APP_NODE_ENV=development` by default.
- `npm run start:testnet` – start against testnet presets (`REACT_APP_NODE_ENV=development`).
- `npm run start:mainnet` – start against mainnet presets (`REACT_APP_NODE_ENV=production`).
- `npm run build` – build a production bundle.
- `npm test` – run the CRA/Jest test suite.

## Environment Variables

Create a `.env` file or export variables in your shell before running the app. All variables must be prefixed with `REACT_APP_`.

| Variable | Description |
| --- | --- |
| `REACT_APP_BARRIER_CONTRACT_ADDRESS` | BarrierOptions contract address (`ct_…`) |
| `REACT_APP_OWNER_ADDRESS` | Account that controls market management |
| `REACT_APP_PRICE_ORACLE_ID` | Oracle ID used for price settlement (`ok_…`) |
| `REACT_APP_ORACLE_QUERY_FEE` | Fee (in aettos) provided when triggering the oracle |
| `REACT_APP_NODE_ENV` | `development` (testnet) or `production` (mainnet) |

## Project Structure

- `src/App.tsx` – landing screen, market dashboard, owner/betting flows.
- `src/hooks/useAeternitySDK.ts` – wallet detection and SDK initialization.
- `src/configs/` – contract and network settings consumed by the app.
- `src/contracts/barrierOptionsSource.ts` – bundled Sophia source used to instantiate the contract instance.

## Testing

```bash
npm test
```

Tests mock wallet connectivity and external price fetches. Extend them alongside UI or contract integration changes.

## Deployment

Build the app with `npm run build` and host the generated `build/` directory on your static hosting provider of choice. Ensure runtime env variables are baked into the build or provided via your hosting pipeline.

