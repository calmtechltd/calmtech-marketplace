# Security Policy

## Report a vulnerability

Use [GitHub private vulnerability reporting](https://github.com/calmtechltd/calm-connect/security/advisories/new). Do not put customer data, credentials, private URLs, or exploit details in a public issue.

## Connection boundary

Calm Connect contains the public Calm MCP endpoint. It contains no credentials or customer configuration. The AI client handles sign-in and consent, while Calm enforces the signed-in user's access on each tool call.

Security fixes target the latest published release.
