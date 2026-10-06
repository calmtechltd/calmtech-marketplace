import assert from "node:assert/strict";
import test from "node:test";
import { changedSources, githubCommit } from "./source-check.mjs";

const plugins = [
  { name: "craft", repository: "example/craft", ref: "main" },
  { name: "connect", repository: "example/connect", ref: "main" },
];
const commits = ["a".repeat(40), "b".repeat(40)];
const lock = { version: 1, plugins: plugins.map((plugin, index) => ({ ...plugin, commit: commits[index] })) };
const sameCommit = async (plugin) => commits[plugins.findIndex(({ name }) => name === plugin.name)];

test("unchanged commits skip work after checking both source refs", async () => {
  const checked = [];
  assert.deepEqual(await changedSources(plugins, lock, async (plugin) => { checked.push(plugin.name); return sameCommit(plugin); }), []);
  assert.deepEqual(checked, ["craft", "connect"]);
});

test("new commits and changed repositories or refs request a refresh", async () => {
  assert.deepEqual(await changedSources(plugins, lock, async (plugin) => plugin.name === "craft" ? "c".repeat(40) : sameCommit(plugin)), ["craft"]);
  for (const field of ["repository", "ref"]) {
    const altered = structuredClone(plugins); altered[0][field] = "changed";
    assert.deepEqual(await changedSources(altered, lock, sameCommit), ["craft"]);
  }
});

test("missing or retired entries request a refresh", async () => {
  assert.deepEqual(await changedSources(plugins, { ...lock, plugins: [lock.plugins[1]] }, sameCommit), ["craft"]);
  assert.deepEqual(await changedSources([plugins[0]], lock, sameCommit), ["registry"]);
});

test("failed requests and malformed commit IDs fail rather than silently skip", async () => {
  await assert.rejects(changedSources(plugins, lock, async () => "invalid"), /Invalid source commit/u);
  await assert.rejects(githubCommit(plugins[0], async () => ({ ok: false, status: 503 })), /GitHub returned 503/u);
});

test("GitHub requests resolve the configured ref and encode branch slashes", async () => {
  const commit = await githubCommit({ ...plugins[0], ref: "release/stable" }, async (url, options) => {
    assert.equal(url, "https://api.github.com/repos/example/craft/commits/release%2Fstable");
    assert.equal(options.headers.Accept, "application/vnd.github+json");
    return { ok: true, json: async () => ({ sha: commits[0] }) };
  });
  assert.equal(commit, commits[0]);
});
