# Benchmark Slide Order Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorder the four benchmark scenario/result slides so each result immediately follows its corresponding demo introduction.

**Architecture:** Add a parser-backed source contract for the approved heading order, then move the complete Redis-results Slidev block ahead of the Zellit scenario block. No slide internals change.

**Tech Stack:** Slidev 52.18.0, `@slidev/parser`, Node.js 22.23.x built-in test runner, pnpm 10.34.5

## Global Constraints

- Required order: ZIP scenario, Redis results, Zellit scenario, PostgreSQL results.
- Preserve complete slide blocks, notes, timing, clicks, content, components, and frontmatter.
- Preserve exactly 30 slides.
- Do not change surrounding slide order.

---

### Task 1: Reorder Benchmark Scenario and Result Blocks

**Files:**
- Modify: `slides/tests/branding.test.mjs`
- Modify: `slides/slides.md`

**Interfaces:**
- Consumes: existing `parseDeck()` test helper.
- Produces: a source contract that extracts the four benchmark H1 headings and asserts their exact order.

- [ ] **Step 1: Add the failing order test**

Add:

```js
test('benchmark results immediately follow their demo introductions', async () => {
  const slides = await parseDeck()
  const benchmarkHeadings = slides
    .map(slide => slide.content.match(/^# (.+)$/m)?.[1])
    .filter(heading => heading && /^(Scenario [AB]:|Results:)/.test(heading))

  assert.deepEqual(benchmarkHeadings, [
    'Scenario A: ZIP typeahead',
    'Results: Redis workload',
    'Scenario B: Zellit',
    'Results: PostgreSQL workload',
  ])
})
```

- [ ] **Step 2: Run tests and verify RED**

Run: `cd slides && pnpm test`

Expected: FAIL showing current order `Scenario A`, `Scenario B`, `Results: Redis`, `Results: PostgreSQL`.

- [ ] **Step 3: Move the complete Redis-results block**

Move the complete Slidev block headed `# Results: Redis workload`—from its opening slide separator/frontmatter through its closing speaker-notes comment—to immediately after the complete `# Scenario A: ZIP typeahead` block and before the `# Scenario B: Zellit` block.

Do not edit text inside any of the four blocks. The resulting order must be:

```text
Scenario A: ZIP typeahead
Results: Redis workload
Scenario B: Zellit
Results: PostgreSQL workload
```

- [ ] **Step 4: Verify GREEN and preservation**

Run:

```bash
cd slides
pnpm test
pnpm run build
```

Expected: all tests PASS, parsed slide count remains 30, and build exits 0.

Inspect `git diff --word-diff=porcelain -- slides/slides.md` and confirm it represents block movement only, with no rewritten slide content.

- [ ] **Step 5: Verify the running deck order**

Use Playwright against the running server to read slide H1 text for slides 19–22.

Expected:

```text
19 Scenario A: ZIP typeahead
20 Results: Redis workload
21 Scenario B: Zellit
22 Results: PostgreSQL workload
```

- [ ] **Step 6: Commit**

```bash
git add slides/tests/branding.test.mjs slides/slides.md
git commit -m "refactor: pair benchmark results with scenarios"
```
