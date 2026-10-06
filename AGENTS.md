# Repository instructions

`plugins.json` is the source of truth for plugin repositories, refs, package include paths and installation policies.

Do not edit `plugins/`, `plugins.lock.json`, `.agents/plugins/marketplace.json` or `.claude-plugin/marketplace.json` by hand. They are generated bundles and catalogs. Run `npm run refresh` to select the latest configured source refs, or `npm run generate` to reproduce the commits already recorded in the lock. Run `npm test`, `npm run validate` and `git diff --check` before submitting changes.

Plugin source repositories own their skills, references, assets, manifests and versions. This marketplace distributes generated copies so Codex can read branding before installation. Change plugin contents in their source repository, then regenerate; do not patch the copies here. Keep each source repository, Git ref and include path explicit. Do not copy entire repositories, add submodules, or run code from fetched plugin repositories during generation.

The scheduled refresh workflow opens a PR when source commits change and retires older proposals owned by the automation. Generated refreshes must pass validation before publication. Changes to source refs, include paths or automation code need a normal review.

Cursor users import the plugin source repositories directly through their plugin settings. Do not invent external-repository entries in Cursor's directory-based marketplace manifest.
