# Contributing

Add or change a plugin through `plugins.json`. Generated files must come from `npm run sync`.

Before opening a pull request:

```sh
CALMTECH_SOURCE_ROOT=.. npm run sync
npm run validate
git diff --check
```

Keep source repositories, refs, and included paths explicit. Never add credentials, authorization headers, customer identifiers, or private source repositories to the public marketplace.
