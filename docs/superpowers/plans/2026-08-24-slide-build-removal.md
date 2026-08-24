# Slide Build Removal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove all progressive reveal directives except slide 8’s “Wait… did it change?” joke.

**Architecture:** Add a parser-backed source contract for the single allowed build, then remove only `v-click` attributes from all other slide content. Slide transitions and Mermaid options are unaffected.

**Tech Stack:** Slidev 52.18.0, `@slidev/parser`, Node.js 22.23.x tests, pnpm 10.34.5

## Global Constraints

- Exactly one `v-click` remains in the 30-slide deck.
- The remaining build is on slide 8 and wraps “Wait… did it change?”.
- No `v-after` or `v-clicks` remains.
- Preserve all content, classes, notes, transitions, Mermaid options, and slide order.

---

### Task 1: Remove Unwanted Progressive Builds

**Files:**
- Modify: `slides/tests/branding.test.mjs`
- Modify: `slides/slides.md`

- [ ] **Step 1: Add a failing parser-backed test**

Add a test that parses all slides, gathers content containing `v-click`, and asserts exactly one matching slide. Assert its one-based parser index is 8, its content includes `Wait… did it change?`, and no deck content contains `v-after` or `v-clicks`.

- [ ] **Step 2: Verify RED**

Run: `cd slides && pnpm test`

Expected: FAIL because multiple slides still contain `v-click`.

- [ ] **Step 3: Remove unwanted directives**

Remove the `v-click` attribute from every element except the element containing “Wait… did it change?”. Keep each element, class, text, and location unchanged.

- [ ] **Step 4: Verify GREEN**

Run:

```bash
cd slides
pnpm test
pnpm run build
```

Expected: all tests PASS, exactly 30 slides remain, and build exits 0.

- [ ] **Step 5: Verify source and browser behavior**

Run `rg -n 'v-click|v-after|v-clicks' slides/slides.md` and confirm one result. Use Playwright to confirm the remaining element is initially hidden on slide 8 and appears after one advance, while representative former-build content is visible immediately.

- [ ] **Step 6: Commit**

```bash
git add slides/tests/branding.test.mjs slides/slides.md
git commit -m "refactor: remove progressive slide builds"
```
