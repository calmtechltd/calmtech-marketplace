import { execFile } from "node:child_process";
import {
  cp,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, normalize, resolve, sep } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const root = resolve(import.meta.dirname, "..");
const registry = JSON.parse(await readFile(join(root, "plugins.json"), "utf8"));
const temporaryRoot = await mkdtemp(join(tmpdir(), "calmtech-marketplace-"));
const localSourceRoot = process.env.CALMTECH_SOURCE_ROOT
  ? resolve(process.env.CALMTECH_SOURCE_ROOT)
  : null;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function validateRegistryEntry(plugin) {
  assert(/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/u.test(plugin.name), `Invalid plugin name: ${plugin.name}`);
  assert(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(plugin.repository), `Invalid repository: ${plugin.repository}`);
  assert(
    typeof plugin.ref === "string" &&
      /^[A-Za-z0-9][A-Za-z0-9._/-]*$/u.test(plugin.ref) &&
      !plugin.ref.includes(".."),
    `Invalid Git ref for ${plugin.name}: ${plugin.ref}`,
  );
  assert(
    ["ON_INSTALL", "ON_USE"].includes(plugin.authentication),
    `Invalid authentication policy for ${plugin.name}.`,
  );
  assert(Array.isArray(plugin.include) && plugin.include.length > 0, `No include paths for ${plugin.name}.`);
  for (const path of plugin.include) {
    const normalized = normalize(path);
    assert(
      typeof path === "string" &&
        path.length > 0 &&
        !isAbsolute(path) &&
        normalized !== ".." &&
        !normalized.startsWith(`..${sep}`),
      `Unsafe include path for ${plugin.name}: ${path}`,
    );
  }
}

async function run(command, args, options = {}) {
  const result = await execFileAsync(command, args, {
    encoding: "utf8",
    maxBuffer: 4 * 1024 * 1024,
    ...options,
  });
  return result.stdout.trim();
}

async function sourceFor(plugin) {
  if (localSourceRoot) {
    const source = join(localSourceRoot, plugin.name);
    const status = await run("git", ["-C", source, "status", "--porcelain"]);
    assert(status === "", `Local source has uncommitted changes: ${source}`);
    const commit = await run("git", ["-C", source, "rev-parse", "HEAD"]);
    return { source, commit };
  }

  const source = join(temporaryRoot, "sources", plugin.name);
  await mkdir(dirname(source), { recursive: true });
  await run("git", [
    "clone",
    "--quiet",
    "--filter=blob:none",
    "--no-checkout",
    `https://github.com/${plugin.repository}.git`,
    source,
  ]);
  await run("git", ["-C", source, "checkout", "--quiet", "--detach", plugin.ref]);
  const commit = await run("git", ["-C", source, "rev-parse", "HEAD"]);
  return { source, commit };
}

