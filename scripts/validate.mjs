import assert from "node:assert/strict";
import { readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { catalogs, inventory, readJson, validatePackage, validateRegistry } from "./bundles.mjs";

const root = resolve(import.meta.dirname, "..");
const plugins = validateRegistry(await readJson(join(root, "plugins.json")));
const lock = await readJson(join(root, "plugins.lock.json"));
assert.equal(lock.version, 1);
assert.deepEqual(lock.plugins.map(({ name }) => name), plugins.map(({ name }) => name));
assert.deepEqual((await readdir(join(root, "plugins"))).sort(), plugins.map(({ name }) => name).sort());
const manifests = [];
for (const [index, plugin] of plugins.entries()) {
  const record = lock.plugins[index];
  assert.equal(record.repository, plugin.repository);
  assert.equal(record.ref, plugin.ref);
  assert(/^[0-9a-f]{40}$/u.test(record.commit), "Invalid locked source commit.");
  const pluginRoot = join(root, "plugins", plugin.name);
  const files = await inventory(pluginRoot);
  assert(files.every(({ path }) => plugin.include.some((included) => path === included || path.startsWith(`${included}/`))), "Bundle contains undeclared files.");
  assert.deepEqual(files, record.files, `Bundle content or modes changed for ${plugin.name}. Regenerate from its source repository.`);
  const manifest = await validatePackage(pluginRoot, plugin);
  assert.equal(manifest.version, record.version);
  manifests.push(manifest);
}
for (const [path, expected] of Object.entries(catalogs(plugins, manifests))) {
  assert.deepEqual(await readJson(join(root, path)), expected, `Generated catalog differs: ${path}`);
}
process.stdout.write(`Validated ${plugins.length} source-locked plugin bundles and their branding.\n`);
