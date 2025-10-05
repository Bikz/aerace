# Repository Guidelines
Sophia contracts powering barrier options and supporting Node tooling live here; follow these guardrails to merge confidently.

## Project Structure & Module Organization
- `contracts/` hosts production Sophia sources (`BarrierOptions`, `ExchangeOracle`, `ExampleContract`) compiled with aesophia >=6.
- `scripts/` provides Node helpers for deployment and oracle setup; run them with `node scripts/<name>.js`.
- `test/` keeps Mocha specs; treat each contract feature as a separate `*Test.js`.
- `docs/` captures operational playbooks (see `oracle_setup.md` for end-to-end oracle wiring); `docker/` pins the local æternity node and compiler configuration used by AEproject.

## Build, Test, and Development Commands
- `npm install` — install AEproject tooling and SDK dependencies.
- `npx aeproject env` / `npx aeproject env --stop` — boot or tear down the local æternity stack defined in `docker-compose.yml`.
- `npm test` — run all Mocha/Chai suites under `test/` against the local node.
- `node scripts/deployOracle.js` and `node scripts/deployBarrierOptions.js` — sample deployment flows; pass flags or env vars for target networks.

## Coding Style & Naming Conventions
- Sophia: indent four spaces, group state/entrypoint definitions, keep error tags in screaming snake case (e.g., `ERR_NOT_OWNER`), emit descriptive events.
- JavaScript: ES modules with 2-space indentation, double quotes, and trailing commas (mirror `test/exampleTest.js`); prefer async/await and destructuring from `@aeternity/aeproject`.
- Keep script filenames imperative (`deploy*`, `configure*`), and match contract names to their filenames.

## Testing Guidelines
- Use Mocha `describe`/`it` blocks per contract capability; adopt the `utils.createSnapshot` / `utils.rollbackSnapshot` pattern for deterministic runs.
- Assert with Chai or `chai-as-promised` for failure paths; name tests `<Feature>Test.js` so `npm test` picks them up automatically.
- Add regression tests whenever contract state, events, or oracle flows change; document pending edge cases in `docs/todo.md` if they remain untested.

## Commit & Pull Request Guidelines
- Follow Conventional Commits observed in history (`feat(oracle): ...`, `fix(barrier): ...`); include scope when touching a specific contract or module.
- PRs should explain contract/storage changes, link any tracked issues, and include `npm test` output or relevant deployment command logs.
- Attach screenshots or æScan links for on-chain changes when available; flag breaking schema updates in the description.

## Oracle & Environment Tips
- Review `docs/oracle_setup.md` before shipping oracle-related work; align TTL and fee constants with the target network.
- Never commit funded private keys; rotate anything derived from `docker/accounts.json` when moving beyond local testing.
