import {mkdir, writeFile} from 'node:fs/promises'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

import {loadRun} from './report-data.mjs'

const scriptPath = fileURLToPath(import.meta.url)
const profileOrder = ['baseline', 'staircase', 'sustained', 'overload']
const profileLabels = {
  baseline: 'Baseline',
  staircase: 'Staircase',
  sustained: 'Sustained',
  overload: 'Overload'
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function sortRuns(runs) {
  const seen = new Set()
  for (const run of runs) {
    if (!profileOrder.includes(run.profile)) throw new Error(`Unknown profile: ${run.profile}`)
    if (seen.has(run.profile)) throw new Error(`Duplicate profile: ${run.profile}`)
    seen.add(run.profile)
  }
  const missing = profileOrder.filter((profile) => !seen.has(profile))
  if (missing.length > 0) throw new Error(`Missing required profiles: ${missing.join(', ')}`)
  return [...runs].sort((left, right) => profileOrder.indexOf(left.profile) - profileOrder.indexOf(right.profile))
}

function formatValue(value, {suffix = '', digits = 2, percent = false} = {}) {
  if (value === null || value === undefined) return 'Not available'
  if (percent) return `${(value * 100).toFixed(digits)}%`
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (Number.isInteger(value)) return `${value}${suffix}`
    return `${value.toFixed(digits)}${suffix}`
  }
  return `${value}${suffix}`
}

function formatObjectValue(value) {
  if (value === null || value === undefined) return 'Not available'
  if (Array.isArray(value) || (value && typeof value === 'object')) return JSON.stringify(value)
  return String(value)
}

function renderMetric(label, value, options) {
  return `<div class="metric"><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(formatValue(value, options))}</dd></div>`
}

