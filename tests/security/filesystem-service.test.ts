import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { AppConfig } from "../../src/config/config-schema.js";
import { FilesystemService } from "../../src/modules/filesystem/filesystem-service.js";
import { PolicyRuntime } from "../../src/security/policy-runtime.js";

test("filesystem service lists and reads only explicitly permitted workspace files", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "lwmcp-files-"));
  try {
    await writeFile(path.join(root, "hello.txt"), "hello workspace");
    const config = {
      roots: [{ path: root, permissions: ["list", "read", "metadata", "search"] }],
      limits: { maxFileBytes: 128, maxListEntries: 20, maxSearchResults: 10, maxSearchDepth: 2 }
    } as AppConfig;
    const runtime = await PolicyRuntime.create(config);
    const service = new FilesystemService(runtime);

    const entries = await service.listFiles("");
    assert.ok(entries.some((entry) => entry.name === "hello.txt"));
    assert.equal(await service.readTextFile("hello.txt"), "hello workspace");
    assert.deepEqual(await service.searchFiles("", "hello"), ["hello.txt"]);
    assert.equal((await service.getFileInfo("hello.txt")).type, "file");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("filesystem service enforces configured read size limits", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "lwmcp-files-"));
  try {
    await writeFile(path.join(root, "large.txt"), "x".repeat(32));
    const config = {
      roots: [{ path: root, permissions: ["read"] }],
      limits: { maxFileBytes: 8, maxListEntries: 20, maxSearchResults: 10, maxSearchDepth: 2 }
    } as AppConfig;
    const service = new FilesystemService(await PolicyRuntime.create(config));
    await assert.rejects(service.readTextFile("large.txt"), /size limit/i);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("does not reveal nested roots that deny list or search capabilities", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "lwmcp-parent-"));
  const privateRoot = path.join(root, "private");
  try {
    await mkdir(privateRoot);
    await writeFile(path.join(root, "public.txt"), "public");
    await writeFile(path.join(privateRoot, "secret.txt"), "private");
    const config = {
      roots: [
        { path: root, permissions: ["list", "search"] },
        { path: privateRoot, permissions: ["read"] }
      ],
      limits: { maxFileBytes: 128, maxListEntries: 20, maxSearchResults: 10, maxSearchDepth: 3 }
    } as AppConfig;
    const service = new FilesystemService(await PermissionEngine.create(config), config);

    const entries = await service.listFiles("");
    assert.ok(entries.some((entry) => entry.name === "public.txt"));
    assert.ok(!entries.some((entry) => entry.name === "private"));
    assert.deepEqual(await service.searchFiles("", "secret"), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
