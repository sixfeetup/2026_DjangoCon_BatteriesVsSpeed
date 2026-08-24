import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8')
const occurrences = (text, value) => (text.match(new RegExp(value, 'g')) ?? []).length

const semanticSelectors = [
  '.deck-title',
  '.deck-subtitle',
  '.deck-speakers',
  '.deck-repo',
  '.section-divider',
  '.section-number',
  '.section-kicker',
  '.content-slide',
  '.statement-slide',
  '.code-comparison',
  '.brand-rule',
  '.deck-cards',
  '.deck-card',
  '.comparison-grid',
  '.comparison-table',
  '.dark-code-panel',
  '.framework-accent',
  '.framework-label',
  '.diagram-panel',
  '.checklist-grid',
  '.result-placeholder',
  '.recommendation-slide',
  '.no-deck-footer',
]

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
  for (const selector of semanticSelectors)
    assert.ok(css.includes(selector), `missing ${selector}`)
})

test('theme uses bundled local fontsource imports only', async () => {
  const css = await read('styles/index.css')
  assert.match(css, /@fontsource\/poppins\/400\.css/)
  assert.match(css, /@fontsource\/poppins\/800\.css/)
  assert.match(css, /@fontsource\/roboto-mono\/500\.css/)
  assert.match(css, /@fontsource\/roboto-mono\/700\.css/)
  assert.doesNotMatch(css, /fonts\.googleapis|fonts\.gstatic|https?:\/\//)
})

test('framework styling stays neutral and company-agnostic', async () => {
  const css = await read('styles/index.css')
  const frameworkStyles = css.slice(css.indexOf('.framework-accent'), css.indexOf('.diagram-panel'))
  assert.ok(frameworkStyles.includes('.framework-accent'), 'missing framework style block')
  assert.doesNotMatch(frameworkStyles, /sixie|revsys/i)
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

test('deck uses the light semantic shell and local co-brand lockups', async () => {
  const deck = await read('slides.md')
  assert.match(deck, /^---[\s\S]*theme: default/m)
  assert.doesNotMatch(deck, /background:\s*https?:\/\//)
  assert.ok((deck.match(/<BrandLockup/g) ?? []).length >= 2)
  assert.ok((deck.match(/class:.*deck-title/g) ?? []).length >= 2)
  assert.ok((deck.match(/class:.*section-divider/g) ?? []).length >= 3)
})

test('section dividers preserve original visible content and click directives', async () => {
  const deck = await read('slides.md')
  assert.match(deck, /<div class="section-number">01<\/div>[\s\S]*\| Concern \| Django \+ Ninja \| FastAPI \|[\s\S]*\| Validation & OpenAPI \| Ninja \| Built in \|[\s\S]*\| Reusable app ecosystem \| Deep, convention-driven \| Younger, more composable \|[\s\S]*Working comparison for discussion—not a scorecard\./)
  assert.match(deck, /<div class="section-number">02<\/div>[\s\S]*<div v-click class="mt-14 text-5xl font-bold">\s*Do you actually need it\?\s*<\/div>/)
  assert.match(deck, /<div class="section-number">03<\/div>[\s\S]*<div class="mt-10 text-3xl opacity-80">\s*Including ours\.\s*<\/div>[\s\S]*<div v-click class="mt-12 text-xl">\s*A benchmark measures a workload, an implementation, and an environment\.\s*<br>It does not measure your application\.\s*<\/div>/)
})

test('comparison half uses semantic slide families', async () => {
  const deck = await read('slides.md')
  assert.ok(occurrences(deck, 'content-slide') >= 6)
  assert.ok(occurrences(deck, 'code-comparison') >= 2)
  assert.ok(occurrences(deck, 'deck-card') >= 6)
})

test('thank-you slide uses the title subtitle hierarchy', async () => {
  const deck = await read('slides.md')
  assert.match(deck, /# Thank you\s+<div class="deck-subtitle">Questions, code, methodology, raw results, and references<\/div>/)
})

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
