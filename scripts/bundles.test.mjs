import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { chmod, cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { inventory, json, readJson, safeRelativePath, validatePackage, validateRegistry } from "./bundles.mjs";

const scripts = import.meta.dirname;
const plugin = { name: "sample", repository: "calmtechltd/sample", ref: "main", category: "Developer Tools", authentication: "ON_USE", include: ["plugin.json", ".codex-plugin", ".claude-plugin", "assets", "skills"] };
const listing = { displayName: "Sample", shortDescription: "Sample plugin", logo: "./assets/icon.png", composerIcon: "./assets/icon.png" };
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), "bundle-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = join(root, "sources", plugin.name);
  async function file(path, data) {
    await mkdir(dirname(join(source, path)), { recursive: true });
    await writeFile(join(source, path), data);
  }
  const manifest = { $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json", name: plugin.name, description: "Sample plugin", version: "1.0.0", repository: `https://github.com/${plugin.repository}`, extensions: { "com.openai": { interface: listing } } };
  await file("plugin.json", json(manifest));
  await file(".codex-plugin/plugin.json", json({ name: plugin.name, version: manifest.version, interface: listing }));
  await file(".claude-plugin/plugin.json", json({ name: plugin.name, version: manifest.version }));
  await file("assets/icon.png", Buffer.from([0, 1, 255, 2]));
  await file("skills/sample/SKILL.md", "---\nname: sample\ndescription: Sample\n---\nDo the sample work.\n");
  await file("skills/sample/run.sh", "#!/bin/sh\nexit 0\n");
  await chmod(join(source, "skills/sample/run.sh"), 0o755);
  const git = (...args) => execFileSync("git", ["-C", source, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  git("init", "-q", "-b", "main");
  const commit = () => { git("add", "."); git("-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-qm", "Fixture update"); return git("rev-parse", "HEAD"); };
  const initial = commit();
  const marketplace = join(root, "marketplace");
  await mkdir(join(marketplace, "scripts"), { recursive: true });
  for (const name of ["bundles.mjs", "generate.mjs", "validate.mjs"]) await cp(join(scripts, name), join(marketplace, "scripts", name));
  await writeFile(join(marketplace, "plugins.json"), json({ plugins: [plugin] }));
  const run = (script, ...args) => spawnSync(process.execPath, [join(marketplace, "scripts", script), ...args], { encoding: "utf8", env: { ...process.env, CALMTECH_SOURCE_ROOT: join(root, "sources") } });
  const ok = (script, ...args) => { const result = run(script, ...args); assert.equal(result.status, 0, result.stderr); return result; };
  return { root, source, marketplace, file, git, commit, initial, run, ok };
}

test("refresh preserves source bytes/modes, and locked generation ignores later commits", async (t) => {
  const f = await fixture(t);
  f.ok("generate.mjs", "--refresh");
  f.ok("validate.mjs");
  const lock = await readFile(join(f.marketplace, "plugins.lock.json"), "utf8");
  assert.equal(JSON.parse(lock).plugins[0].commit, f.initial);
  assert.deepEqual(await readFile(join(f.marketplace, "plugins/sample/assets/icon.png")), Buffer.from([0, 1, 255, 2]));
  assert((await inventory(join(f.marketplace, "plugins/sample"))).find(({ path }) => path.endsWith("run.sh")).executable);
  await f.file("assets/icon.png", Buffer.from([7, 8, 9]));
  const next = f.commit();
  f.ok("generate.mjs");
  assert.equal(await readFile(join(f.marketplace, "plugins.lock.json"), "utf8"), lock);
  f.ok("generate.mjs", "--refresh");
  assert.equal((await readJson(join(f.marketplace, "plugins.lock.json"))).plugins[0].commit, next);
  assert.deepEqual(await readFile(join(f.marketplace, "plugins/sample/assets/icon.png")), Buffer.from([7, 8, 9]));
});

test("failed refresh leaves the previous published bundles and lock intact", async (t) => {
  const f = await fixture(t);
  f.ok("generate.mjs", "--refresh");
  const lock = await readFile(join(f.marketplace, "plugins.lock.json"), "utf8");
  const before = await inventory(join(f.marketplace, "plugins"));
  await rm(join(f.source, "assets/icon.png"));
  f.commit();
  assert.notEqual(f.run("generate.mjs", "--refresh").status, 0);
  assert.equal(await readFile(join(f.marketplace, "plugins.lock.json"), "utf8"), lock);
  assert.deepEqual(await inventory(join(f.marketplace, "plugins")), before);
});

test("source symlinks are rejected without following them", async (t) => {
  const f = await fixture(t);
  await symlink("../../plugin.json", join(f.source, "assets/link"));
  f.commit();
  const result = f.run("generate.mjs", "--refresh");
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Symlinks are not published/u);
});

test("integrity validation rejects changed bytes, modes and extra files", async (t) => {
  const f = await fixture(t);
  f.ok("generate.mjs", "--refresh");
  const icon = join(f.marketplace, "plugins/sample/assets/icon.png");
  await writeFile(icon, "changed");
  assert.notEqual(f.run("validate.mjs").status, 0);
  f.ok("generate.mjs");
  await chmod(join(f.marketplace, "plugins/sample/skills/sample/run.sh"), 0o644);
  assert.notEqual(f.run("validate.mjs").status, 0);
  f.ok("generate.mjs");
  await writeFile(join(f.marketplace, "plugins/sample/unexpected"), "extra");
  assert.notEqual(f.run("validate.mjs").status, 0);
});

test("branding paths cannot escape a package and compatibility versions must match", async (t) => {
  const f = await fixture(t);
  const portable = await readJson(join(f.source, "plugin.json"));
  portable.extensions["com.openai"].interface.logo = "./../outside.png";
  await f.file("plugin.json", json(portable));
  await assert.rejects(validatePackage(f.source, plugin), /Unsafe path/u);
  portable.extensions["com.openai"].interface.logo = "./assets/icon.png";
  await f.file("plugin.json", json(portable));
  await f.file(".codex-plugin/plugin.json", json({ name: plugin.name, version: "2.0.0", interface: listing }));
  await assert.rejects(validatePackage(f.source, plugin));
});

test("registry rejects unsafe include paths and duplicate entries", () => {
  for (const path of ["../secret", "assets/../../secret", ".", ".git", "/absolute", "assets\\file", "assets//file"]) assert.throws(() => safeRelativePath(path));
  assert.throws(() => validateRegistry({ plugins: [plugin, plugin] }));
  assert.throws(() => validateRegistry({ plugins: [{ ...plugin, include: [...plugin.include, "assets/icon.png"] }] }));
});
