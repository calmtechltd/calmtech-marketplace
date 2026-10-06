import assert from "node:assert/strict";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const { plugins } = JSON.parse(await readFile(join(root, "plugins.json"), "utf8"));
assert(Array.isArray(plugins) && plugins.length > 0, "plugins.json has no plugins.");
const names = new Set();
const fields = ["name", "repository", "ref", "description", "category", "authentication"];
for (const plugin of plugins) {
  assert(Object.keys(plugin).every((key) => fields.includes(key)), "Only repository catalog fields are supported.");
  assert(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(plugin.name), "Invalid plugin name.");
  assert(!names.has(plugin.name), `Duplicate plugin: ${plugin.name}`);
  names.add(plugin.name);
  assert(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(plugin.repository), "Invalid repository.");
  assert(typeof plugin.ref === "string" && /^[A-Za-z0-9][A-Za-z0-9._/-]*$/u.test(plugin.ref) && !plugin.ref.includes(".."), "Invalid Git ref.");
  assert(typeof plugin.description === "string" && plugin.description.length > 0, "Missing description.");
  assert(typeof plugin.category === "string" && plugin.category.length > 0, "Missing category.");
  assert(["ON_INSTALL", "ON_USE"].includes(plugin.authentication), "Invalid authentication policy.");
}

const catalogs = {
  ".agents/plugins/marketplace.json": {
    name: "calmtech",
    interface: { displayName: "Calmtech" },
    plugins: plugins.map(({ name, repository, ref, authentication, category }) => ({
      name,
      source: { source: "url", url: `https://github.com/${repository}.git`, ref },
      policy: { installation: "AVAILABLE", authentication },
      category,
    })),
  },
  ".claude-plugin/marketplace.json": {
    name: "calmtech",
    owner: { name: "Calmtech" },
    description: "Repository-backed Calmtech plugins for delivery workflows and connected compliance work.",
    plugins: plugins.map(({ name, repository, ref, description, category }) => ({
      name,
      source: { source: "github", repo: repository, ref },
      description,
      category,
    })),
  },
};
for (const [path, catalog] of Object.entries(catalogs)) {
  const destination = join(root, path);
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, `${JSON.stringify(catalog, null, 2)}\n`);
}
// Retire outputs of the former package-copying generator.
await rm(join(root, "plugins"), { recursive: true, force: true });
await rm(join(root, "plugins.lock.json"), { force: true });
await rm(join(root, ".cursor-plugin"), { recursive: true, force: true });
process.stdout.write(`Generated repository references for ${plugins.length} plugins.\n`);
