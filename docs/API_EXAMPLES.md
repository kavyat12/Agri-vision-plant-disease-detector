# API examples

## Health

```bash
curl http://localhost:8000/api/v1/health
```

```json
{ "status": "healthy", "version": "2.1.0", "providers_available": [] }
```

## Detect (provider configured)

```bash
curl -X POST http://localhost:8000/api/v1/detect \
  -F "file=@leaf.jpg;type=image/jpeg" \
  -F "provider=openai" -F "include_treatment=true" -F "include_prevention=true"
```

Success returns a provider-backed visual assessment and `detection_id`.
It does not include a confidence score because this integration does not produce
a calibrated model confidence. If the selected provider is not configured,
the endpoint returns `503` without generating a result.

## Errors

| Status | Cause | Fix |
|---|---|---|
| 400 | bad extension/MIME | use jpg/jpeg/png/webp |
| 413 | >10MB | compress image |
| 429 | >60 req/min | wait a minute |
| 429 | chat requests exceed configured per-client limit | wait a minute |
| 422 | bad feedback rating | rating 1–5 |
| 401 | missing, invalid, or expired bearer session | sign in again |
| 409 | email already registered | sign in with that account |
| 429 | authentication request limit reached | wait before retrying |
| 503 | selected vision provider not configured | set its backend API key |
| 503 | no chat provider configured | set `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` |
| 502 | configured provider request failed | check backend logs and provider status |
```

## Library & feedback

```bash
curl http://localhost:8000/api/v1/diseases
curl -X POST http://localhost:8000/api/v1/feedback \
  -H "Content-Type: application/json" -d '{"rating":5,"comment":"helpful"}'
```

## Agricultural chat

Chat requires a configured OpenAI or Anthropic key; it has no canned response
or offline fallback. The `language` is one of `en`, `kn`, `hi`, or `mr`.

```bash
curl -X POST http://localhost:8000/api/v1/chat \
  -H "Content-Type: application/json" \
  -d '{"language":"kn","messages":[{"role":"user","content":"How should I scout tomato plants?"}]}'
```

## Accounts and crop records

Register and use the returned bearer token for private crop operations:

```bash
curl -X POST http://localhost:8000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"farmer@example.test","password":"replace-with-a-long-password","full_name":"Farmer"}'

curl -X POST http://localhost:8000/api/v1/crops \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Tomato","variety":"Arka","planting_date":"2026-06-01","growth_stage":"Flowering"}'
```

`GET`, `PUT`, and `DELETE` crop operations require the same bearer token and
only return or modify records owned by that account. The SQLite schema is
created and migrated automatically when the backend starts.
