# Privacy

- History stays in `localStorage` on-device; clear anytime.
- Uploads go to your configured backend only for analysis; no third-party trackers.
- LLM providers receive the normalized image only when you configure keys.
- Chat messages are sent to the OpenAI or Anthropic provider configured on your
  backend when submitted. Conversations are stored in browser `localStorage`;
  there is no server-side conversation database.
- Account email, display name, and crop records are stored in the backend's
  SQLite database. Passwords are stored as scrypt hashes, not plaintext.
- An opaque bearer token is kept in browser `sessionStorage` for the current
  tab session; its digest is stored in SQLite. Tokens expire after 14 days and
  are revoked on sign-out.
- SQLite is not encrypted at rest by the application. Protect the database
  file or Docker volume with operating-system and backup access controls.
- Diagnosis and chat history remain in browser `localStorage` and are not
  linked to the account. Feedback is appended to a local JSONL file.
- There is no email verification, password reset, or in-product account
  deletion flow yet. Contact the deployment operator to request account-data
  deletion.
- No advertising cookies or third-party tracking scripts are used.
