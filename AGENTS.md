# Repository instructions

`plugins.json` is the source of truth for plugin repository references.

Do not edit `.agents/plugins/marketplace.json` or `.claude-plugin/marketplace.json` by hand. Run `npm run generate`, then `npm run validate`.

Add a plugin through a pull request to `plugins.json`. Keep each source repository and Git ref explicit. Plugin skills, references, assets and versions remain in the plugin repository; this marketplace contains catalog metadata only. Do not embed packages, add submodules, or copy plugin content here.

Cursor users import the plugin source repositories directly through their plugin settings. Do not invent external-repository entries in Cursor's directory-based marketplace manifest.
