# Calmtech Marketplace

<img src="./calm-mark.png" alt="Calmtech" width="96" />

A catalog pointing to Calmtech's plugin repositories. Each agent host downloads and manages the installed plugin in its tooling cache.

- [Calm Craft](https://github.com/calmtechltd/calm-craft): specs, implementation planning, reviews and conventions.
- [Calm Connect](https://github.com/calmtechltd/calm-connect): the AI companion to [Calm Compliance](https://www.calmcompliance.com) for questions about premises, work, compliance records, and people, with optional updates to issues, requests, and work orders.

Plugin skills, references, assets and versions live in those repositories. Application repositories keep their project-specific skills, specs, conventions and engineering settings.

## Install

### Codex

```sh
codex plugin marketplace add calmtechltd/calmtech-marketplace
codex plugin add calm-craft@calmtech
codex plugin add calm-connect@calmtech
```

The Codex catalog uses Git-backed `url` sources pointing at the root of each plugin repository. Each catalog entry supplies its display name, short description, publisher and brand color because Codex does not load the remote plugin manifest before installation. Install through the desktop plugin manager or CLI. [Source format](https://developers.openai.com/plugins/build/plugins#marketplace-metadata).

Codex currently discards asset paths for Git-backed entries before installation, so these entries show generic icons in the marketplace browser. The branded icon is loaded from the plugin repository after installation. Adding an icon path or a remote image URL to the catalog does not bypass this limitation.

### Claude Code

```sh
claude plugin marketplace add calmtechltd/calmtech-marketplace
claude plugin install calm-craft@calmtech
claude plugin install calm-connect@calmtech
```

The Claude catalog uses `github` sources. [Source format](https://code.claude.com/docs/en/plugin-marketplaces#choose-a-plugin-source).

### Cursor

Import the plugin repositories directly in Cursor's plugin settings:

- `https://github.com/calmtechltd/calm-craft`
- `https://github.com/calmtechltd/calm-connect`

For a team marketplace, use Dashboard → Plugins & MCPs → Add to Marketplace to add the source repositories, then choose the existing access audience. For a personal installation, use Customize to add a plugin from its repository. Choose user scope to make it available across projects.

Cursor supports root `plugin.json` Agent Plugins. Its documented multi-plugin marketplace manifest resolves directories within the imported repository; this catalog does not supply that manifest. An existing Cursor import of `calmtech-marketplace` must be replaced with the plugin source repository imports. [Cursor plugin documentation](https://prod.cursor.com/docs/plugins), [marketplace manifest reference](https://prod.cursor.com/docs/reference/plugins#cursor-multi-plugin-repositories).

## Updates

Both catalogs track each plugin's `main` branch. Refresh or update plugins through the agent host's plugin manager. The plugin repository owns its version and release contents. A new plugin release does not require copying files or opening a snapshot-sync PR in this repository.

To refresh the catalog's listing metadata in Codex:

```sh
codex plugin marketplace upgrade calmtech
```

Refresh or update the installed plugins separately through the plugin manager to pick up new plugin versions and assets.

Change `ref` in `plugins.json` if the catalog should select a release tag instead of `main`. Update the entry's `interface` fields when its display name, subtitle, publisher or brand color changes.

## Maintain the catalog

Edit the repository references and catalog metadata in [`plugins.json`](plugins.json), then run:

```sh
npm run generate
npm run validate
git diff --check
```

Generation is local and does not fetch or execute plugin source code. CI checks the repository-reference catalogs and rejects embedded package outputs. Additions and source changes go through a pull request.
