# Troubleshooting

## Backend won't start
- Use Python 3.10–3.12, `pip install -r backend/requirements.txt`.
- Port busy? `uvicorn app.main:app --port 8001`.

## 400 on upload
- Use JPG/PNG/WebP <=10MB. BMP/GIF/TIFF rejected with clear message.

## 429 rate limit
- Default 60/min per process. Wait a minute or raise `RATE_LIMIT_PER_MINUTE`.

## Image assessment or chat is unavailable
- Configure `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` in `backend/.env`, restart
  the backend, then check `/api/v1/providers`.
- The app does not return a synthetic diagnosis when credentials are missing.
