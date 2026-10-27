// Search matching for the filter bar's search box. Pure functions; no DOM or storage.

// "  #Home  milk " -> ["home", "milk"]. Leading "#"s are dropped; "c#" stays "c#".
export function parseQuery(text) {
  return String(text ?? "")
    .toLowerCase()
    .split(/\s+/)
    .map((word) => word.replace(/^#+/, ""))
    .filter(Boolean);
}

// True when every search word is part of the title or part of at least one tag.
// No words matches everything. Older records without tags are searched by title only.
export function matchesSearch(task, text) {
  const words = parseQuery(text);
  if (words.length === 0) return true;
  const title = String(task.title ?? "").toLowerCase();
  const tags = (task.tags || []).map((tag) => String(tag).toLowerCase());
  return words.every((word) => title.includes(word) || tags.some((tag) => tag.includes(word)));
}
