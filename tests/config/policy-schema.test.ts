import test from "node:test";
import assert from "node:assert/strict";
import {
  parsePolicyDocument,
  serializePolicyDocument,
  toAppConfig
} from "../../src/config/policy-schema.js";

const legacyPolicy = {
  roots: [{
    path: "C:\\Workspaces\\Example",
    permissions: ["list", "read"]
  }],
  limits: {
    maxFileBytes: 2048,
    maxListEntries: 50,
    maxSearchResults: 25,
    maxSearchDepth: 3
  }
};

test("parses a version 1 policy document without migration", () => {
  const result = parsePolicyDocument({
    schemaVersion: 1,
    ...legacyPolicy
  });

  assert.equal(result.document.schemaVersion, 1);
  assert.equal(result.migratedFromLegacy, false);
  assert.deepEqual(result.document.roots[0]?.permissions, ["list", "read"]);
  assert.equal(toAppConfig(result.document).limits.maxFileBytes, 2048);
});

test("migrates a legacy Core config in memory to schema version 1", () => {
  const result = parsePolicyDocument(legacyPolicy);

  assert.equal(result.document.schemaVersion, 1);
  assert.equal(result.migratedFromLegacy, true);
  assert.deepEqual(result.document.roots, legacyPolicy.roots);
  assert.equal(result.document.limits.maxSearchDepth, 3);
});

test("applies supported defaults while parsing a versioned policy", () => {
  const result = parsePolicyDocument({
    schemaVersion: 1,
    roots: [{ path: "C:\\Workspaces\\Example", permissions: ["list"] }],
    limits: {}
  });

  assert.equal(result.document.limits.maxFileBytes, 1_048_576);
  assert.equal(result.document.limits.maxListEntries, 500);
  assert.equal(result.document.limits.maxSearchResults, 100);
  assert.equal(result.document.limits.maxSearchDepth, 5);
});

test("rejects unknown explicit schema versions instead of treating them as legacy", () => {
  assert.throws(
    () => parsePolicyDocument({ schemaVersion: 2, ...legacyPolicy }),
    /Unsupported policy schema version: 2/
  );
});

test("rejects unknown keys and unsupported capabilities", () => {
  assert.throws(
    () => parsePolicyDocument({
      schemaVersion: 1,
      ...legacyPolicy,
      unexpected: true
    }),
    /Policy validation failed/
  );

  assert.throws(
    () => parsePolicyDocument({
      schemaVersion: 1,
      roots: [{ path: "C:\\Workspaces\\Example", permissions: ["delete"] }],
      limits: {}
    }),
    /Policy validation failed/
  );
});

test("rejects non-object policy input", () => {
  assert.throws(() => parsePolicyDocument(null), /must be a JSON object/);
  assert.throws(() => parsePolicyDocument([]), /must be a JSON object/);
});

test("serializes validated policy documents and round-trips them", () => {
  const parsed = parsePolicyDocument(legacyPolicy);
  const serialized = serializePolicyDocument(parsed.document);

  assert.equal(serialized.endsWith("\n"), true);
  assert.deepEqual(parsePolicyDocument(JSON.parse(serialized)).document, parsed.document);
});

test("converts the versioned document to the existing Core runtime shape", () => {
  const parsed = parsePolicyDocument(legacyPolicy);
  const config = toAppConfig(parsed.document);

  assert.deepEqual(Object.keys(config).sort(), ["limits", "roots"]);
  assert.equal("schemaVersion" in config, false);
});

test("allows an empty workspace list as a valid default-deny policy", () => {
  const result = parsePolicyDocument({ schemaVersion: 1, roots: [], limits: {} });
  assert.deepEqual(result.document.roots, []);
  assert.deepEqual(toAppConfig(result.document).roots, []);
});
