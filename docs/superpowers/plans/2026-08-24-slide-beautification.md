# Slide Beautification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the complete Slidev deck into the approved light, projector-friendly Six Feet Up × REVSYS visual system while preserving its content and presentation behavior.

**Architecture:** A small presentation-specific theme layer in `slides/styles/index.css` supplies stable design tokens and semantic slide classes. Reusable Vue components own the co-brand lockup and footer, while `slides.md` assigns slide families and retains all narrative content, notes, clicks, and code highlighting. Node's built-in test runner validates offline assets and structural contracts; Slidev build and Playwright export validate compilation and rendering.

**Tech Stack:** Slidev 52.18.0, Vue 3.5, UnoCSS, CSS, Node.js 22.23.x, pnpm 10.34.5, Node test runner, playwright-chromium

## Global Constraints

- Use a light lavender-white canvas as the default slide background.
- Use dark charcoal primary text, muted gray supporting text, Six Feet Up purple, and REVSYS blue.
- Use Poppins for presentation text and Roboto Mono for code and numeric details, with system fallbacks.
- Give Six Feet Up and REVSYS equal visual weight; do not map either brand to a framework.
- Store logos locally and keep the complete presentation usable without network access.
- Preserve all talk content, speaker notes, timing guidance, click animations, Mermaid diagrams, and code highlighting.
- Adjust markup only for hierarchy, readability, and recurring layouts; do not rewrite technical claims or benchmark content.
- Use the existing `.nvmrc`, `packageManager: pnpm@10.34.5`, and Node engine `22.23.x`.

---

## File Structure

- `slides/public/brands/six-feet-up.svg` — offline Six Feet Up logo.
- `slides/public/brands/revsys.svg` — offline REVSYS logo with a valid standalone SVG namespace.
- `slides/styles/index.css` — all visual tokens and semantic slide-family styles.
- `slides/components/BrandLockup.vue` — equal-weight logo lockup with configurable size.
- `slides/components/DeckFooter.vue` — recurring talk label and Slidev page number.
- `slides/tests/branding.test.mjs` — source-level branding, offline, and migration contract tests.
- `slides/package.json` and `slides/pnpm-lock.yaml` — test script and Playwright exporter dependency.
- `slides/slides.md` — semantic classes and presentation markup for all 26 slides.

---

### Task 1: Offline Brand and Theme Foundation

**Files:**
- Create: `slides/public/brands/six-feet-up.svg`
- Create: `slides/public/brands/revsys.svg`
- Create: `slides/styles/index.css`
- Create: `slides/components/BrandLockup.vue`
- Create: `slides/components/DeckFooter.vue`
- Create: `slides/tests/branding.test.mjs`
- Modify: `slides/package.json`
- Modify: `slides/pnpm-lock.yaml`

**Interfaces:**
- Produces: `<BrandLockup size="sm|md|lg" />`, with `size` defaulting to `md`.
- Produces: `<DeckFooter label="DJANGO VS. FASTAPI" />`, with `label` optional and Slidev's `$slidev.nav.currentPage` as the page number.
- Produces CSS classes: `.deck-title`, `.deck-subtitle`, `.deck-speakers`, `.deck-repo`, `.section-divider`, `.section-number`, `.section-kicker`, `.content-slide`, `.statement-slide`, `.code-comparison`, `.brand-rule`, `.deck-cards`, `.deck-card`, `.comparison-grid`, `.comparison-table`, `.dark-code-panel`, `.framework-accent`, `.framework-label`, `.diagram-panel`, `.checklist-grid`, `.result-placeholder`, `.recommendation-slide`, and `.no-deck-footer`.
- Consumes: approved logo sources staged at `/tmp/slide-brand-samples/sixfeetup.svg` and `/tmp/slide-brand-samples/revsys.svg`.

- [ ] **Step 1: Add the source-contract test and test script**

Create `slides/tests/branding.test.mjs` using only built-in Node modules:

