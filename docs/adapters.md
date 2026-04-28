# Adapters

Adapters convert an observation into a strict JSON action.

Initial adapter order:

1. baseline bots and mock adapter
2. mock/Ollama local path
3. Claude CLI harness adapter
4. Codex CLI and OpenCode CLI harness adapters

Harness adapters must use isolated working directories, explicit environment allowlists, output caps, timeouts, redaction, and safe replay metadata. They must not persist OAuth tokens, raw credentials, or local auth paths.
