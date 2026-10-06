import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { chmod, cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { json, readJson } from "./bundles.mjs";

const fakeGh = `#!/usr/bin/env node
const fs = require('node:fs');
const path = process.env.FAKE_GH_STATE;
const state = JSON.parse(fs.readFileSync(path, 'utf8'));
const args = process.argv.slice(2);
state.calls.push(args);
let output = '';
const flag = (key) => args[args.indexOf(key) + 1];
if (args[0] === 'repo') output = 'main';
else if (args[0] === 'pr' && args[1] === 'list') output = JSON.stringify(args.includes('--head') ? state.prs.filter(p => p.headRefName === flag('--head')) : state.prs.filter(p => p.state === 'OPEN'));
else if (args[0] === 'pr' && args[1] === 'view') output = JSON.stringify({ statusCheckRollup: state.checked ? [{ name: 'validate', conclusion: 'SUCCESS' }] : [] });
else if (args[0] === 'pr' && args[1] === 'create') {
 if (state.failCreate) { state.failCreate = false; fs.writeFileSync(path, JSON.stringify(state)); process.exit(1); }
 const pr = { number: state.prs.length + 1, state: 'OPEN', url: 'https://github.com/example/marketplace/pull/' + (state.prs.length + 1), headRefName: flag('--head'), author: { login: 'app/github-actions' } };
 state.prs.push(pr); output = pr.url;
}
else if (args[0] === 'pr' && args[1] === 'close') {
 if (state.failClose) { state.failClose = false; fs.writeFileSync(path, JSON.stringify(state)); process.exit(1); }
 state.prs.find(p => p.number === Number(args[2])).state = 'CLOSED';
}
else if (args[0] === 'workflow') {
 if (state.failDispatch) { state.failDispatch = false; fs.writeFileSync(path, JSON.stringify(state)); process.exit(1); }
 state.checked = true;
} else throw Error('Unexpected gh args: ' + args);
fs.writeFileSync(path, JSON.stringify(state)); console.log(output);
`;

async function fixture(t, initial = {}) {
  const root = await mkdtemp(join(tmpdir(), "publisher-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const checkout = join(root, "checkout");
  await mkdir(join(checkout, "scripts"), { recursive: true });
  for (const file of ["publish-refresh.mjs", "bundles.mjs"]) await cp(join(import.meta.dirname, file), join(checkout, "scripts", file));
  await mkdir(join(checkout, "plugins/sample"), { recursive: true });
  await mkdir(join(checkout, ".agents/plugins"), { recursive: true });
  await mkdir(join(checkout, ".claude-plugin"), { recursive: true });
  await writeFile(join(checkout, "plugins/sample/icon"), "before");
  await writeFile(join(checkout, "plugins.lock.json"), json({ plugins: [{ name: "sample", repository: "calmtechltd/sample", version: "1.0.0", commit: "a".repeat(40) }] }));
  await writeFile(join(checkout, ".agents/plugins/marketplace.json"), "{}");
  await writeFile(join(checkout, ".claude-plugin/marketplace.json"), "{}");
  const git = (...args) => execFileSync("git", ["-C", checkout, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  git("init", "-q", "-b", "main"); git("add", ".");
  git("-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-qm", "Initial");
  const remote = join(root, "remote.git");
  execFileSync("git", ["init", "-q", "--bare", remote]);
  git("remote", "add", "origin", remote); git("push", "-q", "origin", "main");
  const bin = join(root, "bin"); await mkdir(bin);
  await writeFile(join(bin, "gh"), fakeGh); await chmod(join(bin, "gh"), 0o755);
  const statePath = join(root, "gh-state.json");
  await writeFile(statePath, json({ calls: [], prs: [], ...initial }));
  const run = () => spawnSync(process.execPath, [join(checkout, "scripts/publish-refresh.mjs")], {
    encoding: "utf8", env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, FAKE_GH_STATE: statePath, GITHUB_ACTIONS: "true", GITHUB_REPOSITORY: "example/marketplace", RUNNER_TEMP: root },
  });
  const changed = () => writeFile(join(checkout, "plugins/sample/icon"), "after");
  return { root, checkout, git, run, changed, statePath, state: () => readJson(statePath) };
}

test("publisher makes no PR when bundles have not changed", async (t) => {
  const f = await fixture(t);
  const result = f.run(); assert.equal(result.status, 0, result.stderr);
  assert.equal((await f.state()).prs.length, 0);
  assert.equal(f.git("branch", "--show-current"), "main");
});

test("publisher opens and checks a snapshot, retiring only older automation PRs", async (t) => {
  const f = await fixture(t, { prs: [
    { number: 1, state: "OPEN", headRefName: "codex-gaz/plugin-bundle-refresh-old", author: { login: "app/github-actions" } },
    { number: 2, state: "OPEN", headRefName: "codex-gaz/plugin-bundle-refresh-human", author: { login: "human" } },
  ] });
  await f.changed(); const result = f.run(); assert.equal(result.status, 0, result.stderr);
  const state = await f.state();
  assert.equal(state.prs[0].state, "CLOSED"); assert.equal(state.prs[1].state, "OPEN"); assert.equal(state.prs[2].state, "OPEN");
  assert(state.checked); assert(state.calls.some(args => args[0] === "workflow" && args.includes("validate.yml")));
  assert.equal(f.git("show", "origin/main:plugins/sample/icon"), "before");
  const body = await readFile(join(f.root, "plugin-bundle-refresh-body.md"), "utf8");
  assert(body.includes(`https://github.com/calmtechltd/sample/commit/${"a".repeat(40)}`));
  assert(body.includes("does not merge PRs"));
});

test("publisher recovers a pushed branch after PR creation failed and the base advances without rewriting history", async (t) => {
  const f = await fixture(t, { failCreate: true });
  await f.changed(); assert.notEqual(f.run().status, 0);
  const firstBranch = f.git("branch", "--show-current");
  const pushed = f.git("ls-remote", "--heads", "origin", `refs/heads/${firstBranch}`).split(/\s/u)[0];
  f.git("switch", "main");
  await writeFile(join(f.checkout, "README.md"), "Unrelated base change");
  f.git("add", "README.md");
  f.git("-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-qm", "Advance base");
  f.git("push", "-q", "origin", "main");
  await f.changed();
  const result = f.run(); assert.equal(result.status, 0, result.stderr);
  assert.equal(f.git("ls-remote", "--heads", "origin", `refs/heads/${firstBranch}`).split(/\s/u)[0], pushed);
  assert.equal((await f.state()).prs.length, 1);
});

test("publisher refuses a pushed branch whose generated files no longer match", async (t) => {
  const f = await fixture(t, { failCreate: true });
  await f.changed(); assert.notEqual(f.run().status, 0);
  const branch = f.git("branch", "--show-current");
  await writeFile(join(f.checkout, "plugins/sample/icon"), "Different bundle");
  f.git("add", "plugins/sample/icon");
  f.git("-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-qm", "Change bundle");
  f.git("push", "-q", "origin", branch);
  const pushed = f.git("rev-parse", "HEAD");
  f.git("switch", "main"); await f.changed();
  assert.notEqual(f.run().status, 0);
  assert.equal((await f.state()).prs.length, 0);
  assert.equal(f.git("ls-remote", "--heads", "origin", `refs/heads/${branch}`).split(/\s/u)[0], pushed);
});

test("publisher retries retiring older automation PRs after a close fails", async (t) => {
  const f = await fixture(t, { failClose: true, prs: [
    { number: 1, state: "OPEN", headRefName: "codex-gaz/plugin-bundle-refresh-old", author: { login: "app/github-actions" } },
    { number: 2, state: "OPEN", headRefName: "codex-gaz/plugin-bundle-refresh-human", author: { login: "human" } },
  ] });
  await f.changed(); assert.notEqual(f.run().status, 0);
  const failed = await f.state();
  assert.equal(failed.prs[0].state, "OPEN"); assert.equal(failed.prs[2].state, "OPEN");
  f.git("switch", "main"); await f.changed();
  const result = f.run(); assert.equal(result.status, 0, result.stderr);
  const retried = await f.state(); assert.equal(retried.prs.length, 3);
  assert.equal(retried.prs[0].state, "CLOSED"); assert.equal(retried.prs[1].state, "OPEN"); assert.equal(retried.prs[2].state, "OPEN");
  retried.prs[0].state = "OPEN"; retried.prs[2].state = "CLOSED";
  await writeFile(f.statePath, json(retried));
  const closed = f.run(); assert.equal(closed.status, 0, closed.stderr);
  const final = await f.state();
  assert.equal(final.prs[0].state, "OPEN"); assert.equal(final.prs[2].state, "CLOSED");
});

test("publisher retries missing CI for an existing PR instead of making a duplicate", async (t) => {
  const f = await fixture(t, { failDispatch: true });
  await f.changed(); assert.notEqual(f.run().status, 0);
  f.git("switch", "main"); await f.changed();
  const result = f.run(); assert.equal(result.status, 0, result.stderr);
  const state = await f.state(); assert.equal(state.prs.length, 1); assert(state.checked);
  state.prs[0].state = "CLOSED"; state.checked = false;
  await writeFile(f.statePath, json(state));
  const closed = f.run(); assert.equal(closed.status, 0, closed.stderr);
  assert.equal((await f.state()).prs[0].state, "CLOSED");
  assert(!(await f.state()).checked);
});