```js
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

test('brand assets are standalone local SVG files', async () => {
  for (const file of ['public/brands/six-feet-up.svg', 'public/brands/revsys.svg']) {
    const svg = await read(file)
    assert.match(svg, /<svg[^>]+xmlns="http:\/\/www\.w3\.org\/2000\/svg"/)
    const withoutNamespaceDeclarations = svg.replaceAll(/xmlns(?::\w+)?="https?:\/\/[^\"]+"/g, '')
    assert.doesNotMatch(withoutNamespaceDeclarations, /https?:\/\//)
  }
})

test('theme exposes approved visual tokens and semantic families', async () => {
  const css = await read('styles/index.css')
  for (const token of ['--deck-paper', '--deck-ink', '--sixie-purple', '--revsys-blue'])
    assert.ok(css.includes(token), `missing ${token}`)
  for (const selector of ['.deck-title', '.section-divider', '.content-slide', '.code-comparison'])
    assert.ok(css.includes(selector), `missing ${selector}`)
})

test('brand components use local assets and accessible names', async () => {
  const lockup = await read('components/BrandLockup.vue')
  assert.match(lockup, /src="\/brands\/six-feet-up\.svg"/)
  assert.match(lockup, /src="\/brands\/revsys\.svg"/)
  assert.match(lockup, /alt="Six Feet Up"/)
  assert.match(lockup, /alt="REVSYS"/)
  assert.doesNotMatch(lockup, /https?:\/\//)
  const footer = await read('components/DeckFooter.vue')
  assert.match(footer, /currentPage/)
})
```

Add to `slides/package.json` scripts:

```json
"test": "node --test tests/*.test.mjs"
```

- [ ] **Step 2: Run the contract test and verify it fails**

Run:

```bash
cd slides
pnpm test
```

Expected: FAIL with `ENOENT` for the first missing brand asset.

- [ ] **Step 3: Add local SVG assets and exporter dependency**

Copy the approved SVGs, preserving their `viewBox` and ensuring each root begins with the SVG namespace:

```bash
mkdir -p public/brands
cp /tmp/slide-brand-samples/sixfeetup.svg public/brands/six-feet-up.svg
cp /tmp/slide-brand-samples/revsys.svg public/brands/revsys.svg
pnpm add --save-dev playwright-chromium
```

Verify both files contain `xmlns="http://www.w3.org/2000/svg"` and no remote URL.

- [ ] **Step 4: Implement the reusable components**

Create `BrandLockup.vue` with a typed size prop, two equal-height logo containers, a neutral divider, local `/brands/...` paths, and visible `alt` text:

```vue
<script setup lang="ts">
withDefaults(defineProps<{ size?: 'sm' | 'md' | 'lg' }>(), { size: 'md' })
</script>

<template>
  <div class="brand-lockup" :class="`brand-lockup--${size}`" aria-label="Presented by Six Feet Up and REVSYS">
    <img src="/brands/six-feet-up.svg" alt="Six Feet Up">
    <span class="brand-lockup__divider" aria-hidden="true" />
    <img src="/brands/revsys.svg" alt="REVSYS">
  </div>
</template>
```

Create `DeckFooter.vue`:

```vue
<script setup lang="ts">
withDefaults(defineProps<{ label?: string }>(), { label: 'DJANGO VS. FASTAPI' })
</script>

<template>
  <footer class="deck-footer" aria-hidden="true">
    <span>{{ label }}</span>
    <span class="deck-footer__number">{{ $slidev.nav.currentPage }}</span>
  </footer>
</template>
```

- [ ] **Step 5: Implement the global theme CSS**

Create `styles/index.css` with:

```css
@import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&family=Roboto+Mono:wght@500;700&display=swap');

:root {
  --deck-paper: #f6f5fa;
  --deck-panel: #ffffff;
  --deck-ink: #20202a;
  --deck-muted: #65616d;
  --deck-line: #dcd9e6;
  --sixie-purple: #9d00b0;
  --sixie-indigo: #3c23d3;
  --revsys-navy: #24315d;
  --revsys-blue: #5194fc;
}

.slidev-layout {
  background: var(--deck-paper);
  color: var(--deck-ink);
  font-family: Poppins, Inter, ui-sans-serif, system-ui, sans-serif;
  padding: 2.4rem 3.25rem 2.9rem;
}

.slidev-layout h1,
.slidev-layout h2,
.slidev-layout h3 { color: var(--deck-ink); font-family: inherit; font-weight: 700; }
.slidev-layout code,
.slidev-layout pre,
.deck-footer__number { font-family: 'Roboto Mono', ui-monospace, monospace; }
.brand-rule { height: 3px; background: linear-gradient(90deg, var(--sixie-purple), var(--revsys-blue), transparent); }
```

Complete every selector listed in **Interfaces** to match the approved mockups: bright canvas; 13px purple/blue left edge; compact lockup; quiet gradient-rule footer; numbered pale section rail; white cards with subtle borders and purple/indigo/blue top rules; dark `#25242c` code panels; high-contrast tables and result placeholders; balanced recommendation and comparison grids; responsive sizing through Slidev's fixed canvas rather than viewport media queries. Override default-theme styles for links, tables, blockquotes, Mermaid labels, and Shiki code wrappers without selecting hashed/generated classes.

