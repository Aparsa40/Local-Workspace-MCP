import test from "node:test";
import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PolicyRuntime } from "../../src/security/policy-runtime.js";
import { servePolicyControlChannel } from "../../src/desktop/policy-control-channel.js";

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "lwmcp-control-"));
  const config = {
    roots: [{ path: root, permissions: ["list", "read", "search", "metadata"] }],
    limits: { maxFileBytes: 128, maxListEntries: 20, maxSearchResults: 10, maxSearchDepth: 2 }
  };
  return { root, config };
}

function startChannel(runtime: PolicyRuntime) {
  const input = new PassThrough();
  const output = new PassThrough();
  const frames: string[] = [];
  output.setEncoding("utf8");
  output.on("data", (chunk: string) => frames.push(chunk));
  const done = servePolicyControlChannel({ input, output, runtime });
  return { input, output, frames, done };
}

function request(expectedRevision: string, config: unknown) {
  return {
    protocolVersion: 1,
    requestId: randomUUID(),
    method: "policy.reload",
    params: { expectedRevision, config }
  };
}

test("reloads Core policy through the dedicated control stream without using MCP stdio", async (t) => {
  const f = await fixture();
  t.after(() => rm(f.root, { recursive: true, force: true }));
  const runtime = await PolicyRuntime.create(f.config);
  const initial = runtime.getSnapshot();
  const channel = startChannel(runtime);
  const proposed = {
    ...f.config,
    roots: [{ path: f.root, permissions: ["list"] }]
  };

  channel.input.end(`${JSON.stringify(request(initial.revision, proposed))}\n`);
  await channel.done;

  const response = JSON.parse(channel.frames.join("").trim()) as {
    ok: boolean; requestId: string; result?: { revision: string };
  };
  assert.equal(response.ok, true);
  assert.equal(response.requestId.length > 0, true);
  assert.notEqual(response.result?.revision, initial.revision);
  assert.deepEqual(runtime.getSnapshot().config.roots[0]?.permissions, ["list"]);
  channel.output.destroy();
});

test("returns the active Core revision over the management channel", async (t) => {
  const f = await fixture();
  t.after(() => rm(f.root, { recursive: true, force: true }));
  const runtime = await PolicyRuntime.create(f.config);
  const revision = runtime.getSnapshot().revision;
  const channel = startChannel(runtime);

  channel.input.end(`${JSON.stringify({
    protocolVersion: 1,
    requestId: randomUUID(),
    method: "policy.getRevision",
    params: {}
  })}\n`);
  await channel.done;

  const response = JSON.parse(channel.frames.join("").trim()) as {
    ok: boolean; result?: { revision: string };
  };
  assert.equal(response.ok, true);
  assert.equal(response.result?.revision, revision);
  channel.output.destroy();
});

test("rejects a stale expected revision without changing the active snapshot", async (t) => {
  const f = await fixture();
  t.after(() => rm(f.root, { recursive: true, force: true }));
  const runtime = await PolicyRuntime.create(f.config);
  const initial = runtime.getSnapshot();
  await runtime.reload({ ...f.config, limits: { ...f.config.limits, maxFileBytes: 64 } }, initial.revision);
  const current = runtime.getSnapshot();
  const channel = startChannel(runtime);

  channel.input.end(`${JSON.stringify(request(initial.revision, f.config))}\n`);
  await channel.done;

  const response = JSON.parse(channel.frames.join("").trim()) as {
    ok: boolean; error?: { code: string };
  };
  assert.equal(response.ok, false);
  assert.equal(response.error?.code, "REVISION_CONFLICT");
  assert.equal(runtime.getSnapshot(), current);
  channel.output.destroy();
});

test("rejects malformed control messages with a bounded error response", async () => {
  const f = await fixture();
  const runtime = await PolicyRuntime.create(f.config);
  const channel = startChannel(runtime);

  channel.input.end("{not-json}\n");
  await channel.done;

  const response = JSON.parse(channel.frames.join("").trim()) as {
    ok: boolean; error?: { code: string };
  };
  assert.equal(response.ok, false);
  assert.equal(response.error?.code, "INVALID_REQUEST");
  channel.output.destroy();
  await rm(f.root, { recursive: true, force: true });
});

test("closes the control channel when a frame exceeds the maximum size", async (t) => {
  const f = await fixture();
  t.after(() => rm(f.root, { recursive: true, force: true }));
  const runtime = await PolicyRuntime.create(f.config);
  const channel = startChannel(runtime);

  channel.input.end(`${"x".repeat(64 * 1024 + 1)}\n`);
  await assert.rejects(channel.done, /size limit/i);
  channel.output.destroy();
});
