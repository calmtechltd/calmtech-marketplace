# Calmtech Marketplace

<img src="./calm-mark.png" alt="Calmtech" width="96" />

A marketplace distributing generated bundles of Calmtech's plugins:

- [Calm Craft](https://github.com/calmtechltd/calm-craft): specs, implementation planning, reviews and conventions.
- [Calm Connect](https://github.com/calmtechltd/calm-connect): the AI companion to [Calm Compliance](https://www.calmcompliance.com).

The source repositories own their skills, references, assets, manifests and versions. This marketplace copies the declared package files from exact source commits. Codex can therefore read names, descriptions and branded icons before installation. Application repositories keep their project-specific skills, specs, conventions and engineering settings.

## Install

### Codex

```sh
codex plugin marketplace add calmtechltd/calmtech-marketplace
codex plugin add calm-craft@calmtech
codex plugin add calm-connect@calmtech
```

The Codex catalog points at local bundles under `./plugins/`. Install through the desktop plugin manager or CLI. [Marketplace source format](https://developers.openai.com/plugins/build/plugins#marketplace-metadata).

### Claude Code

```sh
claude plugin marketplace add calmtechltd/calmtech-marketplace
claude plugin install calm-craft@calmtech
claude plugin install calm-connect@calmtech
```

The Claude catalog uses relative paths to the same bundles.

### Cursor

Import the plugin repositories directly in Cursor's plugin settings:

- `https://github.com/calmtechltd/calm-craft`
- `https://github.com/calmtechltd/calm-connect`

For a team marketplace, use Dashboard → Plugins & MCPs → Add to Marketplace to add the source repositories, then choose the existing access audience. For a personal installation, use Customize to add a plugin from its repository. Choose user scope to make it available across projects.

Cursor supports root `plugin.json` Agent Plugins. This repository does not generate a Cursor marketplace. An existing Cursor import of `calmtech-marketplace` must be replaced with the plugin source repository imports.

## Automatic updates

The **Refresh plugin bundles** GitHub Action checks the configured refs in `plugins.json` every hour at 17 minutes past the hour. Scheduled runs make one commit-lookup request per source repository and skip bundle generation, tests and publication when the commits match the lock. It also runs when the registry or generator changes on `main`, and can be started from Actions → Refresh plugin bundles → Run workflow.

The marketplace is public and uses the standard `ubuntu-latest` runner, whose execution is free for public repositories. The source check avoids unnecessary work and PRs. The workflow uses no AI model or metered AI tokens; its GitHub authentication token is used for API access. These runs do not use paid Actions minutes. [GitHub runner billing](https://docs.github.com/en/actions/reference/runners/github-hosted-runners#standard-github-hosted-runners-for-public-repositories).

The workflow also accepts `repository_dispatch` events of type `plugin-updated` for immediate source notifications. A sender in another repository needs a GitHub App or a token with access to this marketplace: its built-in `GITHUB_TOKEN` is limited to its own repository. No sender is configured; the hourly check requires no source-repository changes or cross-repository secret. [GitHub token scope](https://docs.github.com/en/actions/concepts/security/github_token#about-the-github_token).

When the source commits change, the action fetches the declared package files, validates the bundles and branding, and opens a refresh PR. It records each source repository, ref, commit, version, file hash and executable flag in `plugins.lock.json`. The PR links to the source commits. A newer successful proposal closes older open refresh PRs created by this automation, keeping their branches and history. Existing proposals are reused; deliberately closed proposals are not reopened.

**Validated, versioned refresh PRs publish automatically.** After the validation workflow reproduces the locked bundle successfully, a separate trusted workflow merges only an open GitHub Actions PR at that exact validated head, with changes confined to bundles, locks and catalogs. Human PRs and automation changes still need normal review. Changed plugin contents with a reused version are left unpublished. No change means no new PR.

The action uses this repository's `GITHUB_TOKEN`, with write permissions limited to its refresh job. Enable Settings → Actions → General → Workflow permissions → **Allow GitHub Actions to create and approve pull requests**. No personal token or cross-repository secret is required for these public source repositories. The publisher explicitly dispatches the validation workflow because token-created PR checks otherwise require approval. [GitHub token behavior](https://docs.github.com/en/actions/concepts/security/github_token#when-github_token-triggers-workflow-runs).

After a refresh PR merges, update the marketplace on each machine:

```sh
codex plugin marketplace upgrade calmtech
```

Then update installed plugins through the host's plugin manager. The scheduled action updates the GitHub marketplace, not the caches on individual machines.

## Maintain the bundles

Edit source repositories for plugin content changes. Edit `plugins.json` for source refs, package include paths, categories and installation policies. Do not edit `plugins/`, the generated catalogs or `plugins.lock.json` by hand.

To select the latest configured source commits:

```sh
npm run refresh
npm test
npm run validate
git diff --check
```

To reproduce the already selected commits:

```sh
npm run generate
```

CI uses locked generation and rejects any difference from the committed bundles. A moving source branch cannot silently change a PR's contents during validation. Generation stages all packages before replacing outputs and never runs code from fetched source repositories. Only declared paths are copied; symlinks, unsafe paths, missing branding, inconsistent versions and altered bundle files or executable flags fail validation.

For local fixture repositories, set `CALMTECH_SOURCE_ROOT` to a directory containing one Git repository per plugin name. The generator fetches committed data from the configured ref or locked SHA, including in this mode; uncommitted working files are not published.
