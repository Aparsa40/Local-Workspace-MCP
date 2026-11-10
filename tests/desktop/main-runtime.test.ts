import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { ElectronMainRuntime } from "../../desktop-app/electron/main-runtime.js";
import { IPC_CHANNELS } from "../../desktop-app/electron/ipc/schemas.js";

type Handler = (event: { sender: unknown; senderFrame?: unknown }, payload?: unknown) => Promise<unknown>;

class FakeIpcMain {
  readonly handlers = new Map<string, Handler>();

  handle(channel: string, listener: Handler): void {
    this.handlers.set(channel, listener);
  }

  removeHandler(channel: string): void {
    this.handlers.delete(channel);
  }
}

test("registers only named IPC handlers and rejects untrusted frames", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "lwmcp-electron-ipc-"));
  t.after(() => rm(directory, { recursive: true, force: true }));

  const ipcMain = new FakeIpcMain();
  const trustedSender = {};
  const trustedFrame = {};
  const runtime = new ElectronMainRuntime({
    appDataPath: directory,
    coreEntryPath: path.join(directory, "dist", "index.js"),
    electronExecutablePath: process.execPath,
    appVersion: "0.1.0",
    ipcMain,
    selectDirectory: async () => path.join(directory, "selected-workspace"),
    isTrustedSender: (event) => event.sender === trustedSender && event.senderFrame === trustedFrame
  });
  t.after(() => runtime.dispose());

  assert.deepEqual([...ipcMain.handlers.keys()].sort(), Object.values(IPC_CHANNELS).sort());

  const getStatus = ipcMain.handlers.get(IPC_CHANNELS.appStatus);
  assert.ok(getStatus);

  const rejected = await getStatus({ sender: {}, senderFrame: {} });
  assert.deepEqual(rejected, {
    ok: false,
    error: {
      code: "UNTRUSTED_SENDER",
      message: "This window is not allowed to call the desktop API."
    }
  });

  const accepted = await getStatus({ sender: trustedSender, senderFrame: trustedFrame });
  assert.equal((accepted as { ok: boolean }).ok, true);

  const pickDirectory = ipcMain.handlers.get(IPC_CHANNELS.workspacePickDirectory);
  assert.ok(pickDirectory);
  const selectedDirectory = await pickDirectory({ sender: trustedSender, senderFrame: trustedFrame });
  assert.deepEqual(selectedDirectory, {
    ok: true,
    value: path.join(directory, "selected-workspace")
  });

  const savePolicy = ipcMain.handlers.get(IPC_CHANNELS.policySave);
  assert.ok(savePolicy);
  const invalidPayload = await savePolicy(
    { sender: trustedSender, senderFrame: trustedFrame },
    { proposal: { roots: [] }, expectedRevision: "not-a-revision", extra: true }
  );
  assert.deepEqual(invalidPayload, {
    ok: false,
    error: {
      code: "INVALID_ARGUMENT",
      message: "The request payload is invalid."
    }
  });


  const invalidPolicyShape = await savePolicy(
    { sender: trustedSender, senderFrame: trustedFrame },
    {
      proposal: { schemaVersion: 1, roots: [], limits: {}, unexpected: true },
      expectedRevision: ""
    }
  );
  assert.deepEqual(invalidPolicyShape, {
    ok: false,
    error: {
      code: "INVALID_ARGUMENT",
      message: "The request payload is invalid."
    }
  });

  await runtime.dispose();
  assert.equal(ipcMain.handlers.size, 0);
});
