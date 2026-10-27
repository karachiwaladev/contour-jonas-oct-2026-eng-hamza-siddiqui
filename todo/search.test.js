import { test } from "node:test";
import assert from "node:assert/strict";
import { parseQuery, matchesSearch } from "./search.js";

const milk = { title: "Buy milk", done: false, tags: ["home"], priority: "high" };
const report = { title: "Write report", done: true, tags: ["work", "buying"], priority: "low" };
const old = { title: "Call Mum", done: false }; // older record: no tags or priority

// parseQuery

test("parseQuery lowercases a single word", () => {
  assert.deepEqual(parseQuery("Milk"), ["milk"]);
});

test("parseQuery ignores extra spaces", () => {
  assert.deepEqual(parseQuery("  milk   home "), ["milk", "home"]);
});

test("parseQuery removes a leading #", () => {
  assert.deepEqual(parseQuery("#Home"), ["home"]);
  assert.deepEqual(parseQuery("##home"), ["home"]);
});

test("parseQuery returns no words for empty, blank or # only text", () => {
  assert.deepEqual(parseQuery(""), []);
  assert.deepEqual(parseQuery("   "), []);
  assert.deepEqual(parseQuery("#"), []);
});

test("parseQuery only removes a leading #", () => {
  assert.deepEqual(parseQuery("c#"), ["c#"]);
});

// matchesSearch

test("an empty query matches everything", () => {
  assert.equal(matchesSearch(milk, ""), true);
  assert.equal(matchesSearch(milk, "   "), true);
  assert.equal(matchesSearch(old, "#"), true);
});

test("case is ignored in the title", () => {
  assert.equal(matchesSearch(milk, "MILK"), true);
});

test("part of a word matches", () => {
  assert.equal(matchesSearch(milk, "mil"), true);
  assert.equal(matchesSearch(report, "port"), true);
});

test("tags match, including part of a tag", () => {
  assert.equal(matchesSearch(milk, "home"), true);
  assert.equal(matchesSearch(report, "buy"), true);
});

test("a leading # is ignored", () => {
  assert.equal(matchesSearch(milk, "#home"), true);
  assert.equal(matchesSearch(milk, "#HOM"), true);
});

test("every word must match somewhere", () => {
  assert.equal(matchesSearch(milk, "milk home"), true);
  assert.equal(matchesSearch(milk, "milk work"), false);
});

test("word order doesn't matter", () => {
  assert.equal(matchesSearch(milk, "home buy"), true);
});

test("no match returns false", () => {
  assert.equal(matchesSearch(milk, "bread"), false);
});

test("one word is not matched across the title and a tag together", () => {
  assert.equal(matchesSearch(milk, "milkhome"), false);
});

test("an older record without tags is searched by title and doesn't throw", () => {
  assert.equal(matchesSearch(old, "mum"), true);
  assert.equal(matchesSearch(old, "home"), false);
});
