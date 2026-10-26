import { test } from "node:test";
import assert from "node:assert/strict";
import { nextDue, completeTask, stopRepeating } from "./recurrence.js";

const TODAY = "2026-10-26";

test("daily adds one day", () => {
  assert.equal(nextDue("2026-10-27", "daily", TODAY), "2026-10-28");
});

test("weekly adds seven days", () => {
  assert.equal(nextDue("2026-10-27", "weekly", TODAY), "2026-11-03");
});

test("weekly crosses into a new year", () => {
  assert.equal(nextDue("2026-12-29", "weekly", TODAY), "2027-01-05");
});

test("monthly keeps the day of the month", () => {
  assert.equal(nextDue("2026-10-15", "monthly", TODAY), "2026-11-15");
});

test("monthly clamps to the last day of a shorter month", () => {
  assert.equal(nextDue("2027-01-31", "monthly", TODAY), "2027-02-28");
  assert.equal(nextDue("2028-01-31", "monthly", TODAY), "2028-02-29");
});

test("no due date counts from today", () => {
  assert.equal(nextDue("", "weekly", TODAY), "2026-11-02");
});

test("no repeat has no next date", () => {
  assert.equal(nextDue("2026-10-27", "", TODAY), null);
});

const weekly = { id: 1, title: "Water plants", due: "2026-10-27", tags: ["home"], repeat: "weekly", done: false, createdAt: 1 };

test("completing a recurring task marks it done and creates the next occurrence", () => {
  const { updated, next } = completeTask(weekly, TODAY);
  assert.deepEqual(updated, { ...weekly, done: true, spawned: true });
  assert.deepEqual(next, { title: "Water plants", due: "2026-11-03", tags: ["home"], repeat: "weekly" });
});

test("completing an already spawned task creates nothing new", () => {
  const { updated, next } = completeTask({ ...weekly, spawned: true }, TODAY);
  assert.equal(updated.done, true);
  assert.equal(next, null);
});

test("completing a non-repeating task creates nothing", () => {
  const { updated, next } = completeTask({ ...weekly, repeat: "" }, TODAY);
  assert.equal(updated.done, true);
  assert.equal(next, null);
});

test("an older task with no repeat field creates nothing", () => {
  const { repeat, ...old } = weekly;
  assert.equal(completeTask(old, TODAY).next, null);
});

test("after Stop repeating, completing creates nothing", () => {
  const stopped = stopRepeating(weekly);
  assert.equal(stopped.repeat, "");
  assert.equal(completeTask(stopped, TODAY).next, null);
});
