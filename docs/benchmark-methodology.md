# Benchmark Methodology

FPS Arena Bench starts as a watchable diagnostic benchmark. Results should be interpreted as local, config-specific evidence until seed suites, spawn permutations, prompt versions, model settings, and timeout policies mature.

MVP outputs should keep these metric families separate:

- tactical outcomes: winner, placements, kills, deaths, damageDealt, damageTaken, survivalTicks, pickupsCollected
- reliability: invalidJson, schemaFailures, repairAttempts, repairSuccesses, timeouts, fallbackActions
- latency: averageMs, p50Ms, p95Ms, timeoutBudgetMs

No composite score in MVP.