function renderTable(headers, rows) {
  return [
    '<div class="table-wrap">',
    '<table>',
    '<thead><tr>',
    ...headers.map((header) => `<th scope="col">${escapeHtml(header)}</th>`),
    '</tr></thead>',
    '<tbody>',
    ...rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`),
    '</tbody></table></div>'
  ].join('')
}

function renderObjectSection(title, runs, selector) {
  const objects = runs.map((run) => selector(run) || {})
  const keys = [...new Set(objects.flatMap((value) => Object.keys(value)))].sort()
  const rows = keys.map((key) => [key, ...objects.map((value) => formatObjectValue(value[key]))])
  return `
    <section>
      <h2>${escapeHtml(title)}</h2>
      ${renderTable(['Field', ...runs.map((run) => profileLabels[run.profile])], rows)}
    </section>
  `
}

function renderEnvironmentSection(runs, generatedAt) {
  const rows = [
    ['Generated at', generatedAt, generatedAt, generatedAt, generatedAt],
    ['Implementation', ...runs.map((run) => run.implementation)],
    ['Artifact directory', ...runs.map((run) => run.artifactDirectory)],
    ['Started at', ...runs.map((run) => run.startedAt)],
    ['Completed at', ...runs.map((run) => run.completedAt)],
    ['Status', ...runs.map((run) => run.status)]
  ]
  return `
    <section>
      <h2>Shared environment</h2>
      ${renderTable(['Field', ...runs.map((run) => profileLabels[run.profile])], rows)}
    </section>
  `
}

function renderLatencyChart(runs) {
  const chartWidth = 680
  const left = 184
  const right = 120
  const barMax = chartWidth - left - right
  const rowHeight = 44
  const height = rowHeight * runs.length + 48
  const maxP99 = Math.max(0, ...runs.map((run) => run.metrics.p99 ?? 0)) || 1
  const rows = runs.map((run, index) => {
    const y = 32 + index * rowHeight
    const label = `${profileLabels[run.profile]} (${run.runId})`
    const width = run.metrics.p99 === null ? 0 : Math.round((run.metrics.p99 / maxP99) * barMax)
    const textX = left + Math.max(width + 12, 12)
    return `
      <g transform="translate(0 ${y})">
        <text x="8" y="18" class="svg-label">${escapeHtml(label)}</text>
        <rect x="${left}" y="2" width="${barMax}" height="18" rx="9" ry="9" class="svg-track"></rect>
        <rect x="${left}" y="2" width="${width}" height="18" rx="9" ry="9" class="svg-bar svg-bar-${escapeHtml(run.profile)}"></rect>
        <text x="${textX}" y="18" class="svg-value">${escapeHtml(formatValue(run.metrics.p99, {suffix: ' ms'}))}</text>
      </g>
    `
  }).join('')

  return `
    <section>
      <h2>Latency comparison</h2>
      <p>P99 latency bars are scaled against the largest available p99 across the four required profiles.</p>
      <svg viewBox="0 0 ${chartWidth} ${height}" role="img" aria-labelledby="latency-title latency-desc">
        <title id="latency-title">P99 latency comparison across benchmark profiles</title>
        <desc id="latency-desc">Horizontal bars compare p99 latency for the baseline, staircase, sustained, and overload profiles.</desc>
        ${rows}
      </svg>
    </section>
  `
}

function formatLoad(run) {
  return run.phases
    .map((phase) => {
      const name = phase.name ? `${phase.name}: ` : ''
      return `${name}${phase.duration}s @ ${phase.arrivalRate} rps`
    })
    .join('; ')
}

function renderPhaseTable(run) {
  const rows = run.phases.map((phase, index) => [
    `${index + 1}`,
    phase.name || 'Not available',
    formatValue(phase.duration, {suffix: ' s'}),
    formatValue(phase.arrivalRate, {suffix: ' req/s'})
  ])
  return renderTable(['Phase', 'Name', 'Duration', 'Arrival rate'], rows)
}

function renderRunCard(run) {
  return `
    <article class="card" data-profile="${escapeHtml(run.profile)}">
      <div class="card-header">
        <div>
          <p class="eyebrow">${escapeHtml(profileLabels[run.profile])}</p>
          <h3>${escapeHtml(run.runId)}</h3>
        </div>
        <p class="artifact-path">${escapeHtml(run.artifactDirectory)}</p>
      </div>
      <p>${escapeHtml(formatLoad(run))}</p>
      <dl class="metrics-grid">
        ${renderMetric('Requests', run.metrics.requests)}
        ${renderMetric('Request rate', run.metrics.requestRate, {suffix: ' req/s'})}
        ${renderMetric('Failed users', run.metrics.failedVusers)}
        ${renderMetric('Error count', run.metrics.httpErrors)}
        ${renderMetric('Error rate', run.metrics.errorRate, {percent: true})}
        ${renderMetric('P50 latency', run.metrics.p50, {suffix: ' ms'})}
        ${renderMetric('P95 latency', run.metrics.p95, {suffix: ' ms'})}
        ${renderMetric('P99 latency', run.metrics.p99, {suffix: ' ms'})}
        ${renderMetric('Max latency', run.metrics.max, {suffix: ' ms'})}
      </dl>
      <h4>Configured phases</h4>
      ${renderPhaseTable(run)}
    </article>
  `
}

export function renderReport(runs, generatedAt) {
  const sortedRuns = sortRuns(runs)
  const summaryRows = sortedRuns.map((run) => [
    profileLabels[run.profile],
    formatLoad(run),
    formatValue(run.metrics.requests),
    formatValue(run.metrics.requestRate, {suffix: ' req/s'}),
    formatValue(run.metrics.errorRate, {percent: true}),
    formatValue(run.metrics.p99, {suffix: ' ms'})
  ])

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>FastAPI Zellit benchmark report</title>
    <style>
      :root {
        color-scheme: light;
        --bg: #f5f7fb;
        --surface: #ffffff;
        --text: #142033;
        --muted: #5b677a;
        --border: #d8dfeb;
        --accent: #2f6feb;
        --baseline: #2f6feb;
        --staircase: #8e44ad;
        --sustained: #1b9c5a;
        --overload: #d35400;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font: 16px/1.5 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        color: var(--text);
        background: var(--bg);
      }
      main {
        max-width: 1200px;
        margin: 0 auto;
        padding: 32px 20px 48px;
      }
      h1, h2, h3, h4, p { margin-top: 0; }
      section, article {
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: 16px;
        padding: 20px;
        margin-bottom: 20px;
        box-shadow: 0 10px 30px rgba(20, 32, 51, 0.06);
      }
      .lede, .caveats li, .artifact-path, .eyebrow { color: var(--muted); }
      .eyebrow {
        text-transform: uppercase;
        letter-spacing: 0.08em;
        font-size: 0.8rem;
        margin-bottom: 6px;
      }
      .table-wrap { overflow-x: auto; }
      table {
        width: 100%;
        border-collapse: collapse;
        min-width: 640px;
      }
      th, td {
        border-top: 1px solid var(--border);
        padding: 10px 12px;
        vertical-align: top;
        text-align: left;
      }
      th {
        color: var(--muted);
        font-weight: 600;
        border-top: none;
      }
      .cards {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
        gap: 20px;
        background: transparent;
        border: none;
        box-shadow: none;
        padding: 0;
      }
      .card { margin: 0; }
      .card-header {
        display: flex;
        gap: 16px;
        justify-content: space-between;
        align-items: flex-start;
      }
      .artifact-path {
        margin: 0;
        font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        word-break: break-word;
      }
      .metrics-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
        gap: 12px;
        margin: 16px 0 20px;
      }
      .metric {
        margin: 0;
        padding: 12px;
        border: 1px solid var(--border);
        border-radius: 12px;
        background: #fbfcff;
      }
      .metric dt {
        color: var(--muted);
        font-size: 0.85rem;
        margin-bottom: 4px;
      }
      .metric dd {
        margin: 0;
        font-size: 1.1rem;
        font-weight: 700;
      }
      .caveats { padding-left: 20px; }
      svg {
        width: 100%;
        height: auto;
        display: block;
      }
      .svg-track { fill: #e8edf7; }
      .svg-label, .svg-value {
        font: 14px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        fill: var(--text);
      }
      .svg-bar-baseline { fill: var(--baseline); }
      .svg-bar-staircase { fill: var(--staircase); }
      .svg-bar-sustained { fill: var(--sustained); }
      .svg-bar-overload { fill: var(--overload); }
      @media (max-width: 720px) {
        main { padding: 20px 14px 32px; }
        section, article { padding: 16px; }
        .card-header { flex-direction: column; }
      }
    </style>
  </head>
  <body>
    <main>
      <section>
        <p class="eyebrow">Standalone benchmark report</p>
        <h1>FastAPI Zellit benchmark observations</h1>
        <p class="lede">Generated at ${escapeHtml(generatedAt)} from four successful benchmark profiles. This executive summary reports the recorded values without declaring a winner.</p>
        <p class="lede">Each row below is a workload-specific benchmark observation rather than a normalized head-to-head ranking.</p>
        ${renderTable(['Profile', 'Load profile', 'Requests', 'Request rate', 'Error rate', 'P99 latency'], summaryRows)}
      </section>
      ${renderLatencyChart(sortedRuns)}
      ${renderEnvironmentSection(sortedRuns, generatedAt)}
      ${renderObjectSection('Versions', sortedRuns, (run) => run.versions)}
      ${renderObjectSection('Runtime', sortedRuns, (run) => run.runtime)}
      ${renderObjectSection('Dataset', sortedRuns, (run) => run.dataset)}
      ${renderObjectSection('Request corpus', sortedRuns, (run) => run.requestCorpus)}
      ${renderObjectSection('Git', sortedRuns, (run) => ({runId: run.runId, gitRevision: run.gitRevision}))}
      <section class="cards">
        ${sortedRuns.map((run) => renderRunCard(run)).join('')}
      </section>
      <section>
        <h2>Caveats</h2>
        <ul class="caveats">
          <li>This report reflects a single trial per required profile.</li>
          <li>Each profile is a workload-specific benchmark observation with intentionally different loads and durations.</li>
          <li>The overload profile is meant to push the service beyond the lighter baseline, staircase, and sustained loads.</li>
          <li>This is not a FastAPI-versus-Django comparison.</li>
          <li>This report does not support production-capacity inference.</li>
        </ul>
      </section>
    </main>
  </body>
</html>
`
}

export async function generateReport(outputPath, runDirectories) {
  if (!outputPath) throw new Error('outputPath is required')
  if (!Array.isArray(runDirectories) || runDirectories.length === 0) throw new Error('At least one run directory is required')
  const runs = await Promise.all(runDirectories.map((runDirectory) => loadRun(runDirectory)))
  const html = renderReport(runs, new Date().toISOString())
  const resolvedOutputPath = path.resolve(outputPath)
  await mkdir(path.dirname(resolvedOutputPath), {recursive: true})
  await writeFile(resolvedOutputPath, html, 'utf8')
  return html
}

async function main([outputPath, ...runDirectories]) {
  if (!outputPath || runDirectories.length === 0) {
    throw new Error('Usage: node scripts/generate-report.mjs <output.html> <run-directory>...')
  }
  await generateReport(outputPath, runDirectories)
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
}
