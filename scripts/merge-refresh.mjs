import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";

export function canPublishRefresh(pr, run, files, baseLock, headLock) {
  if (pr.state !== "OPEN" || pr.isDraft || pr.baseRefName !== "main") return false;
  if (!["app/github-actions", "github-actions[bot]"].includes(pr.author.login)) return false;
  if (!pr.headRefName.startsWith("codex-gaz/plugin-bundle-refresh-")) return false;
  if (
    run.conclusion !== "success" ||
    run.workflowName !== "Validate marketplace" ||
    run.headSha !== pr.headRefOid ||
    run.headBranch !== pr.headRefName
  )
    return false;
  if (
    !files.length ||
    files.some(
      ({ path }) =>
        !path.startsWith("plugins/") &&
        ![
          "plugins.lock.json",
          ".agents/plugins/marketplace.json",
          ".claude-plugin/marketplace.json",
        ].includes(path),
    )
  )
    return false;
  for (const plugin of headLock.plugins) {
    const previous = baseLock.plugins.find(({ name }) => name === plugin.name);
    if (previous && JSON.stringify(plugin.files) !== JSON.stringify(previous.files)) {
      if (![previous.version, plugin.version].every((version) => /^\d+\.\d+\.\d+$/u.test(version)))
        return false;
      const before = previous.version.split(".").map(Number);
      const after = plugin.version.split(".").map(Number);
      const difference = after
        .map((value, index) => value - before[index])
        .find((value) => value !== 0);
      if (!(difference > 0)) return false;
    }
  }
  return true;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const repo = process.env.GITHUB_REPOSITORY;
  const runId = process.env.VALIDATION_RUN_ID;
  assert(
    process.env.GITHUB_ACTIONS === "true" && repo === "calmtechltd/calmtech-marketplace",
    "Run this publisher in the marketplace Action.",
  );
  assert(/^\d+$/u.test(runId ?? ""), "Missing validation run ID.");
  const execute = promisify(execFile);
  const gh = async (...args) =>
    (await execute("gh", args, { maxBuffer: 8 * 1024 * 1024 })).stdout.trim();
  const run = JSON.parse(
    await gh(
      "run",
      "view",
      runId,
      "--repo",
      repo,
      "--json",
      "headSha,headBranch,conclusion,workflowName",
    ),
  );
  if (run.headBranch?.startsWith("codex-gaz/plugin-bundle-refresh-")) {
    const prs = JSON.parse(
      await gh(
        "pr",
        "list",
        "--repo",
        repo,
        "--head",
        run.headBranch,
        "--state",
        "open",
        "--json",
        "number",
      ),
    );
    for (const { number } of prs) {
      const pr = JSON.parse(
        await gh(
          "pr",
          "view",
          String(number),
          "--repo",
          repo,
          "--json",
          "state,isDraft,baseRefName,author,headRefName,headRefOid,files",
        ),
      );
      const lockAt = async (ref) =>
        JSON.parse(
          Buffer.from(
            JSON.parse(await gh("api", `repos/${repo}/contents/plugins.lock.json?ref=${ref}`))
              .content,
            "base64",
          ).toString("utf8"),
        );
      const [baseLock, headLock] = await Promise.all([lockAt("main"), lockAt(pr.headRefOid)]);
      if (canPublishRefresh(pr, run, pr.files, baseLock, headLock)) {
        await gh(
          "pr",
          "merge",
          String(number),
          "--repo",
          repo,
          "--squash",
          "--match-head-commit",
          pr.headRefOid,
        );
        process.stdout.write(`Published validated refresh PR #${number}.\n`);
      } else {
        process.stdout.write(
          `PR #${number} is not a publishable versioned automation refresh; left open.\n`,
        );
      }
    }
  }
}
