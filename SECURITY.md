# Security

Do not open public issues for suspected vulnerabilities.
Email the maintainer via the GitHub profile with steps to reproduce.

- Never commit `.env` or API keys; keys stay server-side only.
- Uploads are verified with Pillow, capped at 10MB, and rate-limited.
- Passwords use scrypt; bearer sessions are opaque, expiring, and stored as
  digests. Crop data access is scoped to the authenticated user.
- Protect the SQLite file/volume and backups with host permissions; the app
  does not encrypt database contents at rest.
- Authentication rate limiting is process-local. Put a shared rate limiter
  in front of multi-worker or multi-replica deployments.
- This is decision support, not a certified diagnostic device.
