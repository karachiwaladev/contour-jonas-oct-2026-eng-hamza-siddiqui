// Malicious Max (personas.yaml, mode: adversarial) as quicke2e attack flows.
// Each payload, if it runs, appends a marker built from two halves ('PW'+'NED-n'), so the
// payload shown as plain text never contains the marker but executed script does.
// expect: the payload is shown as text. expectAbsent: the marker never appears.
// Out of quicke2e's reach (one action at a time, no storage writes): planting hostile
// IndexedDB records and double-click races. Run `/persona-test todo --deep` for those.
const run = (n) => `document.body.append('PW'+'NED-${n}')`;

export default [
  {
    name: "malicious-max-1-img-in-title",
    kind: "attack",
    maxSteps: 40,
    inputs: { "what needs doing": `<img src=x onerror="${run(1)}">` },
    goal: "Type the given img text as the task and press Enter to add it.",
    expect: ["<img src=x onerror="],
    expectAbsent: ["PWNED-1"],
  },
  {
    name: "malicious-max-2-svg-in-tags",
    kind: "attack",
    maxSteps: 40,
    inputs: { "what needs doing": "tagged task", tags: `<svg onload="${run(2)}">` },
    goal: "Type tagged task as the task, type the given svg text into Tags, and click Add.",
    expect: ["tagged task", "#<svg onload="],
    expectAbsent: ["PWNED-2"],
  },
  {
    name: "malicious-max-3-breakout-in-search",
    kind: "attack",
    maxSteps: 40,
    inputs: { "what needs doing": "plain task", "search tasks": `"><img src=x onerror="${run(3)}">` },
    goal: "Add a task called plain task by pressing Enter, then type the given text into Search tasks.",
    expect: ["No tasks match these filters."],
    expectAbsent: ["PWNED-3"],
  },
  {
    name: "malicious-max-4-attribute-breakout-in-edit",
    kind: "attack",
    maxSteps: 40,
    inputs: { "what needs doing": "edit me", title: `' autofocus onfocus="${run(4)}" x='` },
    goal: "Add a task called edit me, click its Edit button, replace the title with the given text, and click Save.",
    expect: ["autofocus onfocus="],
    expectAbsent: ["PWNED-4"],
  },
  {
    name: "malicious-max-5-template-text",
    kind: "attack",
    maxSteps: 40,
    inputs: { "what needs doing": "${7*7} {{7*7}} <%= 7*7 %>" },
    goal: "Type the given template text as the task and press Enter to add it.",
    expect: ["${7*7} {{7*7}} <%= 7*7 %>"],
  },
];
