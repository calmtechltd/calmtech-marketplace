# Repository instructions

`plugins.json` is the source of truth for published plugins.

Do not edit `plugins/`, `plugins.lock.json`, `.agents/plugins/marketplace.json`, `.claude-plugin/marketplace.json`, or `.cursor-plugin/marketplace.json` by hand. Run `npm run sync` to regenerate them, then run `npm run validate`.

Add a plugin through a pull request to `plugins.json`. Keep every source repository and included path explicit. Do not discover or publish repositories from names or topics.
