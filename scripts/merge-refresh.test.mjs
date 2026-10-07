import assert from "node:assert/strict";
import test from "node:test";
import { canPublishRefresh } from "./merge-refresh.mjs";

const pr = {
  state: "OPEN",
  isDraft: false,
  baseRefName: "main",
  author: { login: "app/github-actions" },
  headRefName: "codex-gaz/plugin-bundle-refresh-123",
  headRefOid: "a".repeat(40),
};
const run = {
  conclusion: "success",
  workflowName: "Validate marketplace",
  headSha: pr.headRefOid,
  headBranch: pr.headRefName,
};
const files = [{ path: "plugins/sample/skills/example/SKILL.md" }, { path: "plugins.lock.json" }];
const base = {
  plugins: [{ name: "sample", version: "1.0.0", files: [{ path: "skill", sha256: "before" }] }],
};
const head = {
  plugins: [{ name: "sample", version: "1.0.1", files: [{ path: "skill", sha256: "after" }] }],
};

test("publishes only the successfully validated versioned snapshot of an automation PR", () => {
  assert(canPublishRefresh(pr, run, files, base, head));
  assert(!canPublishRefresh(pr, { ...run, conclusion: "failure" }, files, base, head));
  assert(!canPublishRefresh(pr, { ...run, headSha: "b".repeat(40) }, files, base, head));
  assert(!canPublishRefresh({ ...pr, state: "CLOSED" }, run, files, base, head));
  assert(!canPublishRefresh({ ...pr, author: { login: "human" } }, run, files, base, head));
  assert(
    !canPublishRefresh(pr, run, [...files, { path: "scripts/publish-refresh.mjs" }], base, head),
  );
  assert(
    !canPublishRefresh(pr, run, files, base, {
      plugins: [{ ...head.plugins[0], version: "1.0.0" }],
    }),
  );
  assert(
    !canPublishRefresh(pr, run, files, base, {
      plugins: [{ ...head.plugins[0], version: "0.9.9" }],
    }),
  );
});
