import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const read = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const registry = await read("plugins.json");
const codex = await read(".agents/plugins/marketplace.json");
const claude = await read(".claude-plugin/marketplace.json");
assert(Array.isArray(registry.plugins) && registry.plugins.length > 0, "Missing plugin registry.");
assert.equal(codex.name, "calmtech");
assert.equal(claude.name, "calmtech");
assert.equal(claude.owner.name, "Calmtech");
const names = registry.plugins.map(({ name }) => name);
assert.equal(new Set(names).size, names.length, "Duplicate plugin names.");
for (const catalog of [codex, claude]) {
  assert.deepEqual(catalog.plugins.map(({ name }) => name), names);
}
for (const [index, plugin] of registry.plugins.entries()) {
  assert(!("include" in plugin), "Plugin contents must remain in their source repositories.");
  assert.deepEqual(codex.plugins[index].source, {
    source: "url", url: `https://github.com/${plugin.repository}.git`, ref: plugin.ref,
  });
  assert.deepEqual(claude.plugins[index].source, {
    source: "github", repo: plugin.repository, ref: plugin.ref,
  });
  assert.deepEqual(codex.plugins[index].policy, {
    installation: "AVAILABLE", authentication: plugin.authentication,
  });
  assert.equal(codex.plugins[index].category, plugin.category);
  assert.equal(codex.plugins[index].description, plugin.description);
  assert.deepEqual(codex.plugins[index].interface, plugin.interface);
  assert.equal(claude.plugins[index].description, plugin.description);
  assert.equal(claude.plugins[index].category, plugin.category);
  for (const catalog of [codex, claude]) {
    assert(!("version" in catalog.plugins[index]), "The plugin repository owns its version.");
  }
}
for (const path of ["plugins", "plugins.lock.json", ".cursor-plugin/marketplace.json"]) {
  let exists = true;
  try { await access(join(root, path)); } catch (error) {
    if (error.code !== "ENOENT") throw error;
    exists = false;
  }
  assert(!exists, `Retired embedded-package output remains: ${path}`);
}
process.stdout.write(`Validated ${names.length} repository-backed plugin entries.\n`);
