import { lstat, readFile, readdir } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function json(path) {
  return JSON.parse(await readFile(join(root, path), "utf8"));
}

async function rejectSymlinks(path, label) {
  const metadata = await lstat(path);
  assert(!metadata.isSymbolicLink(), `Generated marketplace contains a symlink: ${label}`);
  if (!metadata.isDirectory()) return;
  for (const entry of await readdir(path)) {
    await rejectSymlinks(join(path, entry), `${label}/${entry}`);
  }
}

const registry = await json("plugins.json");
const lock = await json("plugins.lock.json");
const codex = await json(".agents/plugins/marketplace.json");
const claude = await json(".claude-plugin/marketplace.json");
const cursor = await json(".cursor-plugin/marketplace.json");

assert(Array.isArray(registry.plugins) && registry.plugins.length > 0, "plugins.json has no plugins.");
assert(lock.version === 1 && Array.isArray(lock.plugins), "Unsupported plugins.lock.json format.");
assert(codex.name === "calmtech", "Unexpected Codex marketplace name.");
assert(claude.name === "calmtech", "Unexpected Claude marketplace name.");
assert(cursor.name === "calmtech", "Unexpected Cursor marketplace name.");

const registryNames = registry.plugins.map(({ name }) => name);
const pluginDirectories = (await readdir(join(root, "plugins"), { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map(({ name }) => name);

for (const [label, names] of [
  ["lock", lock.plugins.map(({ name }) => name)],
  ["Codex marketplace", codex.plugins.map(({ name }) => name)],
  ["Claude marketplace", claude.plugins.map(({ name }) => name)],
  ["Cursor marketplace", cursor.plugins.map(({ name }) => name)],
]) {
  assert(JSON.stringify(names) === JSON.stringify(registryNames), `${label} order does not match plugins.json.`);
}
assert(
  JSON.stringify(pluginDirectories.toSorted()) === JSON.stringify(registryNames.toSorted()),
  "Generated plugin directories do not match plugins.json.",
);

for (const [index, plugin] of registry.plugins.entries()) {
  const pluginRoot = join(root, "plugins", plugin.name);
  const portable = await json(`plugins/${plugin.name}/plugin.json`);
  const codexPlugin = await json(`plugins/${plugin.name}/.codex-plugin/plugin.json`);
  const claudePlugin = await json(`plugins/${plugin.name}/.claude-plugin/plugin.json`);
  const locked = lock.plugins[index];

  assert(/^[0-9a-f]{40}$/u.test(locked.commit), `Invalid locked commit for ${plugin.name}.`);
  assert(locked.repository === plugin.repository, `Locked repository mismatch for ${plugin.name}.`);
  assert(locked.ref === plugin.ref, `Locked ref mismatch for ${plugin.name}.`);
  assert(locked.version === portable.version, `Locked version mismatch for ${plugin.name}.`);
  assert(portable.name === plugin.name, `Portable manifest mismatch for ${plugin.name}.`);
  assert(codexPlugin.name === plugin.name, `Codex manifest mismatch for ${plugin.name}.`);
  assert(claudePlugin.name === plugin.name, `Claude manifest mismatch for ${plugin.name}.`);
  assert(codexPlugin.version === portable.version, `Codex version mismatch for ${plugin.name}.`);
  assert(claudePlugin.version === portable.version, `Claude version mismatch for ${plugin.name}.`);
  assert(
    portable.repository === `https://github.com/${plugin.repository}`,
    `Repository metadata mismatch for ${plugin.name}.`,
  );

  const codexEntry = codex.plugins[index];
  assert(codexEntry.source?.source === "local", `Codex source type mismatch for ${plugin.name}.`);
  assert(codexEntry.source.path === `./plugins/${plugin.name}`, `Codex source path mismatch for ${plugin.name}.`);
  assert(codexEntry.policy?.installation === "AVAILABLE", `Codex installation policy mismatch for ${plugin.name}.`);
  assert(codexEntry.policy.authentication === plugin.authentication, `Codex authentication policy mismatch for ${plugin.name}.`);
  assert(codexEntry.category === plugin.category, `Codex category mismatch for ${plugin.name}.`);

  assert(claude.plugins[index].source === `./plugins/${plugin.name}`, `Claude source path mismatch for ${plugin.name}.`);
  assert(cursor.plugins[index].source === `plugins/${plugin.name}`, `Cursor source path mismatch for ${plugin.name}.`);
  for (const listing of [codexPlugin.interface, portable.extensions?.["com.openai"]?.interface]) {
    if (!listing) continue;
    for (const field of ["logo", "logoDark", "composerIcon", "composerIconDark"]) {
      const asset = listing[field];
      if (asset === undefined) continue;
      assert(typeof asset === "string" && asset.length > 0 && !isAbsolute(asset), `Invalid ${field} for ${plugin.name}.`);
      const assetPath = resolve(pluginRoot, asset);
      const fromRoot = relative(pluginRoot, assetPath);
      assert(!fromRoot.startsWith("..") && !isAbsolute(fromRoot), `${plugin.name} ${field} escapes the package.`);
      const metadata = await lstat(assetPath);
      assert(metadata.isFile() && metadata.size > 0, `${plugin.name} ${field} asset is missing or empty.`);
    }
  }
  await rejectSymlinks(pluginRoot, `plugins/${plugin.name}`);
}

const calmConnectMcp = await json("plugins/calm-connect/mcp.json");
const calmConnectCodexMcp = await json("plugins/calm-connect/.mcp.json");
assert(
  calmConnectMcp.mcpServers?.calm?.url === "https://app.calmcompliance.com/mcp",
  "Calm Connect portable endpoint changed.",
);
assert(
  calmConnectCodexMcp.mcpServers?.calm?.url === "https://app.calmcompliance.com/mcp",
  "Calm Connect Codex endpoint changed.",
);

process.stdout.write(`Validated ${registry.plugins.length} marketplace plugins.\n`);
