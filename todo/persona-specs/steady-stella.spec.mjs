// Steady Stella (personas.yaml) as quicke2e flows: Jev drives, these assertions decide.
// Each flow starts in a fresh browser with an empty IndexedDB, so it sets up its own tasks.
// maxSteps is Stella's patience_steps: a MAX_STEPS outcome means she gave up.
const nextFriday = () => {
  const d = new Date();
  d.setDate(d.getDate() + (((5 - d.getDay()) + 7) % 7 || 7));
  return d;
};
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const shown = (d) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });

export default [
  {
    name: "steady-stella-1-add-for-friday",
    maxSteps: 25,
    inputs: { "what needs doing": "Call the pharmacy", due: iso(nextFriday()) },
    goal: "Type Call the pharmacy as the task, set the due date to Friday, and press Enter to add it.",
    expect: ["Call the pharmacy", `Due ${shown(nextFriday())}`],
  },
  {
    name: "steady-stella-2-see-not-done",
    maxSteps: 25,
    inputs: { "what needs doing": "Call the pharmacy" },
    goal: "Add a task called Call the pharmacy, tick Mark done on it, then click Incomplete to see only the tasks that are not done yet.",
    expect: ["No tasks match these filters."],
  },
  {
    name: "steady-stella-3-rename",
    maxSteps: 25,
    inputs: { "what needs doing": "Call the pharmacy", title: "Call the chemist" },
    goal: "Add a task called Call the pharmacy, click its Edit button, change the title to Call the chemist, and click Save.",
    expect: ["Call the chemist"],
    expectGone: ["Call the pharmacy"],
  },
];
