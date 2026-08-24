import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptPath = fileURLToPath(import.meta.url)
const scriptDir = path.dirname(scriptPath)
const benchmarkDir = path.resolve(scriptDir, '..')
const profilesPath = path.join(benchmarkDir, 'profiles.json')
const processorPath = path.join(benchmarkDir, 'processor.cjs')
const defaultPayloadPath = path.resolve(benchmarkDir, '../data/benchmark_prefixes.csv')
const overridableProfiles = ['smoke', 'baseline', 'sustained', 'overload']

function parsePositiveInteger(name, value) {
  if (!/^[0-9]+$/.test(String(value))) {
    throw new Error(`${name} must be a positive integer`)
  }

  const parsed = Number.parseInt(String(value), 10)
  if (parsed <= 0) {
    throw new Error(`${name} must be a positive integer`)
  }

  return parsed
}

function ensureHttpTarget(target) {
  let parsed
  try {
    parsed = new URL(target)
  } catch {
    throw new Error('Target must be a valid HTTP(S) target')
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Target must be a valid HTTP(S) target')
  }
}

function applySimpleOverrides(profile, phases, env) {
  if (!overridableProfiles.includes(profile)) {
    return phases
  }

  const prefix = profile.toUpperCase()
  const rate = env[`${prefix}_RATE`]
  const duration = env[`${prefix}_DURATION`]
  const hasRate = rate != null && rate !== ''
  const hasDuration = duration != null && duration !== ''
  if (!hasRate && !hasDuration) {
    return phases
  }

  const [phase] = phases
  return [{
    ...phase,
    ...(hasDuration ? {duration: parsePositiveInteger(`${prefix}_DURATION`, duration)} : {}),
    ...(hasRate ? {arrivalRate: parsePositiveInteger(`${prefix}_RATE`, rate)} : {})
  }]
}

function applyStaircaseOverrides(phases, env) {
  const result = phases.map((phase) => ({...phase}))

  if (env.STAIRCASE_DURATION != null && env.STAIRCASE_DURATION !== '') {
    const duration = parsePositiveInteger('STAIRCASE_DURATION', env.STAIRCASE_DURATION)
    for (const phase of result) phase.duration = duration
  }

  if (env.STAIRCASE_RATES == null || env.STAIRCASE_RATES === '') {
    return result
  }

  const measuredRates = env.STAIRCASE_RATES.split(',').map((value) => parsePositiveInteger('STAIRCASE_RATES', value.trim()))
  if (measuredRates.length !== result.length) {
    throw new Error(`STAIRCASE_RATES must provide exactly ${result.length} comma-separated rates`)
  }

  measuredRates.forEach((rate, index) => { result[index].arrivalRate = rate })
  return result
}

export async function buildConfig(profile, target, env = process.env) {
  ensureHttpTarget(target)

  const profiles = JSON.parse(await readFile(profilesPath, 'utf8'))
  const committedPhases = profiles[profile]
  if (!committedPhases) {
    throw new Error(`Unknown profile: ${profile}`)
  }

  let phases = committedPhases.map((phase) => ({...phase}))
  phases = applySimpleOverrides(profile, phases, env)
  if (profile === 'staircase') {
    phases = applyStaircaseOverrides(phases, env)
  }

  return {
    config: {
      target,
      phases,
      processor: processorPath,
      payload: {
        path: env.PREFIX_CORPUS_PATH || defaultPayloadPath,
        fields: ['q'],
        skipHeader: true,
        order: 'sequence'
      },
      plugins: {
        expect: {}
      }
    },
    scenarios: [
      {
        name: `${profile} zip lookup`,
        flow: [
          {
            get: {
              url: '/zip-codes?q={{ q }}',
              expect: [
                {statusCode: 200}
              ],
              afterResponse: 'assertZipResponse'
            }
          }
        ]
      }
    ]
  }
}

async function main(argv) {
  const [profile, target, outputPath] = argv
  if (!profile || !target || !outputPath) {
    throw new Error('Usage: node scripts/render-config.mjs <profile> <target> <output-path>')
  }

  const config = await buildConfig(profile, target, process.env)
  await mkdir(path.dirname(outputPath), {recursive: true})
  await writeFile(outputPath, `${JSON.stringify(config, null, 2)}\n`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
}
