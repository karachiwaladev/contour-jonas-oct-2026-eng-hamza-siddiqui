import { test } from "node:test";
import assert from "node:assert/strict";
import { PRIORITIES, DEFAULT_PRIORITY, normalizePriority, priorityOf, sortTasks } from "./priority.js";

test("priorityOf treats an older record without priority as medium", () => {
  assert.equal(priorityOf({ title: "a" }), "medium");
});

test("priorityOf returns a valid stored priority", () => {
  assert.equal(priorityOf({ priority: "high" }), "high");
  assert.equal(priorityOf({ priority: "low" }), "low");
});

test("priorityOf treats unknown or empty values as medium", () => {
  assert.equal(priorityOf({ priority: "urgent" }), "medium");
  assert.equal(priorityOf({ priority: "" }), "medium");
});

test("normalizePriority accepts exact keys only, defaulting to medium", () => {
  assert.equal(normalizePriority("low"), "low");
  assert.equal(normalizePriority(undefined), "medium");
  assert.equal(normalizePriority("HIGH"), "medium");
});

test("PRIORITIES lists high, medium, low in display order and the default is medium", () => {
  assert.deepEqual(Object.keys(PRIORITIES), ["high", "medium", "low"]);
  assert.equal(DEFAULT_PRIORITY, "medium");
});

test("sortTasks orders by priority, high first", () => {
  const L = { priority: "low", due: "", createdAt: 1 };
  const H = { priority: "high", due: "", createdAt: 2 };
  const M = { priority: "medium", due: "", createdAt: 3 };
  assert.deepEqual(sortTasks([L, H, M]), [H, M, L]);
});

test("same priority sorts by due date, empty due last", () => {
  const A = { priority: "high", due: "", createdAt: 1 };
  const B = { priority: "high", due: "2026-11-05", createdAt: 2 };
  const C = { priority: "high", due: "2026-10-30", createdAt: 3 };
  assert.deepEqual(sortTasks([A, B, C]), [C, B, A]);
});

test("same priority and due date sorts by createdAt", () => {
  const X = { priority: "low", due: "2026-11-01", createdAt: 20 };
  const Y = { priority: "low", due: "2026-11-01", createdAt: 10 };
  assert.deepEqual(sortTasks([X, Y]), [Y, X]);
});

test("an older record without priority sorts as medium", () => {
  const O = { title: "old", createdAt: 5 };
  const H = { priority: "high", createdAt: 9 };
  const L = { priority: "low", createdAt: 1 };
  assert.deepEqual(sortTasks([O, H, L]), [H, O, L]);
});

test("sortTasks does not mutate its input", () => {
  const L = { priority: "low", due: "", createdAt: 1 };
  const H = { priority: "high", due: "", createdAt: 2 };
  const M = { priority: "medium", due: "", createdAt: 3 };
  const input = [L, H, M];
  const sorted = sortTasks(input);
  assert.deepEqual(input, [L, H, M]);
  assert.notEqual(sorted, input);
});
