# Calmtech Marketplace

The Calmtech Marketplace publishes open plugins for Codex, Claude Code, and Cursor from one repository.

It currently contains:

- [Calm Craft](https://github.com/calmtechltd/calm-craft): skills for specs, implementation planning, code review, and enforceable conventions.
- [Calm Connect](https://github.com/calmtechltd/calm-connect): a secure connection to Calm for questions about sites, issues, requests, and tickets.

## Install

### Codex

```sh
codex plugin marketplace add calmtechltd/calmtech-marketplace
codex plugin add calm-craft@calmtech
codex plugin add calm-connect@calmtech
```

### Claude Code

```sh
claude plugin marketplace add calmtechltd/calmtech-marketplace
claude plugin install calm-craft@calmtech
claude plugin install calm-connect@calmtech
```

### Cursor

Add `calmtechltd/calmtech-marketplace` as your Team or Enterprise marketplace repository, then install either plugin from Cursor's plugin settings.

The repository includes `.cursor-plugin/marketplace.json`, so it can also be submitted as a multi-plugin repository to Cursor's public marketplace.

## How updates work

[`plugins.json`](plugins.json) is the allowlist and source of truth. Each entry names a public repository, a Git ref, and the files that Calmtech publishes.

The sync workflow runs every hour and can also run on demand or in response to a `plugin-released` repository event. It checks out each configured ref, rejects symlinks and mismatched manifests, and generates:

- `.agents/plugins/marketplace.json` for Codex
- `.claude-plugin/marketplace.json` for Claude Code
- `.cursor-plugin/marketplace.json` for Cursor
- local plugin snapshots under `plugins/`
- `plugins.lock.json` with the exact source commit and plugin version

The workflow validates the complete result, opens a bot pull request, and enables auto-merge. The pull request records each marketplace update without requiring someone to copy files between repositories.

`calm-craft` currently tracks `main` because that repository has not published a GitHub release. Change its `ref` to a release tag when Calm Craft adopts tagged plugin releases.

## Add another plugin

1. Publish a public Agent Plugin v1 repository with matching `.codex-plugin/plugin.json` and `.claude-plugin/plugin.json` manifests.
2. Add one explicit entry to `plugins.json`, including the paths that belong in the published package.
3. Run the sync against sibling local checkouts and validate the result:

```sh
CALMTECH_SOURCE_ROOT=.. npm run sync
npm run validate
```

4. Open a pull request containing the registry and generated changes.

The marketplace does not discover repositories from GitHub topics or naming patterns. A new plugin always starts with a reviewed allowlist entry.

## Security

The generator copies files without running source-repository code. It rejects symlinks, records commit SHAs, and checks that portable, Codex, and Claude manifest identities and versions match.

Report vulnerabilities through [GitHub private vulnerability reporting](https://github.com/calmtechltd/calmtech-marketplace/security/advisories/new).
