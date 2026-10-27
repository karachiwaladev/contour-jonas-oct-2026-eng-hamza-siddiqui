// The page's fixed controls: fills the priority selects from PRIORITIES and reports
// filter bar changes. Holds no state; `filters` is owned and passed in by the caller.
import { PRIORITIES, DEFAULT_PRIORITY } from "./priority.js";

// Add form: one option per priority, DEFAULT_PRIORITY selected (and restored by reset()).
// Filter: "All priorities" first, then each priority.
export function renderPriorityOptions(addSelect, filterSelect) {
  addSelect.replaceChildren(
    ...Object.entries(PRIORITIES).map(([value, text]) => {
      const isDefault = value === DEFAULT_PRIORITY;
      return new Option(text, value, isDefault, isDefault);
    })
  );
  filterSelect.replaceChildren(
    new Option("All priorities", ""),
    ...Object.entries(PRIORITIES).map(([value, text]) => new Option(text, value))
  );
}

// Updates `filters` from the search box, the status buttons and the tag and
// priority selects, then calls onChange().
export function bindFilters({ searchInput, statusButtons, tagSelect, prioritySelect }, filters, onChange) {
  bindSearch(searchInput, filters, onChange);
  statusButtons.forEach((btn) =>
    btn.addEventListener("click", () => {
      filters.status = btn.dataset.status;
      statusButtons.forEach((b) => b.setAttribute("aria-pressed", String(b === btn)));
      onChange();
    })
  );
  tagSelect.addEventListener("change", () => {
    filters.tag = tagSelect.value;
    onChange();
  });
  prioritySelect.addEventListener("change", () => {
    filters.priority = prioritySelect.value;
    onChange();
  });
}

// Filters on every keystroke (and the field's built-in clear button); Escape clears it.
function bindSearch(searchInput, filters, onChange) {
  searchInput.addEventListener("input", () => {
    filters.search = searchInput.value;
    onChange();
  });
  searchInput.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    e.preventDefault();
    searchInput.value = "";
    filters.search = "";
    onChange();
  });
}
