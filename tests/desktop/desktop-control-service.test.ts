import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DesktopControlService, getCorePolicyRevision } from "../../desktop-app/electron/services/desktop-control-service.js";
import { PolicyStore } from "../../desktop-app/electron/services/policy-store.js";
import type { ManagedCoreStatus } from "../../desktop-app/electron/services/core-process-manager.js";

class FakeCoreManager {
  #state: ManagedCoreStatus["state"] = "stopped";
  #revision: string | undefined;
  #startRevision: string | undefined;
  failReload = false;
  stopCalls = 0;

  getStatus(): ManagedCoreStatus {
    return {
      state: this.#state,
      stderrTail: "",
      ...(this.#revision ? { revision: this.#revision } : {})
    };
  }

  async start(): Promise<ManagedCoreStatus> {
    this.#state = "running";
    this.#revision = this.#startRevision;
    return this.getStatus();
  }

  async reloadPolicy(config: unknown): Promise<string> {
    if (this.failReload) throw new Error("simulated reload failure");
    this.#revision = createHash("sha256").update(JSON.stringify(config), "utf8").digest("hex");
    return this.#revision;
  }

  async stop(): Promise<void> {
    this.stopCalls += 1;
    this.#state = "stopped";
    this.#revision = undefined;
  }

  setRunning(revision: string): void {
    this.#state = "running";
    this.#revision = revision;
  }

  setStartRevision(revision: string): void {
    this.#startRevision = revision;
  }
}

async function setup(t: TestContext) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "lwmcp-desktop-service-"));
  const workspace = path.join(directory, "workspace");
  await mkdir(workspace);
  const manager = new FakeCoreManager();
  const service = new DesktopControlService({
    policyStore: new PolicyStore({ filePath: path.join(directory, "app", "policy.json") }),
    coreManager: manager,
    appVersion: "0.1.0"
  });
  t.after(async () => {
    await service.dispose();
    await rm(directory, { recursive: true, force: true });
  });
  return { service, manager, workspace };
}

function proposal(workspace: string, permissions = ["list", "read"]) {
  return {
    schemaVersion: 1,
    roots: [{ path: workspace, permissions }],
    limits: {}
  };
}

test("reports an unconfigured policy without inventing an active revision", async (t) => {
  const { service } = await setup(t);
  assert.deepEqual(await service.getPolicy(), { configured: false });
  const status = await service.getStatus();
  assert.equal(status.policyConfigured, false);
  assert.equal(status.core.policyApplied, false);
  assert.equal(status.core.activeRevision, undefined);
});

test("starts Core only when its normalized runtime revision matches the saved policy", async (t) => {
  const { service, manager, workspace } = await setup(t);
  const saved = await service.savePolicy(proposal(workspace), "");
  const policy = await service.getPolicy();
  assert.ok(policy.document);
  manager.setStartRevision(getCorePolicyRevision(policy.document));
  const result = await service.startCore();
  assert.equal(result.core.state, "running");
  assert.equal(result.core.policyApplied, true);
  assert.equal(result.core.activeRevision, getCorePolicyRevision(policy.document));
  assert.notEqual(result.core.activeRevision, saved.savedRevision);
});

test("does not claim a policy is active when Core reload fails", async (t) => {
  const { service, manager, workspace } = await setup(t);
  const first = await service.savePolicy(proposal(workspace), "");
  const firstPolicy = await service.getPolicy();
  assert.ok(firstPolicy.document);

  manager.setRunning(getCorePolicyRevision(firstPolicy.document));
  manager.failReload = true;
  const next = await service.savePolicy(proposal(workspace, ["list"]), first.savedRevision);

  assert.equal(next.applied, false);
  assert.equal(next.applyError, "CORE_RELOAD_FAILED");
  assert.equal(next.coreState, "stopped");
  assert.equal(manager.stopCalls, 1);
  const status = await service.getStatus();
  assert.equal(status.core.policyApplied, false);
  assert.equal(status.core.activeRevision, undefined);
});
