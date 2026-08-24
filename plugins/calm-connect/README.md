# Calm Connect

Calm Connect lets your AI assistant answer questions about Calm using the access you already have. It can name the sites available through your connection, find outstanding issues and requests, and look up a ticket.

Installing the plugin grants no access. Your assistant asks you to sign in to Calm and approve the connection. Calm continues to apply your organisation and user permissions to every request.

## Install

Calm Connect is distributed through the [Calmtech Marketplace](https://github.com/calmtechltd/calmtech-marketplace), alongside [Calm Craft](https://github.com/calmtechltd/calm-craft).

### Codex

```sh
codex plugin marketplace add calmtechltd/calmtech-marketplace
codex plugin add calm-connect@calmtech
```

### Claude Code

```sh
claude plugin marketplace add calmtechltd/calmtech-marketplace
claude plugin install calm-connect@calmtech
```

### Cursor

Add `calmtechltd/calmtech-marketplace` as your team marketplace, then install Calm Connect from Cursor's plugin settings. While developing locally, copy or link this repository to `~/.cursor/plugins/local/calm-connect` and reload Cursor.

## What gets shared

The plugin contains one public connection address: `https://app.calmcompliance.com/mcp`. It contains no API keys, organisation identifiers, credentials, or fixed authorization headers.

Your AI client manages sign-in and stores its own authorization. The tools available after sign-in still follow your Calm access.

## Compatibility

The repository includes the portable [Agent Plugin v1](https://github.com/evolv3ai/open-plugin-spec) package plus native manifests for Codex and Claude Code. Cursor can load the portable Agent Plugin directly.

## Support and security

Open a GitHub issue for installation problems that contain no private customer data. Report vulnerabilities through [GitHub private vulnerability reporting](https://github.com/calmtechltd/calm-connect/security/advisories/new).

Calm is available at [app.calmcompliance.com](https://app.calmcompliance.com).
