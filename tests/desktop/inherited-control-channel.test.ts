import test from "node:test";
import assert from "node:assert/strict";
import { isControlChannelEnabled } from "../../src/desktop/inherited-control-channel.js";

test("does not inspect inherited descriptors for ordinary client-owned Core processes", () => {
  let inspections = 0;
  const enabled = isControlChannelEnabled({}, () => {
    inspections += 1;
    return true;
  });
  assert.equal(enabled, false);
  assert.equal(inspections, 0);
});

test("enables the channel only when both inherited descriptors are pipes", () => {
  const inspected: number[] = [];
  const enabled = isControlChannelEnabled(
    { LWMCP_CONTROL_CHANNEL: "1" },
    (descriptor) => {
      inspected.push(descriptor);
      return true;
    }
  );
  assert.equal(enabled, true);
  assert.deepEqual(inspected, [3, 4]);
});

test("fails managed startup when an inherited descriptor is not a pipe", () => {
  assert.throws(
    () => isControlChannelEnabled(
      { LWMCP_CONTROL_CHANNEL: "1" },
      (descriptor) => descriptor === 3
    ),
    /inherited policy-control pipes/i
  );
});

test("does not enable the channel for unrecognized environment values", () => {
  assert.equal(isControlChannelEnabled({ LWMCP_CONTROL_CHANNEL: "true" }, () => true), false);
});
