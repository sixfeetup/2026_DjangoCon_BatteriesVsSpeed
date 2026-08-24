import {mkdir, readFile, writeFile} from 'node:fs/promises'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(scriptDir, '../..')
const outputDir = path.join(repoRoot, 'slides/public/images')

const zipRoot = path.join(repoRoot, 'research/demo/shared/zip/benchmark/results')
const zellitRoot = path.join(repoRoot, 'research/demo/shared/zellit/benchmark/results')

const sources = {
  zip: {
    fastapi: 'fastapi-zip-20260823T194420Z-sustained-1',
    django: 'django-zip-gevent-1-20260823T194420Z-sustained-3'
  },
  zellit: {
    fastapi: [
      'fastapi-zellit-fair-r1-20260824T182812Z-300rps',
      'fastapi-zellit-fair-r2-20260824T182812Z-300rps'
    ],
    django: [
      'django-zellit-gevent-1-fair-r1-20260824T182812Z-300rps',
      'django-zellit-gevent-1-fair-r2-20260824T182812Z-300rps'
    ]
  }
}

async function metrics(root, runId) {
  const raw = JSON.parse(await readFile(path.join(root, runId, 'raw.json'), 'utf8'))
  const metadata = JSON.parse(await readFile(path.join(root, runId, 'metadata.json'), 'utf8'))
  const summary = raw.aggregate.summaries['http.response_time']
  const counters = raw.aggregate.counters
  return {
    runId,
    metadata,
    requests: counters['http.requests'],
    successes: counters['http.codes.200'],
    failures: counters['vusers.failed'],
    mean: summary.mean,
    p50: summary.p50,
    p95: summary.p95,
    p99: summary.p99,
    max: summary.max
  }
}

function average(runs) {
  const keys = ['mean', 'p50', 'p95', 'p99', 'max']
  return Object.fromEntries(keys.map((key) => [
    key,
    runs.reduce((sum, run) => sum + run[key], 0) / runs.length
  ]))
}

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function formatMs(value) {
  return (Math.round((value + Number.EPSILON) * 10) / 10).toFixed(1)
}

function chart({title, eyebrow, subtitle, fastapi, django, footer, callout}) {
  const width = 1600
  const height = 900
  const plot = {left: 180, right: 1490, top: 270, bottom: 700}
  const metricsToShow = [
    {key: 'mean', label: 'MEAN'},
    {key: 'p50', label: 'P50'},
    {key: 'p95', label: 'P95'},
    {key: 'p99', label: 'P99'}
  ]
  const maxValue = Math.max(...metricsToShow.flatMap(({key}) => [fastapi[key], django[key]]))
  const axisMax = Math.ceil(maxValue * 1.18) || 5
  const y = (value) => plot.bottom - (value / axisMax) * (plot.bottom - plot.top)
  const groupWidth = (plot.right - plot.left) / metricsToShow.length
  const barWidth = 105
  const parts = []

  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title desc">`)
  parts.push(`<title id="title">${escapeXml(title)}</title>`)
  parts.push(`<desc id="desc">${escapeXml(subtitle)} Lower latency is better.</desc>`)
  parts.push(`<rect width="1600" height="900" rx="32" fill="#F8FAFC"/>`)
  parts.push(`<text x="100" y="78" font-family="Inter, ui-sans-serif, system-ui, sans-serif" font-size="30" font-weight="800" letter-spacing="4" fill="#475569">${escapeXml(eyebrow)}</text>`)
  parts.push(`<text x="100" y="158" font-family="Inter, ui-sans-serif, system-ui, sans-serif" font-size="62" font-weight="850" fill="#0F172A">${escapeXml(title)}</text>`)
  parts.push(`<text x="100" y="210" font-family="Inter, ui-sans-serif, system-ui, sans-serif" font-size="29" font-weight="500" fill="#475569">${escapeXml(subtitle)}</text>`)

  // Legend
  parts.push(`<rect x="1090" y="63" width="34" height="34" rx="8" fill="#2563EB"/>`)
  parts.push(`<text x="1140" y="90" font-family="Inter, ui-sans-serif, system-ui, sans-serif" font-size="29" font-weight="750" fill="#0F172A">FastAPI</text>`)
  parts.push(`<rect x="1320" y="63" width="34" height="34" rx="8" fill="#0C8A5F"/>`)
  parts.push(`<text x="1370" y="90" font-family="Inter, ui-sans-serif, system-ui, sans-serif" font-size="29" font-weight="750" fill="#0F172A">Django</text>`)

  // Grid and axis
  for (let i = 0; i <= 4; i += 1) {
    const value = axisMax * i / 4
    const py = y(value)
    parts.push(`<line x1="${plot.left}" y1="${py}" x2="${plot.right}" y2="${py}" stroke="${i === 0 ? '#94A3B8' : '#CBD5E1'}" stroke-width="${i === 0 ? 3 : 2}"/>`)
    parts.push(`<text x="${plot.left - 28}" y="${py + 11}" text-anchor="end" font-family="Inter, ui-sans-serif, system-ui, sans-serif" font-size="27" font-weight="650" fill="#475569">${value.toFixed(value % 1 ? 1 : 0)}</text>`)
  }
  parts.push(`<text x="48" y="485" transform="rotate(-90 48 485)" text-anchor="middle" font-family="Inter, ui-sans-serif, system-ui, sans-serif" font-size="28" font-weight="750" fill="#475569">LATENCY (ms) · LOWER IS BETTER</text>`)

  for (const [index, metric] of metricsToShow.entries()) {
    const center = plot.left + groupWidth * (index + 0.5)
    const bars = [
      {x: center - barWidth - 12, value: fastapi[metric.key], color: '#2563EB'},
      {x: center + 12, value: django[metric.key], color: '#0C8A5F'}
    ]
    for (const bar of bars) {
      const top = y(bar.value)
      const barHeight = Math.max(4, plot.bottom - top)
      parts.push(`<rect x="${bar.x}" y="${top}" width="${barWidth}" height="${barHeight}" rx="14" fill="${bar.color}"/>`)
      parts.push(`<text x="${bar.x + barWidth / 2}" y="${top - 18}" text-anchor="middle" font-family="Inter, ui-sans-serif, system-ui, sans-serif" font-size="32" font-weight="850" fill="#0F172A">${formatMs(bar.value)}</text>`)
    }
    parts.push(`<text x="${center}" y="755" text-anchor="middle" font-family="Inter, ui-sans-serif, system-ui, sans-serif" font-size="31" font-weight="850" fill="#334155">${metric.label}</text>`)
  }

  parts.push(`<rect x="100" y="790" width="1400" height="70" rx="18" fill="#E2E8F0"/>`)
  parts.push(`<text x="130" y="834" font-family="Inter, ui-sans-serif, system-ui, sans-serif" font-size="25" font-weight="650" fill="#334155">${escapeXml(footer)}</text>`)
  parts.push(`<text x="1470" y="834" text-anchor="end" font-family="Inter, ui-sans-serif, system-ui, sans-serif" font-size="27" font-weight="850" fill="#0F172A">${escapeXml(callout)}</text>`)
  parts.push('</svg>')
  return parts.join('\n')
}

