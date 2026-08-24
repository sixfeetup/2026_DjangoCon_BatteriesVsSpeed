import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

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
