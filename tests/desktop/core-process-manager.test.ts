import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { CoreProcessManager } from "../../desktop-app/electron/services/core-process-manager.js";

test("starts a managed Core child and reloads policy over inherited pipes", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "lwmcp-managed-core-"));
  const configPath = path.join(root, "policy.json");
  const initialConfig = {
    roots: [{ path: root, permissions: ["list", "read", "search", "metadata"] }],
    limits: { maxFileBytes: 128, maxListEntries: 20, maxSearchResults: 10, maxSearchDepth: 2 }
  };
  await writeFile(configPath, JSON.stringify(initialConfig), "utf8");

  const manager = new CoreProcessManager({
    executablePath: process.execPath,
    args: ["--import", "tsx", path.resolve("tests/fixtures/managed-core-fixture.ts")],
    cwd: process.cwd(),
    configPath,
    startupTimeoutMs: 15_000,
    requestTimeoutMs: 10_000
  });
  t.after(async () => {
    await manager.stop();
    await rm(root, { recursive: true, force: true });
  });

  const started = await manager.start();
  assert.equal(started.state, "running");
  assert.ok(started.pid);
  assert.match(started.revision ?? "", /^[a-f0-9]{64}$/);

  await assert.rejects(manager.start(), /already active/i);

  const nextConfig = {
    ...initialConfig,
    roots: [{ path: root, permissions: ["list"] }]
  };
  const nextRevision = await manager.reloadPolicy(nextConfig);
  assert.notEqual(nextRevision, started.revision);
  assert.equal(manager.getStatus().revision, nextRevision);

  await manager.stop();
  assert.equal(manager.getStatus().state, "stopped");
});