- [ ] **Step 6: Run foundation verification**

Run:

```bash
cd slides
pnpm test
pnpm run build
```

Expected: all 3 tests PASS and Slidev build exits 0.

- [ ] **Step 7: Commit the foundation**

```bash
git add slides/public/brands slides/styles slides/components/BrandLockup.vue slides/components/DeckFooter.vue slides/tests slides/package.json slides/pnpm-lock.yaml
git commit -m "feat: add co-branded Slidev theme foundation"
```

---

### Task 2: Presentation Shell, Title, Dividers, and Closing

**Files:**
- Modify: `slides/tests/branding.test.mjs`
- Modify: `slides/slides.md:1-115, 388-402, 472-491, 851-876`

**Interfaces:**
- Consumes: `<BrandLockup size="lg" />`, `<DeckFooter />`, `.deck-title`, `.section-divider`, `.statement-slide`, and `.no-deck-footer` from Task 1.
- Produces: semantic shell and high-level pacing slides used as visual anchors for the rest of the deck.

- [ ] **Step 1: Extend tests for global frontmatter and anchor slides**

Append:

```js
test('deck uses the light semantic shell and local co-brand lockups', async () => {
  const deck = await read('slides.md')
  assert.match(deck, /^---[\s\S]*theme: default/m)
  assert.doesNotMatch(deck, /background:\s*https?:\/\//)
  assert.ok((deck.match(/<BrandLockup/g) ?? []).length >= 2)
  assert.ok((deck.match(/class:.*deck-title/g) ?? []).length >= 2)
  assert.ok((deck.match(/class:.*section-divider/g) ?? []).length >= 3)
})
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `cd slides && pnpm test`

Expected: FAIL because frontmatter still uses `theme: seriph`, a remote cover, and no brand lockups.

- [ ] **Step 3: Convert global frontmatter and title slide**

In the opening frontmatter, set `theme: default`, remove the remote `background`, retain title/info/duration/transitions/comark/mdc, and set `class: deck-title no-deck-footer`.

Replace the title slide's body with this hierarchy while retaining its existing notes unchanged:

```md
<BrandLockup size="lg" />

# Django <span class="framework-accent">vs.</span> FastAPI

## Batteries vs. Speed

<div class="deck-subtitle">A pragmatic conversation about framework trade-offs</div>
<div class="deck-speakers"><strong>Calvin Hendryx-Parker</strong><span>·</span><strong>Frank Wiles</strong></div>
<div class="deck-repo">github.com/sixfeetup/2026_DjangoCon_BatteriesVsSpeed</div>
```

- [ ] **Step 4: Convert pacing anchors into section and statement slides**

Apply `.statement-slide` to “There is no wrong answer here,” “Syntax is not the decision,” “Maybe only one part is special,” “Faster is not the same as better,” “You can use both,” and “Our answer.” Preserve their click directives.

Apply `.section-divider .no-deck-footer` and numbered section markup to:

```md
<div class="section-number">01</div>
<div class="section-kicker">THE COMPARISON</div>
# Different batteries.
## Different opinions.
```

```md
<div class="section-number">02</div>
<div class="section-kicker">THE WORKLOAD</div>
# Async?
## Start with what the application actually does.
```

```md
<div class="section-number">03</div>
<div class="section-kicker">THE EVIDENCE</div>
# All benchmarks are biased.
## Including ours.
```

Keep the original speaker notes and timing comments for each slide. Do not add a company-to-framework color mapping.

- [ ] **Step 5: Convert the thank-you slide**

Apply `.deck-title .no-deck-footer`, add `<BrandLockup size="lg" />`, retain repository/contact copy and notes, and use the same title hierarchy as the opening.

- [ ] **Step 6: Add `<DeckFooter />` to non-title/non-divider slides**

Insert `<DeckFooter />` once on each ordinary slide. Do not add it inside code fences, notes, title slides, or section dividers.

- [ ] **Step 7: Verify and commit shell migration**

Run:

```bash
cd slides
pnpm test
pnpm run build
```

Expected: all tests PASS and build exits 0.

```bash
git add slides/slides.md slides/tests/branding.test.mjs
git commit -m "feat: apply light presentation shell"
```

---

### Task 3: Migrate Comparison and Ecosystem Slides

**Files:**
- Modify: `slides/tests/branding.test.mjs`
- Modify: `slides/slides.md` slides from “Two perspectives” through “Build, buy, or vendor?”

**Interfaces:**
- Consumes: `.content-slide`, `.deck-cards`, `.deck-card`, `.comparison-grid`, `.dark-code-panel`, `.brand-rule`, `.code-comparison`, and `<DeckFooter />`.
- Produces: styled introductory, framework comparison, code, battery matrix, package example, dependency lifecycle, and decision-flow slides.

- [ ] **Step 1: Add migration assertions**

Add a test that extracts the deck text and asserts these classes occur at least the stated number of times:

```js
const occurrences = (text, value) => (text.match(new RegExp(value, 'g')) ?? []).length

