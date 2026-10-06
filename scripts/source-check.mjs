import assert from "node:assert/strict";

export async function changedSources(plugins, lock, getCommit) {
  assert.equal(lock.version, 1, "Unsupported source lock.");
  assert(Array.isArray(lock.plugins), "Missing locked plugins.");
  const changed = [];
  for (const plugin of plugins) {
    const commit = await getCommit(plugin);
    assert(typeof commit === "string" && /^[0-9a-f]{40}$/u.test(commit), `Invalid source commit for ${plugin.name}.`);
    const previous = lock.plugins.find(({ name }) => name === plugin.name);
    if (!previous || previous.repository !== plugin.repository || previous.ref !== plugin.ref || previous.commit !== commit) changed.push(plugin.name);
  }
  if (lock.plugins.length !== plugins.length && !changed.length) changed.push("registry");
  return changed;
}

export async function githubCommit(plugin, request = fetch) {
  const headers = { Accept: "application/vnd.github+json" };
  if (process.env.GH_TOKEN) headers.Authorization = `Bearer ${process.env.GH_TOKEN}`;
  const response = await request(`https://api.github.com/repos/${plugin.repository}/commits/${encodeURIComponent(plugin.ref)}`, {
    headers, signal: AbortSignal.timeout(30_000),
  });
  assert(response.ok, `Cannot check ${plugin.name}: GitHub returned ${response.status}.`);
  return (await response.json()).sha;
}
