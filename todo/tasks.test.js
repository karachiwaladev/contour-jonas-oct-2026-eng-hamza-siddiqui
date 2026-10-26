import { test } from "node:test";
import assert from "node:assert/strict";
import { parseTags, matches, tagsInUse, isOverdue } from "./tasks.js";

test("parseTags trims, lowercases and removes duplicates", () => {
  assert.deepEqual(parseTags("work, Home , work"), ["work", "home"]);
  assert.deepEqual(parseTags("  ,  "), []);
});

const open = { title: "a", done: false, tags: ["work"] };
const done = { title: "b", done: true, tags: ["home", "work"] };
const old = { title: "c", done: false }; // record from before due dates, tags and repeat existed

test("status filter: all, incomplete, completed", () => {
  const all = { status: "all", tag: "" };
  const active = { status: "active", tag: "" };
  const completed = { status: "done", tag: "" };
  assert.deepEqual([open, done, old].filter((t) => matches(t, all)), [open, done, old]);
  assert.deepEqual([open, done, old].filter((t) => matches(t, active)), [open, old]);
  assert.deepEqual([open, done, old].filter((t) => matches(t, completed)), [done]);
});

test("tag filter combines with the status filter", () => {
  assert.deepEqual([open, done, old].filter((t) => matches(t, { status: "all", tag: "work" })), [open, done]);
  assert.deepEqual([open, done, old].filter((t) => matches(t, { status: "done", tag: "work" })), [done]);
  assert.deepEqual([open, done, old].filter((t) => matches(t, { status: "active", tag: "home" })), []);
});

test("tagsInUse lists each tag once, sorted, and ignores tasks without tags", () => {
  assert.deepEqual(tagsInUse([open, done, old]), ["home", "work"]);
});

test("isOverdue only flags open tasks with a past due date", () => {
  assert.equal(isOverdue({ done: false, due: "2026-10-20" }, "2026-10-26"), true);
  assert.equal(isOverdue({ done: true, due: "2026-10-20" }, "2026-10-26"), false);
  assert.equal(isOverdue({ done: false, due: "2026-10-26" }, "2026-10-26"), false);
  assert.equal(isOverdue({ done: false }, "2026-10-26"), false);
});

test("priority filter matches the task's priority", () => {
  const high = { done: false, tags: [], priority: "high" };
  assert.equal(matches(high, { status: "all", tag: "", priority: "high" }), true);
  assert.equal(matches(high, { status: "all", tag: "", priority: "low" }), false);
});

test("priority filter treats an older record without priority as medium", () => {
  assert.equal(matches(old, { status: "all", tag: "", priority: "medium" }), true);
  assert.equal(matches(old, { status: "all", tag: "", priority: "high" }), false);
});

test("empty priority filter matches every priority, including older records", () => {
  const all = { status: "all", tag: "", priority: "" };
  for (const p of ["high", "medium", "low"]) {
    assert.equal(matches({ done: false, tags: [], priority: p }, all), true);
  }
  assert.equal(matches(old, all), true);
});

test("priority filter combines with status and tag filters", () => {
  const task = { done: false, tags: ["home"], priority: "high" };
  const filters = { status: "active", tag: "home", priority: "high" };
  assert.equal(matches(task, filters), true);
  assert.equal(matches(task, { ...filters, status: "done" }), false);
  assert.equal(matches(task, { ...filters, tag: "work" }), false);
  assert.equal(matches(task, { ...filters, priority: "low" }), false);
});
