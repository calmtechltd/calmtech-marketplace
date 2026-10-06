import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lstat, readFile, readdir } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";

export const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
export const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));

export function safeRelativePath(path) {
  assert(typeof path === "string" && path.length > 0 && !isAbsolute(path), `Invalid relative path: ${path}`);
  const parts = path.replace(/^\.\//u, "").split("/");
  assert(parts.every((part) => part && ![".", "..", ".git"].includes(part) && !part.includes("\\")), `Unsafe path: ${path}`);
  return parts.join("/");
}

export function validateRegistry({ plugins }) {
  assert(Array.isArray(plugins) && plugins.length > 0, "Missing plugin registry.");
  const names = new Set();
  for (const plugin of plugins) {
    assert(Object.keys(plugin).every((key) => ["name", "repository", "ref", "include", "category", "authentication"].includes(key)), "Unsupported registry field.");
    assert(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(plugin.name), "Invalid plugin name.");
    assert(!names.has(plugin.name), `Duplicate plugin: ${plugin.name}`);
    names.add(plugin.name);
    assert(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(plugin.repository), "Invalid repository.");
    assert(typeof plugin.ref === "string" && /^[A-Za-z0-9][A-Za-z0-9._/-]*$/u.test(plugin.ref) && !plugin.ref.includes(".."), "Invalid Git ref.");
    assert(typeof plugin.category === "string" && plugin.category.trim(), "Missing category.");
    assert(["ON_INSTALL", "ON_USE"].includes(plugin.authentication), "Invalid authentication policy.");
    assert(Array.isArray(plugin.include) && plugin.include.length > 0, "Missing package include paths.");
    const includes = plugin.include.map(safeRelativePath);
    assert(includes.includes("plugin.json") && includes.includes("assets"), "Include the portable manifest and branding assets.");
    assert(new Set(includes).size === includes.length, "Duplicate include paths.");
    assert(!includes.some((path) => includes.some((other) => other !== path && path.startsWith(`${other}/`))), "Overlapping include paths.");
  }
  return plugins;
}

export async function inventory(root) {
  const files = [];
  async function visit(path) {
    const metadata = await lstat(path);
    assert(!metadata.isSymbolicLink(), `Symlinks are not published: ${path}`);
    if (metadata.isDirectory()) {
      for (const entry of (await readdir(path)).sort()) await visit(join(path, entry));
    } else {
      assert(metadata.isFile(), `Unsupported package file: ${path}`);
      files.push({
        path: relative(root, path).split("\\").join("/"),
        sha256: createHash("sha256").update(await readFile(path)).digest("hex"),
        executable: Boolean(metadata.mode & 0o111),
      });
    }
  }
  await visit(root);
  return files;
}

async function asset(root, path) {
  assert(typeof path === "string" && path.startsWith("./"), `Asset must start with ./: ${path}`);
  const target = resolve(root, safeRelativePath(path));
  const metadata = await lstat(target);
  assert(metadata.isFile() && !metadata.isSymbolicLink() && metadata.size > 0, `Missing or empty asset: ${path}`);
}

export async function validatePackage(root, plugin) {
  const portable = await readJson(join(root, "plugin.json"));
  assert.equal(portable.$schema, "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json");
  assert.equal(portable.name, plugin.name);
  assert(typeof portable.description === "string" && portable.description.trim(), "Missing plugin description.");
  assert(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u.test(portable.version), "Invalid plugin version.");
  assert.equal(portable.repository, `https://github.com/${plugin.repository}`);
  const codex = await readJson(join(root, ".codex-plugin/plugin.json"));
  const claude = await readJson(join(root, ".claude-plugin/plugin.json"));
  for (const overlay of [codex, claude]) {
    assert.equal(overlay.name, portable.name);
    assert.equal(overlay.version, portable.version);
  }
  const openai = portable.extensions?.["com.openai"] ?? codex;
  for (const overlay of [openai, codex]) {
    const listing = overlay.interface;
    assert(listing && listing.displayName && listing.shortDescription, "Missing listing name or description.");
    assert(listing.logo && listing.composerIcon, "Missing listing branding.");
    for (const field of ["logo", "logoDark", "composerIcon", "composerIconDark"]) {
      if (listing[field] !== undefined) await asset(root, listing[field]);
    }
    for (const path of listing.screenshots ?? []) await asset(root, path);
    for (const field of ["apps", "mcpServers", "skills", "onboardingSkill"]) {
      for (const path of [overlay[field]].flat().filter((value) => typeof value === "string")) {
        await lstat(join(root, safeRelativePath(path.replace(/\/$/u, ""))));
      }
    }
  }
  if (plugin.include.includes("skills")) {
    for (const skill of await readdir(join(root, "skills"), { withFileTypes: true })) {
      if (!skill.isDirectory()) continue;
      const skillRoot = join(root, "skills", skill.name);
      await lstat(join(skillRoot, "SKILL.md"));
      let metadata;
      try { metadata = await readFile(join(skillRoot, "agents/openai.yaml"), "utf8"); } catch (error) {
        if (error.code === "ENOENT") continue;
        throw error;
      }
      for (const match of metadata.matchAll(/^\s*icon_(?:small|large):\s*["']?([^\s"']+)["']?\s*$/gmu)) {
        await asset(skillRoot, `./${match[1].replace(/^\.\//u, "")}`);
      }
    }
  }
  return portable;
}

export function catalogs(plugins, manifests) {
  return {
    ".agents/plugins/marketplace.json": {
      name: "calmtech", interface: { displayName: "Calmtech" },
      plugins: plugins.map(({ name, authentication, category }) => ({
        name, source: { source: "local", path: `./plugins/${name}` },
        policy: { installation: "AVAILABLE", authentication }, category,
      })),
    },
    ".claude-plugin/marketplace.json": {
      name: "calmtech", owner: { name: "Calmtech" },
      description: "Plugins from Calmtech for delivery workflows and connected compliance work.",
      plugins: plugins.map(({ name, category }, index) => ({
        name, source: `./plugins/${name}`, description: manifests[index].description,
        version: manifests[index].version, category,
      })),
    },
  };
}
