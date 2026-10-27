import { test } from "node:test";
import assert from "node:assert/strict";
import { childEnv, parseRecords, summarize, parseArgs } from "./run-jev.mjs";

test("childEnv copies JEV_API_KEY to OPENROUTER_API_KEY", () => {
  assert.equal(childEnv({ JEV_API_KEY: "k1" }).OPENROUTER_API_KEY, "k1");
});

test("childEnv keeps an OPENROUTER_API_KEY that is already set", () => {
  assert.equal(childEnv({ JEV_API_KEY: "k1", OPENROUTER_API_KEY: "k2" }).OPENROUTER_API_KEY, "k2");
});

test("childEnv leaves the key unset when there is none", () => {
  assert.equal(childEnv({}).OPENROUTER_API_KEY, undefined);
});

test("parseRecords reads the JSON array on the last stdout line", () => {
  const out = 'PASS  a  3 steps\n[{"flow":"a","passed":true}]\n';
  assert.deepEqual(parseRecords(out), [{ flow: "a", passed: true }]);
});

test("parseRecords returns [] when the last line is not JSON", () => {
  assert.deepEqual(parseRecords("stopped: the engine rejected the API key"), []);
});

test("summarize counts passes, lists failures with their outcome, sums cost", () => {
  const recs = [
    { flow: "a", passed: true, cost: 0.001, wallMs: 4000 },
    { flow: "b", passed: false, outcome: "MAX_STEPS", cost: 0.002, wallMs: 9000 },
  ];
  assert.equal(summarize("riya", recs), "riya: 1/2 passed, $0.0030, longest 9.0s\n  failed: b MAX_STEPS");
});

test("parseArgs collects specs and passes --runs through", () => {
  const o = parseArgs(["--out", "x", "--runs", "2", "a.spec.mjs", "b.spec.mjs"]);
  assert.deepEqual(o.specs, ["a.spec.mjs", "b.spec.mjs"]);
  assert.deepEqual(o.extra, ["--runs", "2"]);
  assert.equal(o.base, "http://localhost:8090");
});

test("parseArgs refuses a base URL that is not localhost", () => {
  assert.throws(() => parseArgs(["--out", "x", "--base", "https://example.com", "a.mjs"]), /localhost/);
});

test("parseArgs with --check needs no --out", () => {
  assert.equal(parseArgs(["--check", "a.mjs"]).check, true);
});

test("parseArgs needs --out and a spec", () => {
  assert.throws(() => parseArgs(["a.mjs"]), /--out/);
  assert.throws(() => parseArgs(["--out", "x"]), /spec/);
});
