# Contributing

Add or change a plugin repository reference through `plugins.json`. Generated catalogs must come from `npm run generate`.

Before opening a pull request:

```sh
npm run generate
npm run validate
git diff --check
```

Keep source repositories and refs explicit. Plugin code, skills, references, assets and version metadata belong in the plugin repository. Never add embedded packages, submodules, credentials, authorization headers, customer identifiers, or private source repositories to this public catalog.
