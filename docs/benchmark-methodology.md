# Benchmark Methodology

FPS Arena Bench starts as a watchable diagnostic benchmark. Results should be interpreted as local, config-specific evidence until seed suites, spawn permutations, prompt versions, model settings, and timeout policies mature.

MVP outputs should keep these metric families separate:

- tactical outcomes: wins, placements, kills, damage, survival time, pickups
- reliability: invalid JSON, schema failures, repair attempts, repair success, timeouts, fallback usage
- latency: average, p50, p95, timeout budget usage

No composite score in MVP.
