# BarrierOptions Deployment Guide

This guide covers compiling and deploying the `BarrierOptions` contract with the
Node.js helper (`scripts/deployBarrierOptions.js`) and verifying it on æScan.

## 1. Prerequisites

- Node.js ≥ 18
- Environment variables:
  - `DEPLOYER_SECRET_KEY` – private key of the deploying account (prefixed with `sk_`)
  - Optional overrides:
    - `AE_NODE_URL` (defaults to `https://testnet.aeternity.io`)
    - `AE_COMPILER_URL` (defaults to `https://v8.compiler.aepps.com`)
    - `CONTRACT_PATH` (defaults to `./contracts/BarrierOptions.aes`)
- Project dependencies installed: `npm install`

## 2. Deploy the contract

```bash
export DEPLOYER_SECRET_KEY=sk_...
# optional overrides
# export AE_NODE_URL=https://testnet.aeternity.io
# export AE_COMPILER_URL=https://v8.compiler.aepps.com

node scripts/deployBarrierOptions.js
```

The script outputs:
- Contract address (`ct_...`)
- Deployer (owner) account
- Deployment transaction hash

Record the address for oracle configuration and later verification.

## 3. Verify on æScan

1. Navigate to [æScan Smart Contract Verification](https://aescan.io/contracts/verify).
2. Choose the network (testnet or mainnet) that matches your deployment.
3. Enter the deployed contract address.
4. Upload `contracts/BarrierOptions.aes` as the source file.
5. Provide compiler version `v8` (or the version you used) and ABI data if requested
   (can be extracted from the deployment script output or via `aepp-sdk`).
6. Submit the verification. æScan will match the compiled bytecode and report
   success once validated.

## 4. Post-deployment steps

- Run `node scripts/configureBarrierOracle.js` to point the contract at your
  oracle.
- Log deployment metadata (commit hash, network, owner address) for future audits.
- Optionally tag the repository or record the contract address in your frontend
  configuration.

With these steps complete, `BarrierOptions` is deployed, verified, and ready for
integration with the oracle workflow described in `docs/oracle_setup.md`.
