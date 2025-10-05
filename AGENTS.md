# Repository Guidelines
Sophia contracts powering barrier options and supporting Node tooling live here; follow these guardrails to merge confidently.

## Project Structure & Module Organization
- `contracts/` hosts production Sophia sources compiled with aesophia >= 6 (`BarrierOptions`, `ExchangeOracle`, `ExampleContract`).
- `scripts/` contains deployment and operations tooling powered by `@aeternity/aepp-sdk`:
  - `deployOracle.js`, `deployBarrierOptions.js`
  - `configureBarrierOracle.js`
  - `oracleResponder.js` (off-chain oracle service)
- `test/` keeps Mocha specs; each contract or major flow lives in its own `*Test.js` file.
- `docs/` captures SOPs (`oracle_setup.md`, `todo.md`, etc.); `docker/` pins the AEproject dev stack.
- `README.md` is the living runbook with architecture, test and deployment commands—keep it aligned with any new tooling.

## Build, Test, and Development Commands
- `npm install` — install AEproject and SDK dependencies.
- `npx aeproject env` / `npx aeproject env --stop` — boot or tear down the local æternity stack defined in `docker-compose.yml`.
- `npm test` — run all Mocha/Chai suites against the configured node/compiler (local or remote).
- `node scripts/deployOracle.js`, `node scripts/deployBarrierOptions.js`, `node scripts/configureBarrierOracle.js` — deploy/configure contracts; set `DEPLOYER_SECRET_KEY`, `AE_NODE_URL`, and `AE_COMPILER_URL` env vars.
- `node scripts/oracleResponder.js` — start the price oracle daemon; requires the same env variables plus deployed contract/ID references.

## Coding Style & Naming Conventions
- Sophia: indent four spaces; group type/record definitions above entrypoints; keep error tags in screaming snake case (e.g., `ERR_NOT_OWNER`); prefer enums over magic strings for statuses.
- JavaScript: ES modules with 2-space indentation, double quotes, trailing commas (align with `test/*.js`). Use async/await and destructuring from `@aeternity/aepp-sdk`; avoid CommonJS.
- Script filenames stay imperative (`deploy*`, `configure*`, `oracleResponder`), and the script name should mirror its contract or responsibility.

## Testing Guidelines
- Use Mocha `describe`/`it` blocks per contract capability; adopt the `utils.createSnapshot` / `utils.rollbackSnapshot` pattern for deterministic runs.
- Assert with Chai or `chai-as-promised` for failure paths; name tests `<Feature>Test.js` so `npm test` picks them up automatically.
- When refactoring events or settlement logic, extend `test/barrierOptionsTest.js` accordingly; record outstanding scenarios in `docs/todo.md`.

## Commit & Pull Request Guidelines
- Follow Conventional Commits (`feat(oracle): …`, `fix(barrier): …`) with a scope when touching specific contracts/modules.
- PRs should explain contract/storage changes, link any tracked issues, and include `npm test` output and/or deployment logs.
- Attach æScan links or screenshots for on-chain updates; call out breaking schema/events in the description.

## Oracle & Environment Tips
- Review `docs/oracle_setup.md` before shipping oracle-related work; align TTL/fee constants and update the README if defaults change.
- Keep `oracleResponder.js` running in staging/demo environments so queries are answered and TTL extended; update env vars when redeploying.
- Never commit funded private keys; rotate anything derived from `docker/accounts.json` when moving beyond local testing.
