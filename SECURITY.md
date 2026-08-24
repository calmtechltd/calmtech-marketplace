# Security Policy

## Report a vulnerability

Use [GitHub private vulnerability reporting](https://github.com/calmtechltd/calmtech-marketplace/security/advisories/new). Do not put credentials, customer data, exploit details, or private repository information in a public issue.

## Publication boundary

The marketplace reads only public repositories listed in `plugins.json`. The generator copies an allowlist of files, rejects symlinks, validates plugin identities and versions, and records the exact source commit in `plugins.lock.json`.

The sync workflow does not install dependencies or execute code from plugin repositories.
