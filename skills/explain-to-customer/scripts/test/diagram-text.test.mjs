/** Label extraction from Mermaid source. Run: node --test scripts/test/diagram-text.test.mjs */
import test from "node:test";
import assert from "node:assert/strict";
import { extractLabels, diagramLabels } from "../lib/diagram-text.mjs";

const has = (line, ...want) => {
  const got = extractLabels(line);
  for (const w of want) assert.ok(got.includes(w), `"${w}" not in ${JSON.stringify(got)} for: ${line}`);
};

test("flowchart node shapes and edge labels", () => {
  has('A(["Customer presses “Sign up”"]) --> B{"Details correct?"}', "Customer presses “Sign up”", "Details correct?");
  has("B -- Yes --> C([Account created])", "Yes", "Account created");
  has("D -->|No| E[Wrong field turns red]", "No", "Wrong field turns red");
  has("F[Hint<br>below the field]", "Hint below the field");
  has("G>Flag shape] --> H[Done]", "Flag shape", "Done");
  assert.ok(!extractLabels("A-->B[x]").some((l) => l.includes("[")));
});

test("sequence messages, notes and state descriptions", () => {
  has("Customer->>Shop: Pays with card", "Pays with card");
  has("Shop-->>Customer: Receipt by email", "Receipt by email");
  has("Note over Shop,Bank: Card is checked", "Card is checked");
  has("Paid: Waiting for shipping", "Waiting for shipping");
});

test("journey, timeline and titles", () => {
  has("title Sign-up before and after", "Sign-up before and after");
  has("section After", "After");
  has("Find the error: 5: Customer", "Find the error", "Customer");
  has("November 2026 : Live for everyone", "Live for everyone");
});

test("nested shapes leave no delimiters behind", () => {
  assert.deepEqual(extractLabels("A([Form is sent]) --> B[(Saved)]").sort(), ["Form is sent", "Saved"]);
  assert.deepEqual(extractLabels('A(["Pay now"])'), ["Pay now"]);
});

test("participants, sequence blocks and style lines", () => {
  has("participant S as Online shop", "Online shop");
  has("alt Card accepted", "Card accepted");
  has("loop Every morning", "Every morning");
  assert.deepEqual(extractLabels("classDef ok fill:#e6f4eaff,stroke:#1e7a3c"), []);
  assert.deepEqual(extractLabels("style A fill:#fff"), []);
});

test("comments and the diagram type line are skipped", () => {
  assert.deepEqual(extractLabels("%% internal note"), []);
  assert.deepEqual(
    diagramLabels("%%{init: {'look': 'neo'}}%%\nflowchart TD\n  A[Go]").map((r) => r.text),
    ["Go"],
  );
  const rows = diagramLabels("flowchart LR\n  A[Start] --> B[End]\n");
  assert.deepEqual(
    rows.map((r) => [r.line, r.text]),
    [
      [2, "Start"],
      [2, "End"],
    ],
  );
});

test("a secret inside a label is surfaced as label text", () => {
  const rows = diagramLabels('flowchart LR\n  A["Call with sk-live_abcdefghijklmnopqrstuv"] --> B[admin@acme-corp.com]\n');
  const texts = rows.map((r) => r.text).join(" | ");
  assert.match(texts, /sk-live_abcdefghijklmnopqrstuv/);
  assert.match(texts, /admin@acme-corp\.com/);
});
