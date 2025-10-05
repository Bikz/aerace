# Deployment TODOs

- [ ] Finalize contract review: validate edge cases in `BarrierOptions` (fee calc, double-claims, race logic) and add unit/integration tests.
- [ ] Expand AEproject tests to cover oracle-based settlement flow with mocked `ExchangeOracle` responses.
- [ ] Build oracle responder daemon (price fetch + `ExchangeOracle.respond`) with TTL auto-extension.
- [ ] Script BarrierOptions deployment for target network (AEproject or SDK) and capture deployed addresses.
- [ ] Run end-to-end rehearsal on `aeproject env`: create market, place bets, trigger oracle request/response, claim payouts.
- [ ] Prepare production deployment checklist: fund accounts, set env vars, update TTL/fee defaults, verify contracts on æScan.
- [ ] Document monitoring & maintenance: oracle TTL schedule, contract events to watch, payout reconciliation.
