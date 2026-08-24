import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { parseSync } from '@slidev/parser'

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8')
const readBytes = path => readFile(new URL(`../${path}`, import.meta.url))
const parseDeck = async () => parseSync(await read('slides.md'), 'slides.md').slides
const classTokens = slide => new Set(String(slide.frontmatter.class ?? '').split(/\s+/).filter(Boolean))
const slidesWithClass = (slides, token) => slides.filter(slide => classTokens(slide).has(token))
const contentClassTokenCount = (slides, token) => slides.reduce((total, slide) => {
  const matches = [...slide.content.matchAll(/\bclass=(['"])(.*?)\1/g)]
  return total + matches.reduce((count, match) => (
    count + match[2].split(/\s+/).filter(className => className === token).length
  ), 0)
}, 0)

const repositoryUrl = 'https://github.com/sixfeetup/2026_DjangoCon_BatteriesVsSpeed'

const semanticSelectors = [
  '.deck-title',
  '.title-vs',
  '.deck-subtitle',
  '.deck-speakers',
  '.deck-repo',
  '.section-divider',
  '.section-number',
  '.section-kicker',
  '.content-slide',
  '.statement-slide',
  '.code-slide',
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

test('brand assets are standalone local image files', async () => {
  const revsys = await read('public/brands/revsys.svg')
  assert.match(revsys, /<svg[^>]+xmlns="http:\/\/www\.w3\.org\/2000\/svg"/)
  const withoutNamespaceDeclarations = revsys.replaceAll(/xmlns(?::\w+)?="https?:\/\/[^\"]+"/g, '')
  assert.doesNotMatch(withoutNamespaceDeclarations, /https?:\/\//)

  const sixFeetUp = await readBytes('public/brands/sixfeetup-transparent_black_notagline.png')
  assert.deepEqual([...sixFeetUp.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10])
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

test('theme pins inline code contrast independently of browser color scheme', async () => {
  const css = await read('styles/index.css')
  assert.match(
    css,
    /\.slidev-layout\s+:not\(pre\)\s*>\s*code\s*\{[^}]*color:\s*var\(--revsys-navy\);[^}]*background:\s*#e9e8f0;/s,
  )
})

test('only the title vs. receives a dedicated purple treatment', async () => {
  const css = await read('styles/index.css')
  const slides = await parseDeck()
  const title = slides[0]
  const frameworkStyles = css.slice(css.indexOf('.framework-accent'), css.indexOf('.diagram-panel'))

  assert.equal(title.frontmatter.transition, 'slide-left')
  assert.match(title.content, /Django <span class="title-vs">vs\.<\/span> FastAPI/)
  assert.match(title.content, /A pragmatic conversation about framework trade-offs/)
  assert.equal(contentClassTokenCount(slides, 'title-vs'), 1)
  assert.match(css, /\.title-vs\s*\{[^}]*color:\s*var\(--sixie-purple\)/s)
  assert.ok(frameworkStyles.includes('.framework-accent'), 'missing framework style block')
  assert.doesNotMatch(frameworkStyles, /sixie|revsys/i)
  assert.doesNotMatch(slides.map(slide => slide.content).join('\n'), /--framework-accent:\s*var\(--(?:sixie|revsys)/i)
})

test('content-family headings use the shared purple-to-blue rule', async () => {
  const css = await read('styles/index.css')
  assert.match(css, /\.content-slide:not\(\.statement-slide\)\s*>\s*h1::after/)
  assert.match(css, /\.recommendation-slide\s*>\s*h1::after/)
  assert.match(css, /h1::after[\s\S]*background:\s*linear-gradient\([^;]*var\(--sixie-purple\)[^;]*var\(--revsys-blue\)/)
  assert.doesNotMatch(css, /\.deck-title[^,{]*h1::after|\.section-divider[^,{]*h1::after/)
})

test('cards cycle single-color purple, indigo, and blue accents', async () => {
  const css = await read('styles/index.css')
  assert.match(css, /\.deck-card\s*\{[^}]*--deck-card-accent:\s*var\(--sixie-purple\)/s)
  assert.match(css, /\.deck-card::before\s*\{[^}]*background:\s*var\(--deck-card-accent\)/s)
  assert.match(css, /\.deck-card:nth-child\(3n\s*\+\s*2\s+of\s+\.deck-card\)\s*\{[^}]*--deck-card-accent:\s*var\(--sixie-indigo\)/s)
  assert.match(css, /\.deck-card:nth-child\(3n\s+of\s+\.deck-card\)\s*\{[^}]*--deck-card-accent:\s*var\(--revsys-blue\)/s)
})

test('repository QR component is local and accessible', async () => {
  const component = await read('components/RepositoryQr.vue')
  assert.match(component, /src="\/repository-qr\.svg"/)
  assert.match(component, /alt="QR code for the Django vs\. FastAPI repository"/)
  assert.match(component, />Slides \+ code</)
  assert.doesNotMatch(component, /src="https?:\/\//)
})

test('repository QR appears exactly twice on title slides without deck footers', async () => {
  const slides = await parseDeck()
  const qrSlides = slides.filter(slide => /<RepositoryQr\s*\/>/.test(slide.content))
  const qrInstanceCount = slides.reduce(
    (total, slide) => total + (slide.content.match(/<RepositoryQr\s*\/>/g) ?? []).length,
    0,
  )

  assert.equal(qrInstanceCount, 2)
  assert.equal(qrSlides.length, 2)
  assert.ok(qrSlides.every(slide => classTokens(slide).has('deck-title')))
  assert.ok(qrSlides.every(slide => classTokens(slide).has('no-deck-footer')))
  assert.ok(qrSlides.every(slide => slide.content.includes(repositoryUrl.replace('https://', ''))))
  assert.deepEqual(qrSlides, slidesWithClass(slides, 'deck-title'))
  assert.equal(contentClassTokenCount(slides, 'repository-qr'), 0)
})

test('repository QR styles provide a padded bottom-right scannable card', async () => {
  const css = await read('styles/index.css')
  const cardRule = css.match(/\.repository-qr\s*\{([^}]*)\}/s)
  assert.ok(cardRule, 'missing repository QR card rule')
  assert.match(cardRule[1], /position:\s*absolute;/)
  assert.match(cardRule[1], /right:[^;]+;/)
  const bottom = cardRule[1].match(/bottom:\s*([\d.]+)rem;/)
  assert.ok(bottom, 'repository QR bottom offset must use rem')
  assert.ok(Number(bottom[1]) >= 2.9, 'repository QR must stay within the 2.9rem title padding')
  assert.match(css, /\.repository-qr__image\s*\{[^}]*width:\s*(?:9\.375|10\.625)rem;[^}]*height:\s*(?:9\.375|10\.625)rem;/s)
  assert.match(css, /\.deck-title \.deck-subtitle\s*\{[^}]*width:\s*fit-content;/s)
  assert.match(css, /\.deck-title h2 \+ \.deck-subtitle\s*\{[^}]*max-width:[^;]+;/s)
})

test('brand components use local assets and accessible names', async () => {
  const lockup = await read('components/BrandLockup.vue')
  assert.match(lockup, /src="\/brands\/sixfeetup-transparent_black_notagline\.png"/)
  assert.doesNotMatch(lockup, /six-feet-up\.svg/)
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

test('comparison half uses frontmatter families and class-token card checks', async () => {
  const slides = await parseDeck()
  assert.ok(slidesWithClass(slides, 'content-slide').length >= 6)
  assert.equal(slidesWithClass(slides, 'code-slide').length, 2)
  assert.equal(contentClassTokenCount(slidesWithClass(slides, 'code-slide'), 'code-comparison'), 2)
  assert.ok(contentClassTokenCount(slides, 'deck-card') >= 6)
})

test('thank-you slide uses the title subtitle hierarchy', async () => {
  const deck = await read('slides.md')
  assert.match(deck, /# Thank you\s+<div class="deck-subtitle">Questions, code, methodology, raw results, and references<\/div>/)
})

test('every slide has a semantic frontmatter family and exact eligible footer', async () => {
  const slides = await parseDeck()
  const semanticFamilies = new Set([
    'deck-title',
    'section-divider',
    'content-slide',
    'statement-slide',
    'code-slide',
    'recommendation-slide',
  ])

  assert.equal(slides.length, 30)
  assert.ok(slides.every(slide => [...classTokens(slide)].some(token => semanticFamilies.has(token))))
  assert.equal(contentClassTokenCount(slides, 'result-placeholder'), 2)
  assert.equal(slidesWithClass(slides, 'recommendation-slide').length, 2)

  for (const slide of slides) {
    const footerCount = (slide.content.match(/<DeckFooter\s*\/>/g) ?? []).length
    const eligible = !classTokens(slide).has('no-deck-footer')
    assert.equal(footerCount, eligible ? 1 : 0, `slide ${slide.index + 1} footer count`)
  }
})

test('branding remains framework-neutral and runtime assets stay local', async () => {
  const deck = await read('slides.md')
  assert.doesNotMatch(deck, /<h1\b/i)
  assert.doesNotMatch(deck, /sixie-(purple|indigo)[^\n]*(FastAPI|Django)/i)
  assert.doesNotMatch(deck, /revsys-(blue|navy)[^\n]*(FastAPI|Django)/i)
  assert.doesNotMatch(deck, /background:\s*https?:\/\//)
})

test('unused Seriph theme is absent from manifests', async () => {
  const packageJson = await read('package.json')
  const lockfile = await read('pnpm-lock.yaml')
  assert.doesNotMatch(packageJson, /@slidev\/theme-seriph/)
  assert.doesNotMatch(lockfile, /@slidev\/theme-seriph/)
})
