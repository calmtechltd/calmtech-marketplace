# Calm Connect

Calm Connect is the AI companion to [Calm Compliance](https://www.calmcompliance.com), the platform for premises, maintenance, compliance, and people. Connect Codex, Claude Code, or Cursor to your Calm account and ask questions about the sites and records you already work with.

Installing the plugin grants no access. Your assistant asks you to sign in to Calm and approve the connection. Calm continues to apply your organisation and user permissions to every request.

## What you can do

- **See what needs attention:** find outstanding issues and requests, overdue work, upcoming reviews, and records that expire this month. Compare attention across connected sites.
- **Explore your premises:** find locations and assets, check vehicle MOT dates, and pull together an asset's open tickets, due work, and linked documents.
- **Find compliance records:** look up published policies, risk assessments, hazardous materials, equipment risk profiles, adopted standards, and requirement gaps.
- **Check people and contractors:** find site role holders, training and accreditation expiries, and contractor insurance dates.
- **Prepare for a visit or meeting:** assemble an inspection preparation pack, contractor briefing, location walk, or meeting pack from the records you can access.
- **Make supported changes with optional Write access:** update existing issues and requests, start work orders, or complete, skip, or cancel work orders when you explicitly ask.

Try asking:

- "What needs attention at this site this month?"
- "Tell me about boiler 3 and its outstanding work."
- "Help me prepare for a fire inspection on Friday."
- "Whose training or contractor insurance expires this month?"

Available tools depend on your organisation's modules, the sites you allow, and your own permissions. Documents return details and links rather than full text or uploaded files. Searches and packs may be capped or incomplete; preparation packs do not certify compliance.

Write access is optional. Accepted changes apply immediately in Calm and are audited as you. Customer tools cannot create sites or assets, invite people, import spreadsheets, upload documents, or configure maintenance schedules.

See the [live Calm MCP guide](https://app.calmcompliance.com/mcp.md) for the current tools and more examples.

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

Learn about Calm at [calmcompliance.com](https://www.calmcompliance.com), open your account at [app.calmcompliance.com](https://app.calmcompliance.com), or visit the [help centre](https://help.calmcompliance.com).
