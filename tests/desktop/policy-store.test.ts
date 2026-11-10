import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  PolicyRevisionConflictError,
  PolicyStore
} from "../../desktop-app/electron/services/policy-store.js";

async function fixture() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "lwmcp-policy-store-"));
  const workspace = path.join(directory, "workspace");
  await mkdir(workspace);
  const store = new PolicyStore({ filePath: path.join(directory, "app", "policy.json") });
  return { directory, workspace, store };
}

function proposal(workspace: string, permissions: string[] = ["list", "read"]) {
  return {
    schemaVersion: 1,
    roots: [{ path: workspace, permissions }],
    limits: {}
  };
}

test("creates a validated policy and returns a content revision", async (t) => {
  const f = await fixture();
  t.after(() => rm(f.directory, { recursive: true, force: true }));

  const saved = await f.store.save(proposal(f.workspace), "");
  assert.match(saved.revision, /^[a-f0-9]{64}$/);
  assert.equal(saved.previousRevision, "");
  assert.equal(saved.document.roots[0]?.path, await import("node:fs/promises").then(({ realpath }) => realpath(f.workspace)));

  const loaded = await f.store.load();
  assert.equal(loaded.revision, saved.revision);
  assert.equal(loaded.recoveredFromBackup, false);
});

test("backs up the previous valid policy before replacing it", async (t) => {
  const f = await fixture();
  t.after(() => rm(f.directory, { recursive: true, force: true }));

  const first = await f.store.save(proposal(f.workspace, ["list"]), "");
  const second = await f.store.save(proposal(f.workspace, ["list", "read"]), first.revision);

  assert.equal(second.previousRevision, first.revision);
  const backup = await readFile(path.join(f.directory, "app", "policy.json.bak"), "utf8");
  assert.equal(JSON.parse(backup).roots[0].permissions[0], "list");
  assert.equal(JSON.parse(backup).roots[0].permissions.length, 1);
});

test("rejects stale revisions without overwriting the current policy", async (t) => {
  const f = await fixture();
  t.after(() => rm(f.directory, { recursive: true, force: true }));

  const first = await f.store.save(proposal(f.workspace, ["list"]), "");
  const second = await f.store.save(proposal(f.workspace, ["list", "read"]), first.revision);

  await assert.rejects(
    f.store.save(proposal(f.workspace, ["metadata"]), first.revision),
    (error: unknown) => error instanceof PolicyRevisionConflictError &&
      error.actualRevision === second.revision
  );
  assert.equal((await f.store.load()).revision, second.revision);
});

test("loads the previous valid backup if the active policy is missing", async (t) => {
  const f = await fixture();
  t.after(() => rm(f.directory, { recursive: true, force: true }));

  const first = await f.store.save(proposal(f.workspace, ["list"]), "");
  await f.store.save(proposal(f.workspace, ["list", "read"]), first.revision);
  await unlink(path.join(f.directory, "app", "policy.json"));

  const recovered = await f.store.load();
  assert.equal(recovered.revision, first.revision);
  assert.equal(recovered.recoveredFromBackup, true);
});

test("rejects invalid roots and duplicate canonical workspace paths", async (t) => {
  const f = await fixture();
  t.after(() => rm(f.directory, { recursive: true, force: true }));

  await assert.rejects(f.store.save(proposal(path.join(f.directory, "missing")), ""));
  await assert.rejects(f.store.save({
    schemaVersion: 1,
    roots: [
      { path: f.workspace, permissions: ["list"] },
      { path: path.join(f.workspace, "."), permissions: ["read"] }
    ],
    limits: {}
  }, ""));
});

test("does not fall back to backup when the active policy is malformed", async (t) => {
  const f = await fixture();
  t.after(() => rm(f.directory, { recursive: true, force: true }));

  const first = await f.store.save(proposal(f.workspace), "");
  await f.store.save(proposal(f.workspace, ["list"]), first.revision);
  await writeFile(path.join(f.directory, "app", "policy.json"), "{ invalid json");

  await assert.rejects(f.store.load());
});

test("serializes simultaneous saves and rejects the stale contender", async (t) => {
  const f = await fixture();
  t.after(() => rm(f.directory, { recursive: true, force: true }));

  const first = await f.store.save(proposal(f.workspace, ["list"]), "");
  const attempts = await Promise.allSettled([
    f.store.save(proposal(f.workspace, ["list", "read"]), first.revision),
    f.store.save(proposal(f.workspace, ["metadata"]), first.revision)
  ]);

  assert.equal(attempts.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(attempts.filter((result) => result.status === "rejected").length, 1);
  const current = await f.store.load();
  assert.notEqual(current.revision, first.revision);
});
