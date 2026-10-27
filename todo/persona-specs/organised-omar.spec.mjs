// Organised Omar (personas.yaml) as quicke2e flows: Jev drives, these assertions decide.
// Each flow starts in a fresh browser with an empty IndexedDB, so it sets up its own tasks.
// maxSteps is Omar's patience_steps: a MAX_STEPS outcome means he gave up.
const day = (offset) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d;
};
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const shown = (d) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });

export default [
  {
    name: "organised-omar-1-weekly-high-task",
    maxSteps: 35,
    inputs: { "what needs doing": "Weekly review", due: iso(day(2)), repeat: "Weekly", priority: "High", tags: "work" },
    goal: "Fill in a task called Weekly review with a due date, set Repeat to Weekly, Priority to High and the tag work, then click Add.",
    expect: ["Weekly review", "↻ Weekly", `Due ${shown(day(2))}`, "#work"],
  },
  {
    name: "organised-omar-2-edit-a-task",
    maxSteps: 35,
    inputs: { "what needs doing": "Plan sprint", title: "Plan sprint and retro" },
    goal: "Add a task called Plan sprint, click its Edit button, change the title to Plan sprint and retro, and click Save.",
    expect: ["Plan sprint and retro"],
    expectAbsent: ["Title cannot be empty."],
  },
  {
    name: "organised-omar-3-cancel-an-edit",
    maxSteps: 35,
    inputs: { "what needs doing": "Book flights", title: "Book trains" },
    goal: "Add a task called Book flights, click its Edit button, change the title to Book trains, then click Cancel instead of saving.",
    expect: ["Book flights"],
    expectState: [{ role: "button", name: "Edit" }],
    expectAbsent: ["Book trains"],
  },
  {
    name: "organised-omar-4-combine-filters",
    maxSteps: 35,
    inputs: { "what needs doing": "Ship report", tags: "work", priority: "High", tag: "#work", "search tasks": "ship" },
    goal: "Add a High priority task called Ship report tagged work, then click Incomplete, choose #work in the Tag filter, and type ship into Search tasks.",
    expect: ["Ship report"],
    expectState: [{ role: "searchbox", name: "Search tasks", value: "ship" }, { role: "combobox", name: "Tag", value: "#work" }],
  },
];
