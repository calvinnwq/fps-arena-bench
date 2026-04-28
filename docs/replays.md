# Replays

Safe replay artifacts are shareable by default. They should contain map/config snapshots, accepted actions, events, state hashes, snapshots where useful, reliability stats, and latency stats.

They must not include raw prompts, raw model outputs, credentials, auth paths, or local environment details. Raw diagnostics belong in opt-in private debug artifacts such as `debug.private.jsonl`.
