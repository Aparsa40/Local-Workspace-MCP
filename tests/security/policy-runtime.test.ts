import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PolicyRuntime, PolicyRuntimeRevisionConflictError } from "../../src/security/policy-runtime.js";
import { FilesystemService } from "../../src/modules/filesystem/filesystem-service.js";

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "lwmcp-runtime-"));
  await writeFile(path.join(root, "secret.txt"), "secret");
  const config = {
    roots: [{ path: root, permissions: ["list", "read", "search", "metadata"] }],
    limits: { maxFileBytes: 128, maxListEntries: 20, maxSearchResults: 10, maxSearchDepth: 2 }
  };
  return { root, config };
}

test("publishes a complete new policy snapshot and filesystem operations use it", async (t) => {
  const f = await fixture();
  t.after(() => rm(f.root, { recursive: true, force: true }));
  const runtime = await PolicyRuntime.create(f.config);
  const filesystem = new FilesystemService(runtime);
  const previous = runtime.getSnapshot();
  const previousRevision = previous.revision;

  assert.equal(await filesystem.readTextFile("secret.txt"), "secret");
  const nextConfig = {
    ...f.config,
    roots: [{ path: f.root, permissions: ["list"] }]
  };
  const next = await runtime.reload(nextConfig, previous.revision);

  assert.notEqual(next.revision, previous.revision);
  assert.equal(runtime.getSnapshot(), next);
  await assert.rejects(filesystem.readTextFile("secret.txt"), /denied/i);
  // PermissionEngine stores realpath-normalized roots; query it with that same path.
  const oldCanonicalRoot = await realpath(f.root);
  assert.equal(previous.permissions.authorize(oldCanonicalRoot, "read").path, oldCanonicalRoot);
  assert.equal(previous.revision, previousRevision);
});

test("rejects invalid reloads without replacing the active snapshot", async (t) => {
  const f = await fixture();
  t.after(() => rm(f.root, { recursive: true, force: true }));
  const runtime = await PolicyRuntime.create(f.config);
  const previous = runtime.getSnapshot();

  await assert.rejects(
    runtime.reload({ roots: [{ path: f.root, permissions: ["not-a-capability"] }], limits: f.config.limits }, previous.revision)
  );
  assert.equal(runtime.getSnapshot(), previous);
});

test("rejects stale revisions and serializes competing reloads", async (t) => {
  const f = await fixture();
  t.after(() => rm(f.root, { recursive: true, force: true }));
  const runtime = await PolicyRuntime.create(f.config);
  const revision = runtime.getSnapshot().revision;
  const firstConfig = { ...f.config, limits: { ...f.config.limits, maxFileBytes: 64 } };
  const secondConfig = { ...f.config, limits: { ...f.config.limits, maxFileBytes: 32 } };

  const outcomes = await Promise.allSettled([
    runtime.reload(firstConfig, revision),
    runtime.reload(secondConfig, revision)
  ]);
  assert.equal(outcomes.filter((item) => item.status === "fulfilled").length, 1);
  const rejected = outcomes.find((item) => item.status === "rejected");
  assert.ok(rejected && rejected.status === "rejected");
  assert.ok(rejected.reason instanceof PolicyRuntimeRevisionConflictError);
});
