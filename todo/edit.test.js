import { test } from "node:test";
import assert from "node:assert/strict";
import { validateEdit, applyEdit, keepEditing } from "./edit.js";
import { completeTask } from "./recurrence.js";

const TODAY = "2026-10-26";

test("validateEdit rejects an empty or blank title", () => {
  assert.equal(validateEdit({ title: "   " }), "Title cannot be empty.");
  assert.equal(validateEdit({ title: "" }), "Title cannot be empty.");
  assert.equal(validateEdit({ title: "Buy milk" }), "");
});

test("applyEdit updates the edited fields and keeps the rest", () => {
  const task = { id: 3, title: "Buy milk", done: true, due: "2026-10-30", tags: ["home"], repeat: "weekly", spawned: true, createdAt: 1000, priority: "low" };
  const input = { title: "  Buy oat milk ", due: "2026-10-31", repeat: "weekly", tags: "Home, shop", priority: "high" };
  assert.deepEqual(applyEdit(task, input, TODAY), {
    id: 3, title: "Buy oat milk", done: true, due: "2026-10-31", tags: ["home", "shop"], repeat: "weekly", spawned: true, createdAt: 1000, priority: "high",
  });
});

const rent = { id: 5, title: "Rent", done: false, due: "2027-02-28", repeat: "monthly", anchorDay: 31, createdAt: 1, priority: "medium", tags: [] };
const rentInput = { title: "Pay rent", due: "2027-02-28", repeat: "monthly", tags: "", priority: "high" };

test("anchorDay is kept when repeat and due are unchanged", () => {
  const result = applyEdit(rent, rentInput, TODAY);
  assert.equal(result.anchorDay, 31);
  assert.equal(result.id, 5);
  assert.equal(result.done, false);
  assert.equal(result.createdAt, 1);
});

test("anchorDay is recomputed when a monthly task's due date changes", () => {
  const result = applyEdit(rent, { ...rentInput, due: "2027-03-15" }, TODAY);
  assert.equal(result.anchorDay, 15);
});

test("anchorDay is removed when the task stops being monthly", () => {
  const result = applyEdit(rent, { ...rentInput, repeat: "" }, TODAY);
  assert.equal(result.repeat, "");
  assert.equal("anchorDay" in result, false);
});

test("a task that becomes monthly gets an anchorDay", () => {
  const task = { id: 7, title: "Bills", done: false, due: "2026-11-30", repeat: "", tags: [], createdAt: 4, priority: "medium" };
  const input = { title: "Bills", due: "2026-11-30", repeat: "monthly", tags: "", priority: "medium" };
  assert.equal(applyEdit(task, input, TODAY).anchorDay, 30);
});

test("invalid priority and repeat values are normalized", () => {
  const result = applyEdit(rent, { ...rentInput, priority: "urgent", repeat: "yearly" }, TODAY);
  assert.equal(result.priority, "medium");
  assert.equal(result.repeat, "");
});

test("editing an older record without optional fields", () => {
  const old = { id: 9, title: "old", done: false, createdAt: 2 };
  const input = { title: "old", due: "", repeat: "", tags: "", priority: "medium" };
  assert.deepEqual(applyEdit(old, input, TODAY), { id: 9, title: "old", done: false, createdAt: 2, due: "", tags: [], repeat: "", priority: "medium" });
});

test("applyEdit does not mutate the task or the input", () => {
  const task = structuredClone(rent);
  const input = { ...rentInput, due: "2027-03-15", tags: "Home, shop" };
  const taskCopy = structuredClone(task);
  const inputCopy = structuredClone(input);
  applyEdit(task, input, TODAY);
  assert.deepEqual(task, taskCopy);
  assert.deepEqual(input, inputCopy);
});

test("an open one-off that already spawned restarts its series when edited back to a repeat", () => {
  const reopened = { id: 11, title: "Water plants", done: false, due: "2026-10-28", tags: [], repeat: "", spawned: true, createdAt: 3, priority: "medium" };
  const input = { title: "Water plants", due: "2026-10-28", repeat: "weekly", tags: "", priority: "medium" };
  const edited = applyEdit(reopened, input, TODAY);
  assert.equal("spawned" in edited, false);
  const { updated, next } = completeTask(edited, TODAY);
  assert.equal(next.due, "2026-11-04");
  assert.equal(next.repeat, "weekly");
  assert.equal(updated.spawned, true);
});

test("a done task that spawned keeps spawned, even when its repeat changes", () => {
  const done = { id: 12, title: "Gym", done: true, due: "2026-10-20", tags: [], repeat: "daily", spawned: true, createdAt: 3, priority: "low" };
  const input = { title: "Gym", due: "2026-10-20", repeat: "weekly", tags: "", priority: "low" };
  assert.equal(applyEdit(done, input, TODAY).spawned, true);
});

test("an open one-off that spawned keeps spawned while it stays a one-off", () => {
  const reopened = { id: 13, title: "Gym", done: false, due: "", tags: [], repeat: "", spawned: true, createdAt: 3, priority: "low" };
  const input = { title: "Gym", due: "", repeat: "", tags: "", priority: "low" };
  assert.equal(applyEdit(reopened, input, TODAY).spawned, true);
});

test("spawned is never added to a task that did not have it", () => {
  const input = { title: "New", due: "2026-10-30", repeat: "weekly", tags: "", priority: "medium" };
  for (const done of [true, false]) {
    const task = { id: 14, title: "New", done, due: "", tags: [], repeat: "", createdAt: 3, priority: "medium" };
    assert.equal("spawned" in applyEdit(task, input, TODAY), false);
  }
});

test("keepEditing keeps the id only while that task is visible", () => {
  const visible = [{ id: 1 }, { id: 2 }];
  assert.equal(keepEditing(visible, 2), 2);
  assert.equal(keepEditing(visible, 3), null);
  assert.equal(keepEditing(visible, null), null);
  assert.equal(keepEditing([], 1), null);
});
