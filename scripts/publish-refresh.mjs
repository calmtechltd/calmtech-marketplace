import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { readJson } from "./bundles.mjs";

const root = resolve(import.meta.dirname, "..");
const repo = process.env.GITHUB_REPOSITORY;
assert(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(repo ?? ""), "Run this publisher in the marketplace's GitHub Action.");
assert(process.env.GITHUB_ACTIONS === "true", "Publication is restricted to GitHub Actions.");
const execute = promisify(execFile);
const run = async (command, args) => (await execute(command, args, { cwd: root, maxBuffer: 8 * 1024 * 1024 })).stdout.trim();
const base = await run("gh", ["repo", "view", repo, "--json", "defaultBranchRef", "--jq", ".defaultBranchRef.name"]);
const generated = ["plugins", "plugins.lock.json", ".agents/plugins/marketplace.json", ".claude-plugin/marketplace.json"];
await run("git", ["add", "--", ...generated]);
await run("git", ["diff", "--cached", "--check"]);
// Hash file modes and blob IDs, without loading potentially large binary patches.
const diff = await run("git", ["diff", "--cached", "--raw", "--no-abbrev"]);
if (!diff) {
  process.stdout.write("Plugin bundles are current; no refresh PR needed.\n");
} else {
  const prefix = "codex-gaz/plugin-bundle-refresh-";
  const branch = `${prefix}${createHash("sha256").update(diff).digest("hex").slice(0, 16)}`;
  const existing = JSON.parse(await run("gh", ["pr", "list", "--repo", repo, "--base", base, "--head", branch, "--state", "all", "--json", "number,state,url"]));
  let openRefresh = false;
  if (existing.length) {
    // Do not overwrite an open refresh or reopen a refresh somebody deliberately closed.
    process.stdout.write(`Refresh already proposed: ${existing[0].url} (${existing[0].state}).\n`);
    if (existing[0].state === "OPEN") {
      const checks = JSON.parse(await run("gh", ["pr", "view", String(existing[0].number), "--repo", repo, "--json", "statusCheckRollup"]));
      if (!checks.statusCheckRollup.some((check) => check.name === "validate" && check.conclusion === "SUCCESS")) {
        await run("gh", ["workflow", "run", "validate.yml", "--repo", repo, "--ref", branch]);
      }
      openRefresh = true;
    }
  } else {
    const remote = await run("git", ["ls-remote", "--heads", "origin", `refs/heads/${branch}`]);
    if (remote) {
      // Recover if an earlier run pushed the branch but failed before opening its PR.
      await run("git", ["fetch", "origin", `refs/heads/${branch}`]);
      // Unrelated base commits may differ; the generated snapshot must still match.
      assert.equal(await run("git", ["diff", "--cached", "--raw", "--no-abbrev", "FETCH_HEAD", "--", ...generated]), "", "Existing refresh branch differs; refusing to overwrite it.");
    } else {
      await run("git", ["switch", "--create", branch]);
      await run("git", ["-c", "user.name=github-actions[bot]", "-c", "user.email=41898282+github-actions[bot]@users.noreply.github.com", "commit", "-m", "Refresh generated plugin bundles"]);
      // Each snapshot gets a fresh branch. No history rewrites or force pushes.
      await run("git", ["push", "origin", `HEAD:refs/heads/${branch}`]);
    }
    const lock = await readJson(join(root, "plugins.lock.json"));
    const sources = lock.plugins.map(({ name, version, repository, commit }) => `- ${name} ${version}: https://github.com/${repository}/commit/${commit}`).join("\n");
    const body = `Refresh the generated marketplace bundles from their configured source repositories.\n\n${sources}\n\nThe refresh action passed the generator tests, bundle integrity and branding validation before publication. A separate validation run reproduces these exact locked commits. The publisher does not merge PRs directly: a successful validation run automatically merges this versioned bundle-only refresh at its validated head.\n\nSource code, documentation and branding remain maintained in the plugin repositories. Do not edit the generated bundles or lock by hand.`;
    const { writeFile } = await import("node:fs/promises");
    const bodyPath = join(process.env.RUNNER_TEMP, "plugin-bundle-refresh-body.md");
    await writeFile(bodyPath, body);
    const url = await run("gh", ["pr", "create", "--repo", repo, "--base", base, "--head", branch, "--title", "Refresh Calmtech plugin bundles", "--body-file", bodyPath]);
    process.stdout.write(`Opened ${url}\n`);
    // GITHUB_TOKEN-created PRs do not start unattended PR checks. Dispatch explicitly.
    await run("gh", ["workflow", "run", "validate.yml", "--repo", repo, "--ref", branch]);
    openRefresh = true;
  }
  if (openRefresh) {
    const open = JSON.parse(await run("gh", ["pr", "list", "--repo", repo, "--base", base, "--state", "open", "--json", "number,headRefName,author"]));
    for (const pr of open) {
      if (pr.headRefName !== branch && pr.headRefName.startsWith(prefix) && pr.author.login === "app/github-actions") {
        // Retire only older proposals owned by this automation. Keep their branches/history.
        await run("gh", ["pr", "close", String(pr.number), "--repo", repo]);
      }
    }
  }
}