async function rejectSymlinks(path, label) {
  const metadata = await lstat(path);
  assert(!metadata.isSymbolicLink(), `Symlinks are not published: ${label}`);
  if (!metadata.isDirectory()) return;
  for (const entry of await readdir(path)) {
    await rejectSymlinks(join(path, entry), `${label}/${entry}`);
  }
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function validatePackage(pluginRoot, expectedName) {
  const portable = await readJson(join(pluginRoot, "plugin.json"));
  const codex = await readJson(join(pluginRoot, ".codex-plugin", "plugin.json"));
  const claude = await readJson(join(pluginRoot, ".claude-plugin", "plugin.json"));

  assert(
    portable.$schema === "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
    `${expectedName} does not use Agent Plugin v1.`,
  );
  assert(portable.name === expectedName, `${expectedName} has a mismatched portable manifest name.`);
  assert(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u.test(portable.version), `${expectedName} must use a semantic version.`);
  for (const [client, manifest] of [
    ["Codex", codex],
    ["Claude", claude],
  ]) {
    assert(manifest.name === expectedName, `${expectedName} has a mismatched ${client} manifest name.`);
    assert(manifest.version === portable.version, `${expectedName} has a mismatched ${client} version.`);
  }

  const packageText = JSON.stringify({ portable, codex, claude });
  assert(
    !/(api[_-]?key|client[_-]?secret|authorization|bearer\s)/iu.test(packageText),
    `${expectedName} contains a credential-shaped manifest value.`,
  );
  return portable;
}

function json(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

async function stageJson(path, value) {
  const destination = join(temporaryRoot, "output", path);
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, json(value));
}

assert(Array.isArray(registry.plugins) && registry.plugins.length > 0, "plugins.json has no plugins.");
const names = new Set();
const resolvedPlugins = [];
await mkdir(join(temporaryRoot, "output", "plugins"), { recursive: true });

for (const plugin of registry.plugins) {
  validateRegistryEntry(plugin);
  assert(!names.has(plugin.name), `Duplicate plugin: ${plugin.name}`);
  names.add(plugin.name);

  const { source, commit } = await sourceFor(plugin);
  const destination = join(temporaryRoot, "output", "plugins", plugin.name);
  await mkdir(destination, { recursive: true });
  for (const includedPath of plugin.include) {
    const sourcePath = join(source, includedPath);
    await rejectSymlinks(sourcePath, `${plugin.name}/${includedPath}`);
    await cp(sourcePath, join(destination, includedPath), {
      recursive: true,
      errorOnExist: true,
      force: false,
    });
  }

  const manifest = await validatePackage(destination, plugin.name);
  assert(
    manifest.repository === `https://github.com/${plugin.repository}`,
    `${plugin.name} repository metadata does not match plugins.json.`,
  );
  resolvedPlugins.push({ ...plugin, commit, manifest });
}

await stageJson("plugins.lock.json", {
  version: 1,
  plugins: resolvedPlugins.map(({ name, repository, ref, commit, manifest }) => ({
    name,
    repository,
    ref,
    commit,
    version: manifest.version,
  })),
});

await stageJson(".agents/plugins/marketplace.json", {
  name: "calmtech",
  interface: { displayName: "Calmtech" },
  plugins: resolvedPlugins.map(({ name, category, authentication }) => ({
    name,
    source: { source: "local", path: `./plugins/${name}` },
    policy: { installation: "AVAILABLE", authentication },
    category,
  })),
});

await stageJson(".claude-plugin/marketplace.json", {
  name: "calmtech",
  owner: { name: "Calmtech" },
  description: "Plugins from Calmtech for better delivery and connected compliance work.",
  plugins: resolvedPlugins.map(({ name, category, manifest }) => ({
    name,
    source: `./plugins/${name}`,
    description: manifest.description,
    version: manifest.version,
    author: manifest.author,
    homepage: manifest.homepage,
    repository: manifest.repository,
    license: manifest.license,
    keywords: manifest.keywords,
    category,
  })),
});

await stageJson(".cursor-plugin/marketplace.json", {
  name: "calmtech",
  owner: { name: "Calmtech" },
  metadata: {
    description: "Plugins from Calmtech for better delivery and connected compliance work.",
  },
  plugins: resolvedPlugins.map(({ name, category, manifest }) => ({
    name,
    source: `plugins/${name}`,
    description: manifest.description,
    version: manifest.version,
    author: manifest.author,
    category,
    tags: manifest.keywords,
  })),
});

const generatedPaths = [
  "plugins",
  "plugins.lock.json",
  ".agents/plugins/marketplace.json",
  ".claude-plugin/marketplace.json",
  ".cursor-plugin/marketplace.json",
];

for (const path of generatedPaths) {
  const destination = join(root, path);
  await rm(destination, { recursive: true, force: true });
  await mkdir(dirname(destination), { recursive: true });
  await rename(join(temporaryRoot, "output", path), destination);
}

await rm(temporaryRoot, { recursive: true, force: true });
process.stdout.write(`Synced ${resolvedPlugins.length} plugins: ${resolvedPlugins.map(({ name }) => name).join(", ")}.\n`);
