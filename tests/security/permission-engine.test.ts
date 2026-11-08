import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, realpath, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PermissionEngine } from "../../src/security/permission-engine.js";
import type { AppConfig } from "../../src/config/config-schema.js";

test("grants only explicitly configured capabilities", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "lwmcp-policy-"));
  try {
    const config = {
      roots: [{ path: root, permissions: ["list", "read"] }],
      limits: { maxFileBytes: 1024, maxSearchResults: 10, maxSearchDepth: 2 }
    } as AppConfig;
    const engine = await PermissionEngine.create(config);
    const canonicalRoot = await realpath(root);
    assert.equal(engine.authorize(canonicalRoot, "read").path, canonicalRoot);
    assert.throws(() => engine.authorize(canonicalRoot, "search"), /denied/i);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("the most specific configured root controls its subtree", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "lwmcp-policy-"));
  const nested = path.join(root, "restricted");
  try {
    await mkdir(nested);
    const config = {
      roots: [
        { path: root, permissions: ["list", "read"] },
        { path: nested, permissions: ["list"] }
      ],
      limits: { maxFileBytes: 1024, maxSearchResults: 10, maxSearchDepth: 2 }
    } as AppConfig;
    const engine = await PermissionEngine.create(config);
    const canonicalNested = await realpath(nested);
    assert.throws(() => engine.authorize(canonicalNested, "read"), /denied/i);
    assert.equal(engine.authorize(canonicalNested, "list").path, canonicalNested);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
