import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { cp, lstat, mkdir, mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { catalogs, inventory, json, readJson, safeRelativePath, validatePackage, validateRegistry } from "./bundles.mjs";

const run = promisify(execFile);
const root = resolve(import.meta.dirname, "..");
const args = process.argv.slice(2);
assert(args.length === 0 || (args.length === 1 && args[0] === "--refresh"), "Usage: generate.mjs [--refresh]");
const refresh = args.includes("--refresh");
const plugins = validateRegistry(await readJson(join(root, "plugins.json")));
const locked = refresh ? null : await readJson(join(root, "plugins.lock.json"));
if (locked) {
  assert.equal(locked.version, 1);
  assert.deepEqual(locked.plugins.map(({ name }) => name), plugins.map(({ name }) => name));
}
const temporary = await mkdtemp(join(root, ".calmtech-bundles-"));
const output = join(temporary, "output");
const manifests = [];
const records = [];
const git = async (args) => (await run("git", args, { maxBuffer: 8 * 1024 * 1024 })).stdout.trim();
try {
  for (const [index, plugin] of plugins.entries()) {
    const previous = locked?.plugins[index];
    if (previous) {
      assert.equal(previous.repository, plugin.repository, "Repository changed; use npm run refresh.");
      assert.equal(previous.ref, plugin.ref, "Ref changed; use npm run refresh.");
      assert(/^[0-9a-f]{40}$/u.test(previous.commit), "Invalid locked source commit.");
    }
    const source = join(temporary, "sources", plugin.name);
    await mkdir(source, { recursive: true });
    await git(["init", "--quiet", source]);
    const sourceUrl = process.env.CALMTECH_SOURCE_ROOT
      ? join(resolve(process.env.CALMTECH_SOURCE_ROOT), plugin.name)
      : `https://github.com/${plugin.repository}.git`;
    await git(["-C", source, "fetch", "--quiet", "--depth=1", "--no-tags", sourceUrl, previous?.commit ?? plugin.ref]);
    await git(["-C", source, "checkout", "--quiet", "--detach", "FETCH_HEAD"]);
    const commit = await git(["-C", source, "rev-parse", "HEAD"]);
    assert(/^[0-9a-f]{40}$/u.test(commit), "Invalid resolved source commit.");
    // Git records executable intent even when the host filesystem cannot represent it.
    const executableModes = new Map((await git(["-C", source, "ls-tree", "-r", "-z", "HEAD"])).split("\0").filter(Boolean).map(entry => {
      const separator = entry.indexOf("\t");
      return [entry.slice(separator + 1), entry.startsWith("100755 ")];
    }));
    const destination = join(output, "plugins", plugin.name);
    await mkdir(destination, { recursive: true });
    for (const included of plugin.include) {
      const path = safeRelativePath(included);
      // Reject symlinks in every include path component before copying.
      for (const [index] of path.split("/").entries()) {
        const parent = join(source, ...path.split("/").slice(0, index + 1));
        assert(!(await lstat(parent)).isSymbolicLink(), `Symlinks are not published: ${parent}`);
      }
      await inventory(join(source, path));
      await cp(join(source, path), join(destination, path), { recursive: true, force: false, errorOnExist: true });
    }
    const manifest = await validatePackage(destination, plugin);
    manifests.push(manifest);
    const record = { name: plugin.name, repository: plugin.repository, ref: plugin.ref, commit, version: manifest.version, files: await inventory(destination, executableModes) };
    if (previous) assert.deepEqual(record, previous, `Locked bundle changed for ${plugin.name}; use npm run refresh for intentional changes.`);
    records.push(record);
  }
  const outputs = { ...catalogs(plugins, manifests), "plugins.lock.json": { version: 1, plugins: records } };
  for (const [path, value] of Object.entries(outputs)) {
    await mkdir(dirname(join(output, path)), { recursive: true });
    await writeFile(join(output, path), json(value));
  }
  // Publish only after every source and package has passed validation.
  for (const path of ["plugins", ...Object.keys(outputs)]) {
    await rm(join(root, path), { recursive: true, force: true });
    await mkdir(dirname(join(root, path)), { recursive: true });
    await rename(join(output, path), join(root, path));
  }
  process.stdout.write(`Generated ${records.map(({ name, version, commit }) => `${name} ${version} (${commit.slice(0, 7)})`).join(", ")}.\n`);
} finally {
  await rm(temporary, { recursive: true, force: true });
}
