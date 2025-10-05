# Deployment TODOs

- [ ] Final review of `BarrierOptions` for remaining edge cases (fee tuning, potential race double claims) and add targeted tests if gaps appear.
- [x] Expand AEproject tests to cover manual/oracle settlement flows.
- [x] Build oracle responder daemon (price fetch + `ExchangeOracle.respond`) with TTL auto-extension.
- [x] Script BarrierOptions/Oracle deployment for target network and capture addresses.
- [x] Run end-to-end rehearsal (via `npm test`) covering placeBet → oracle response → payout.
- [ ] Production checklist: fund mainnet accounts, set environment variables, update TTL/fee defaults, verify contracts on æScan.
- [x] Document monitoring & maintenance (README + responder instructions).
