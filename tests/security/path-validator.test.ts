import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, realpath, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { resolveExistingPath } from "../../src/security/path-validator.js";

test("resolves a path inside the configured root", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "lwmcp-root-"));
  try {
    await writeFile(path.join(root, "note.txt"), "hello");
    assert.equal(await resolveExistingPath(root, "note.txt"), await realpath(path.join(root, "note.txt")));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("allows the root itself for directory listing", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "lwmcp-root-"));
  try {
    assert.equal(await resolveExistingPath(root, ""), await realpath(root));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects traversal segments", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "lwmcp-root-"));
  try {
    await assert.rejects(resolveExistingPath(root, "../outside.txt"), /traversal/i);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects symlinks that resolve outside the root", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "lwmcp-root-"));
  const outside = await mkdtemp(path.join(os.tmpdir(), "lwmcp-outside-"));
  try {
    await writeFile(path.join(outside, "secret.txt"), "secret");
    await symlink(outside, path.join(root, "escape"), "junction");
    await assert.rejects(resolveExistingPath(root, path.join("escape", "secret.txt")), /escapes/i);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});

test("rejects absolute paths", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "lwmcp-root-"));
  try {
    await assert.rejects(resolveExistingPath(root, path.resolve("secret.txt")), /relative/i);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("blocks common credential filenames", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "lwmcp-root-"));
  try {
    await writeFile(path.join(root, ".env"), "TOKEN=not-real");
    await assert.rejects(resolveExistingPath(root, ".env"), /sensitive/i);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
