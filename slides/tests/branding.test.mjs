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