const zipFastapi = await metrics(zipRoot, sources.zip.fastapi)
const zipDjango = await metrics(zipRoot, sources.zip.django)
const zellitFastapiRuns = await Promise.all(sources.zellit.fastapi.map((id) => metrics(zellitRoot, id)))
const zellitDjangoRuns = await Promise.all(sources.zellit.django.map((id) => metrics(zellitRoot, id)))
const zellitFastapi = average(zellitFastapiRuns)
const zellitDjango = average(zellitDjangoRuns)

for (const run of [zipFastapi, zipDjango, ...zellitFastapiRuns, ...zellitDjangoRuns]) {
  if (run.failures !== 0 || run.requests !== run.successes) {
    throw new Error(`Refusing to chart unsuccessful run: ${run.runId}`)
  }
}

await mkdir(outputDir, {recursive: true})
await writeFile(path.join(outputDir, 'benchmark-zip.svg'), chart({
  eyebrow: 'SCENARIO A · REDIS-BACKED ZIP LOOKUP',
  title: 'ZIP lookup: FastAPI has lower latency',
  subtitle: 'Best 5-minute runs · 200 req/s · 60,000 responses each · zero failures',
  fastapi: zipFastapi,
  django: zipDjango,
  footer: '1 worker each  ·  Redis 8.2.2  ·  same queries and responses',
  callout: `${(zipDjango.p99 / zipFastapi.p99).toFixed(1)}× lower p99`
}))
await writeFile(path.join(outputDir, 'benchmark-zellit.svg'), chart({
  eyebrow: 'SCENARIO B · POSTGRESQL ZELLIT LISTINGS',
  title: 'Zellit: FastAPI leads after warm-up',
  subtitle: '2-trial average · 300 req/s · 18,000 responses/trial · zero failures',
  fastapi: zellitFastapi,
  django: zellitDjango,
  footer: '4 replicas each  ·  20 DB connections/replica  ·  30s warm-up  ·  identical JSON values',
  callout: `${(zellitDjango.mean / zellitFastapi.mean).toFixed(1)}× lower mean`
}))

const manifest = {
  units: 'milliseconds',
  lower_is_better: true,
  zip: {selection: 'best successful sustained run per framework', sources: sources.zip, fastapi: zipFastapi, django: zipDjango},
  zellit: {selection: 'arithmetic mean of two warmed ABBA trials per framework', sources: sources.zellit, fastapi_runs: zellitFastapiRuns, django_runs: zellitDjangoRuns, fastapi: zellitFastapi, django: zellitDjango}
}
await writeFile(path.join(outputDir, 'benchmark-chart-data.json'), `${JSON.stringify(manifest, null, 2)}\n`)
console.log(`Wrote benchmark charts to ${path.relative(repoRoot, outputDir)}`)
