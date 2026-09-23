# Documentation Guidelines

- Keep the endpoint, tool name, limits, error codes, and credential behavior synchronized with the implementation.
- Never include API Tokens, complete upstream response objects, or private travel queries.
- Use a disposable invalid Token for public contract checks and a dedicated test Token for successful manual verification.
