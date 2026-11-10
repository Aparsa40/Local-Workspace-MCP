import test from "node:test";
import assert from "node:assert/strict";
import { copyFile, mkdtemp, mkdir, readFile, rename, rm, unlink, writeFile } from "node:fs/promises";
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

test("does not recover a stale backup when an active policy references a missing workspace", async (t) => {
  const f = await fixture();
  const replacementWorkspace = path.join(f.directory, "replacement-workspace");
  await mkdir(replacementWorkspace);
  t.after(() => rm(f.directory, { recursive: true, force: true }));

  const first = await f.store.save(proposal(f.workspace, ["list"]), "");
  await f.store.save(proposal(replacementWorkspace, ["read"]), first.revision);
  await rm(replacementWorkspace, { recursive: true, force: true });

  // The active policy file exists; only its configured root is missing.
  // Recovery must not silently restore the older backup's permissions.
  await assert.rejects(f.store.load(), (error: unknown) =>
    typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT"
  );
  assert.equal(await f.store.hasStoredPolicy(), true);
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


test("keeps the active policy intact when replacement fails and can retry safely", async (t) => {
  const f = await fixture();
  t.after(() => rm(f.directory, { recursive: true, force: true }));

  const activePath = path.join(f.directory, "app", "policy.json");
  let failActiveReplacement = false;
  const resilientStore = new PolicyStore({
    filePath: activePath,
    fileOperations: {
      copyFile,
      rename: async (source, destination) => {
        if (destination === activePath && failActiveReplacement) {
          failActiveReplacement = false;
          throw Object.assign(new Error("Simulated replacement failure"), { code: "EIO" });
        }
        await rename(source, destination);
      }
    }
  });

  const first = await resilientStore.save(proposal(f.workspace, ["list"]), "");
  failActiveReplacement = true;
  await assert.rejects(
    resilientStore.save(proposal(f.workspace, ["list", "read"]), first.revision),
    /Simulated replacement failure/
  );

  // The failed replace must not destroy the active policy or its backup.
  assert.equal((await resilientStore.load()).revision, first.revision);
  const backup = JSON.parse(await readFile(`${activePath}.bak`, "utf8")) as {
    roots: Array<{ permissions: string[] }>;
  };
  assert.deepEqual(backup.roots[0]?.permissions, ["list"]);

  // Retry also replaces an existing backup file, which is important on Windows.
  const second = await resilientStore.save(proposal(f.workspace, ["list", "read"]), first.revision);
  assert.notEqual(second.revision, first.revision);
  assert.equal((await resilientStore.load()).revision, second.revision);
});

test("persists an empty default-deny policy after the last workspace is removed", async (t) => {
  const f = await fixture();
  t.after(() => rm(f.directory, { recursive: true, force: true }));

  const saved = await f.store.save({ schemaVersion: 1, roots: [], limits: {} }, "");
  const loaded = await f.store.load();
  assert.equal(loaded.revision, saved.revision);
  assert.deepEqual(loaded.document.roots, []);
});
