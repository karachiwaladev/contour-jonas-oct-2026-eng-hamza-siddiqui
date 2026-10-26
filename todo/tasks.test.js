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
