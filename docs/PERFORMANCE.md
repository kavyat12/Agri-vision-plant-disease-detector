# Performance budget

- Frontend build <900KB initial (see `vite.config.js` warning limit).
- Images normalized to <=1568px JPEG q88 server-side.
- AI-provider response time is external and is not guaranteed by the application.
- SQLite is suitable for the single-instance local setup; use a shared database
  and shared rate limiter before scaling across multiple backend replicas.
- Skeletons + lazy images keep CLS low; test with Lighthouse mobile.
