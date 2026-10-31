# Architecture

```mermaid
flowchart LR
  U[React + Vite + Tailwind] -->|multipart image <=10MB| V[FastAPI validation]
  V -->|Pillow verify + normalize| R{Provider configured?}
  R -- Yes --> O[GPT-4o / Claude 3.5 + retry + safe JSON]
  R -- No --> E[503 configuration error]
  O --> J[Structured DiseaseInfo]
  J --> U
  U --> H[(localStorage history)]
  U -->|chat + selected language| C[FastAPI chat endpoint]
  C -->|configured provider only| O
  C -->|no provider key| E[503 configuration error]
  U --> CH[(localStorage conversations)]
  U -->|bearer token| A[FastAPI auth + crop APIs]
  A --> DB[(SQLite users, sessions, crops)]
```

## Key decisions

- Pillow is source of truth for images; `python-magic` optional (Windows-safe).
- Detection, chat, and authentication rate limits are in-process; use a shared
  limiter at the ingress for multi-replica deployments.
- Provider failures are surfaced as errors; the application does not fabricate
  diagnoses or calibrated confidence scores.
- History never leaves the browser; feedback is appended to a local JSONL file.
- Chat requests require an explicitly configured provider. Conversation history
  remains in browser localStorage.
- Passwords are stored as scrypt hashes. Opaque, expiring bearer tokens are
  stored as SHA-256 digests; crop queries always include the authenticated
  owner ID.
- SQLite schema migration version 1 is applied automatically at startup.
- No local model weights, password-recovery service, weather API, or verified
  retrieval corpus are included in this extracted project.
