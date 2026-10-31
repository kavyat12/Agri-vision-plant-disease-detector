# Error codes

- `400` — invalid image content, unsupported extension, or undecodable image.
- `401` — missing, invalid, or expired bearer session.
- `409` — email address is already registered.
- `422` — request fields failed validation.
- `429` — per-process detection, chat, or authentication rate limit reached.
- `502` — configured AI provider failed to complete the request.
- `503` — selected AI provider is not configured or temporary capacity is exhausted.
- `413` — uploaded image exceeds the configured size limit.
- `500` — feedback could not be persisted.
