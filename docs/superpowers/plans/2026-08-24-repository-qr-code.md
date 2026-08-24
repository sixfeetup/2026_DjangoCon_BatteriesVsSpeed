# Repository QR Code Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an offline, independently verified repository QR card to the bottom-right of the title and thank-you slides.

**Architecture:** A generated local SVG stores the QR payload, and a small Vue component owns accessible QR-card markup. Global presentation CSS positions the reusable card on title-family slides; source tests protect URL, placement, asset locality, and component count, while browser rendering plus OpenCV verifies the actual rendered QR data.

**Tech Stack:** Slidev 52.18.0, Vue 3.5, CSS, Node.js 22.23.x tests, uv one-off Python tooling with Segno and OpenCV

## Global Constraints

- Encode exactly `https://github.com/sixfeetup/2026_DjangoCon_BatteriesVsSpeed`.
- Keep all QR assets local and the deck fully usable offline.
- Use the same “Slides + code” treatment on the title and thank-you slides.
- Position the card at the bottom-right without overlapping existing slide content.
- Preserve all existing slide content, notes, transitions, clicks, code, and branding.
- Respect `.nvmrc`, Node `22.23.x`, and pnpm `10.34.5`.

---

### Task 1: Generate, Integrate, and Verify the Repository QR Card

**Files:**
- Create: `slides/public/repository-qr.svg`
- Create: `slides/components/RepositoryQr.vue`
- Modify: `slides/styles/index.css`
- Modify: `slides/slides.md`
- Modify: `slides/tests/branding.test.mjs`

**Interfaces:**
- Produces: `<RepositoryQr />`, with no props, local `/repository-qr.svg`, accessible alternate text, and visible label `Slides + code`.
- Produces CSS classes: `.repository-qr`, `.repository-qr__image`, and `.repository-qr__label`.
- Places exactly two component instances, both on slides with `.deck-title.no-deck-footer`.

- [ ] **Step 1: Write failing source-contract tests**

Add tests that require:

```js
const repositoryUrl = 'https://github.com/sixfeetup/2026_DjangoCon_BatteriesVsSpeed'

test('repository QR component is local and accessible', async () => {
  const component = await read('components/RepositoryQr.vue')
  assert.match(component, /src="\/repository-qr\.svg"/)
  assert.match(component, /alt="QR code for the Django vs\. FastAPI repository"/)
  assert.match(component, />Slides \+ code</)
  assert.doesNotMatch(component, /src="https?:\/\//)
})

test('repository QR appears on both title-family slides', async () => {
  const slides = await parseDeck()
  const titleSlides = slidesWithClass(slides, 'deck-title')
  assert.equal(titleSlides.length, 2)
  assert.ok(titleSlides.every(slide => /<RepositoryQr\s*\/>/.test(slide.content)))
  assert.equal(contentClassTokenCount(slides, 'repository-qr'), 0)
})

test('repository QR styles provide a bottom-right scannable card', async () => {
  const css = await read('styles/index.css')
  assert.match(css, /\.repository-qr\s*\{[^}]*position:\s*absolute;[^}]*right:[^;]+;[^}]*bottom:[^;]+;/s)
  assert.match(css, /\.repository-qr__image\s*\{[^}]*width:\s*(?:9\.375|10\.625)rem;[^}]*height:\s*(?:9\.375|10\.625)rem;/s)
})
```

The exact URL is validated by independent decode in Step 7 rather than by trusting generated SVG text.

- [ ] **Step 2: Run tests and verify RED**

Run: `cd slides && pnpm test`

Expected: FAIL with `ENOENT` for `components/RepositoryQr.vue`.

- [ ] **Step 3: Generate the local SVG**

Run from repository root:

```bash
uv run --with segno python -c "import segno; segno.make('https://github.com/sixfeetup/2026_DjangoCon_BatteriesVsSpeed', error='h').save('slides/public/repository-qr.svg', scale=10, border=4, dark='#20202a', light='#ffffff')"
```

The four-module border is the QR quiet zone. Do not hand-edit QR paths.

- [ ] **Step 4: Implement the component**

Create:

```vue
<template>
  <aside class="repository-qr" aria-label="Repository link">
    <img
      class="repository-qr__image"
      src="/repository-qr.svg"
      alt="QR code for the Django vs. FastAPI repository"
    >
    <span class="repository-qr__label">Slides + code</span>
  </aside>
</template>
```

- [ ] **Step 5: Add the two component instances and styles**

Add `<RepositoryQr />` once to the opening slide and once to the thank-you slide. Do not modify any other visible content.

Add a bottom-right absolute card with white background, `var(--deck-line)` border, subtle brand-consistent shadow, 150–170px square image, centered Poppins label, and enough padding to preserve the SVG quiet zone. Keep it inside title-slide padding and clear of `.deck-repo`.

- [ ] **Step 6: Run automated GREEN verification**

Run:

```bash
cd slides
pnpm test
pnpm run build
```

Expected: all tests PASS and build exits 0.

- [ ] **Step 7: Decode both rendered QR codes independently**

With the running Slidev server, use Playwright to save each `.repository-qr__image` from slides 1 and 30 to `/tmp/repository-qr-slide-1.png` and `/tmp/repository-qr-slide-30.png`.

Decode each screenshot:

```bash
uv run --with opencv-python-headless python -c "import cv2; expected='https://github.com/sixfeetup/2026_DjangoCon_BatteriesVsSpeed'; files=['/tmp/repository-qr-slide-1.png','/tmp/repository-qr-slide-30.png']; decoded=[cv2.QRCodeDetector().detectAndDecode(cv2.imread(path))[0] for path in files]; print(decoded); assert decoded == [expected, expected]"
```

Expected: both decoded values exactly equal the canonical HTTPS URL.

- [ ] **Step 8: Inspect title-slide renders**

Capture full screenshots of slides 1 and 30. Confirm both cards are bottom-right, fully visible, visually identical, and do not overlap title, speakers, repository text, or brand lockup.

- [ ] **Step 9: Commit**

```bash
git add slides/public/repository-qr.svg slides/components/RepositoryQr.vue slides/styles/index.css slides/slides.md slides/tests/branding.test.mjs
git commit -m "feat: add repository QR codes to title slides"
```