test('comparison half uses semantic slide families', async () => {
  const deck = await read('slides.md')
  assert.ok(occurrences(deck, 'content-slide') >= 6)
  assert.ok(occurrences(deck, 'code-comparison') >= 2)
  assert.ok(occurrences(deck, 'deck-card') >= 6)
})
```

- [ ] **Step 2: Run tests and verify the migration assertion fails**

Run: `cd slides && pnpm test`

Expected: FAIL on one or more minimum counts.

- [ ] **Step 3: Migrate introductory content slides**

Apply `.content-slide` and approved structures to:

- “Two perspectives”: two equal white presenter panels with neutral headings; do not color presenters as frameworks.
- “What are we actually comparing?”: central comparison statement with a restrained purple “vs.” accent.
- “Start with context, not framework”: `.deck-cards` with three `.deck-card` elements for team, scope, workload.
- “Did the slide change?”: `.statement-slide` with sparse setup copy.

Retain all bullets, `v-click` directives, and notes exactly.

- [ ] **Step 4: Migrate the FastAPI and Django Ninja code slides**

Apply `.code-comparison` to both slides, wrap each existing fenced block in a `.dark-code-panel`, and retain every code line and existing line-highlight sequence. Use a neutral `.framework-label`; do not use company logo colors to identify frameworks.

- [ ] **Step 5: Migrate batteries and ecosystem slides**

- Style the concern table as `.comparison-table` with high-contrast header and alternating subtle rows.
- Convert “A battery that buys leverage” to an equal `.comparison-grid` with one dark code panel and one white explanatory panel.
- Convert “Batteries have a shelf life” to a three-step lifecycle row plus two equal outcome cards; preserve green/amber meaning only as status accents.
- Keep the Mermaid source for “Build, buy, or vendor?” unchanged and place it in `.diagram-panel` with the existing click takeaway below it.

- [ ] **Step 6: Verify and commit the first content migration**

Run:

```bash
cd slides
pnpm test
pnpm run build
```

Expected: tests PASS and build exits 0.

```bash
git add slides/slides.md slides/tests/branding.test.mjs
git commit -m "feat: restyle comparison and ecosystem slides"
```

---

### Task 4: Migrate Workload, Benchmark, Operations, and Decision Slides

**Files:**
- Modify: `slides/tests/branding.test.mjs`
- Modify: `slides/slides.md` slides from “Async is a workload property” through “Our answer”

**Interfaces:**
- Consumes all theme classes and components from Tasks 1–3.
- Produces the fully migrated 26-slide source deck.

- [ ] **Step 1: Add full-deck structural assertions**

Append:

```js
test('every slide has a semantic family and branding remains framework-neutral', async () => {
  const deck = await read('slides.md')
  const slideCount = (deck.match(/^# (?!#)/gm) ?? []).length
  assert.equal(slideCount, 26)
  assert.ok((deck.match(/<DeckFooter/g) ?? []).length >= 18)
  assert.equal((deck.match(/result-placeholder/g) ?? []).length, 2)
  assert.equal((deck.match(/recommendation-slide/g) ?? []).length, 2)
  assert.doesNotMatch(deck, /sixie-(purple|indigo)[^\n]*(FastAPI|Django)/i)
  assert.doesNotMatch(deck, /revsys-(blue|navy)[^\n]*(FastAPI|Django)/i)
  assert.doesNotMatch(deck, /background:\s*https?:\/\//)
})
```

- [ ] **Step 2: Run tests and verify the full-deck contract fails**

Run: `cd slides && pnpm test`

Expected: FAIL because the second half is not fully migrated or lacks footers.

- [ ] **Step 3: Migrate workload and architecture slides**

- “Async is a workload property”: two equal cards for “Often valuable” and “Not magic,” preserving all list items and the click takeaway.
- “Maybe only one part is special” and “In production, the shapes converge”: retain Mermaid source unchanged inside `.diagram-panel`.
- “Our benchmark contract”: use a two-column checklist grid with restrained check icons.

- [ ] **Step 4: Migrate scenario and result slides**

- Scenario A and B: use `.comparison-grid`, retain all endpoint examples, JSON, bullets, naming caveat, and notes.
- Redis and PostgreSQL results: style existing placeholders as `.result-placeholder` with dashed purple-to-blue border. Do not invent benchmark data.
- “Faster is not the same as better”: use three equal `.deck-card` prompts and preserve the click takeaway.

- [ ] **Step 5: Migrate deploy, recommendation, and conclusion slides**

- “Easy deploy paths”: equal product cards with neutral treatment and dark monospaced command strips.
- Django and FastAPI recommendation slides: apply `.recommendation-slide` with equal layout structure and visual weight; use existing battery/lightning emoji without company-color mapping.
- “You can use both” and “Our answer”: retain statement-slide hierarchy and all click sequences.

- [ ] **Step 6: Verify and commit full migration**

Run:

```bash
cd slides
pnpm test
pnpm run build
```

Expected: all tests PASS and build exits 0.

```bash
git add slides/slides.md slides/tests/branding.test.mjs
git commit -m "feat: complete light slide migration"
```

---

### Task 5: Offline Export and Visual QA

**Files:**
- Modify as defects require: `slides/styles/index.css`
- Modify as defects require: `slides/slides.md`
- Modify as defects require: `slides/components/BrandLockup.vue`
- Modify as defects require: `slides/components/DeckFooter.vue`

**Interfaces:**
- Consumes: complete deck from Tasks 1–4.
- Produces: verified build and exported PDF with no unintended overflow or missing branding.

- [ ] **Step 1: Install the pinned Chromium browser binary**

Run:

```bash
cd slides
pnpm exec playwright install chromium
```

Expected: Chromium installation exits 0.

- [ ] **Step 2: Run complete automated verification with network disabled for the build**

First run the test and build normally, then confirm all deck-owned runtime assets are local by searching source:

```bash
cd slides
pnpm test
pnpm run build
! rg -n 'src="https?://|background:\s*https?://' slides.md components styles public
```

Expected: tests PASS, build exits 0, and the URL search exits 0 because no runtime image/background URLs are found. The Google Fonts CSS import is permitted because system fallbacks preserve offline usability; it must not be the only font declaration.

- [ ] **Step 3: Export the full deck**

Run:

```bash
cd slides
rm -f /tmp/batteries-v-speed.pdf
pnpm run export -- --output /tmp/batteries-v-speed.pdf
pdfinfo /tmp/batteries-v-speed.pdf | rg '^Pages:\s+26$'
```

Expected: export exits 0 and PDF reports exactly 26 pages.

- [ ] **Step 4: Render pages for inspection**

Run:

```bash
rm -rf /tmp/batteries-v-speed-pages
mkdir -p /tmp/batteries-v-speed-pages
pdftoppm -png -r 96 /tmp/batteries-v-speed.pdf /tmp/batteries-v-speed-pages/slide
find /tmp/batteries-v-speed-pages -name 'slide-*.png' | wc -l
```

Expected: `26` PNG files.

- [ ] **Step 5: Inspect every exported page**

Review all 26 PNGs in order. Check for: clipped headings or code; footer collisions; unreadably small body text; broken or unequal logos; Mermaid label contrast; accidental dark full-slide backgrounds; inconsistent card spacing; missing click-final-state content; and company colors that imply framework ownership. Record each defect by slide number before editing.

- [ ] **Step 6: Correct only observed visual defects**

Make the smallest CSS or markup correction for each recorded defect. Do not rewrite talk content. Re-run Steps 2–5 after corrections; repeat until the defect list is empty.

- [ ] **Step 7: Run final verification and commit QA corrections**

Run fresh:

```bash
cd slides
pnpm test
pnpm run build
rm -f /tmp/batteries-v-speed.pdf
pnpm run export -- --output /tmp/batteries-v-speed.pdf
pdfinfo /tmp/batteries-v-speed.pdf | rg '^Pages:\s+26$'
git diff --check
```

Expected: tests PASS, build and export exit 0, PDF has 26 pages, and `git diff --check` exits 0.

If QA changed tracked files:

```bash
git add slides/styles/index.css slides/slides.md slides/components/BrandLockup.vue slides/components/DeckFooter.vue
git commit -m "fix: polish exported slide layouts"
```

If QA required no changes, do not create an empty commit.
