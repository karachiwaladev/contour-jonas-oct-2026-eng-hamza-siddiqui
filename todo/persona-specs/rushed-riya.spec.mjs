// Rushed Riya (personas.yaml) as quicke2e flows: Jev drives, these assertions decide.
// Each flow starts in a fresh browser with an empty IndexedDB, so it sets up its own tasks.
// maxSteps is Riya's patience_steps: a MAX_STEPS outcome means she gave up.
const day = (offset) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d;
};
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const shown = (d) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });

export default [
  {
    name: "rushed-riya-1-add-due-tomorrow",
    maxSteps: 15,
    inputs: { "what needs doing": "dentist fri", due: iso(day(1)) },
    goal: "Type dentist fri as the task, set the due date to tomorrow, and press Enter to add it.",
    expect: ["dentist fri", `Due ${shown(day(1))}`],
  },
  {
    name: "rushed-riya-2-find-by-part",
    maxSteps: 15,
    inputs: { "what needs doing": "dentist fri", "search tasks": "dent" },
    goal: "Add a task called dentist fri by pressing Enter, then type dent into Search tasks.",
    expect: ["dentist fri"],
    expectState: [{ role: "searchbox", name: "Search tasks", value: "dent" }],
  },
  {
    name: "rushed-riya-3-tick-and-hide",
    maxSteps: 15,
    inputs: { "what needs doing": "buy milk!!" },
    goal: "Add a task called buy milk!! by pressing Enter, tick Mark done on it, then click Incomplete to get it out of sight.",
    expect: ["No tasks match these filters."],
  },
];
