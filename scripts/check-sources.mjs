import { appendFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { readJson, validateRegistry } from "./bundles.mjs";
import { changedSources, githubCommit } from "./source-check.mjs";

const root = resolve(import.meta.dirname, "..");
const plugins = validateRegistry(await readJson(join(root, "plugins.json")));
const lock = await readJson(join(root, "plugins.lock.json"));
const changed = await changedSources(plugins, lock, githubCommit);
if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `changed=${changed.length > 0}\n`);
process.stdout.write(changed.length ? `Source changes detected: ${changed.join(", ")}.\n` : "Source commits are unchanged; skip bundle generation, tests and publication.\n");
