import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { chmod, cp, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

test("publication waits for the dispatched validation to finish and refuses a failed run", async (t) => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "merge-refresh-test-")));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, "bin"));
  await cp(join(import.meta.dirname, "merge-refresh.mjs"), join(root, "merge-refresh.mjs"));
  const statePath = join(root, "state.json");
  await writeFile(
    join(root, "bin/gh"),
    `#!/usr/bin/env node
const fs = require('node:fs');
const state = JSON.parse(fs.readFileSync(process.env.TEST_REFRESH_STATE, 'utf8'));
const args = process.argv.slice(2);
let output;
if (args[0] === 'run' && args[1] === 'watch') {
  if (args[2] !== '42' || !args.includes('--exit-status')) throw Error('Wrong validation run');
  state.run.conclusion = state.result;
  fs.writeFileSync(process.env.TEST_REFRESH_STATE, JSON.stringify(state));
  if (state.result !== 'success') process.exit(1);
} else if (args[0] === 'run' && args[1] === 'view') output = state.run;
else if (args[0] === 'pr' && args[1] === 'list') output = [{ number: 8 }];
else if (args[0] === 'pr' && args[1] === 'view') output = state.pr;
else if (args[0] === 'api') output = { content: Buffer.from(JSON.stringify(args[1].endsWith('ref=main') ? state.base : state.head)).toString('base64') };
else if (args[0] === 'pr' && args[1] === 'merge') {
  if (args[args.indexOf('--match-head-commit') + 1] !== state.pr.headRefOid) throw Error('Unpinned merge');
  state.merged = true;
  fs.writeFileSync(process.env.TEST_REFRESH_STATE, JSON.stringify(state));
} else throw Error('Unexpected command: ' + args);
if (output) console.log(JSON.stringify(output));
`,
  );
  await chmod(join(root, "bin/gh"), 0o755);
  for (const result of ["success", "failure"]) {
    await writeFile(
      statePath,
      JSON.stringify({
        result,
        run: { ...run, conclusion: null },
        pr: { ...pr, files },
        base,
        head,
      }),
    );
    const executed = spawnSync(process.execPath, [join(root, "merge-refresh.mjs")], {
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${join(root, "bin")}:${process.env.PATH}`,
        TEST_REFRESH_STATE: statePath,
        GITHUB_ACTIONS: "true",
        GITHUB_REPOSITORY: "calmtechltd/calmtech-marketplace",
        VALIDATION_RUN_ID: "42",
      },
    });
    const state = JSON.parse(await readFile(statePath, "utf8"));
    if (result === "success") {
      assert.equal(executed.status, 0, executed.stderr);
      assert.equal(
        state.merged,
        true,
        "Successful dispatched validation must publish its exact snapshot",
      );
    } else {
      assert.notEqual(executed.status, 0, "Failed validation must fail publication");
      assert(!state.merged);
    }
  }
});
