import {mkdir, readFile, writeFile} from 'node:fs/promises'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

const scriptPath = fileURLToPath(import.meta.url)
const benchmarkDir = path.resolve(path.dirname(scriptPath), '..')
const profilesPath = path.join(benchmarkDir, 'profiles.json')
const processorPath = path.join(benchmarkDir, 'processor.cjs')
const defaultCorpusPath = path.resolve(benchmarkDir, '../data/benchmark_requests.csv')
const simpleProfiles = new Set(['smoke', 'baseline', 'sustained', 'overload'])

export function positiveInteger(name, value, maximum = 1_000_000) {
  if (!/^[0-9]+$/.test(String(value))) throw new Error(`${name} must be a positive integer`)
  const parsed = Number.parseInt(String(value), 10)
  if (parsed < 1 || parsed > maximum) throw new Error(`${name} must be between 1 and ${maximum}`)
  return parsed
}

function validateTarget(target) {
  let parsed
  try { parsed = new URL(target) } catch { throw new Error('Target must be a valid HTTP(S) URL') }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw new Error('Target must be an HTTP(S) origin without a path, query, or fragment')
  }
}

function simpleOverrides(profile, phases, env) {
  if (!simpleProfiles.has(profile)) return phases
  const prefix = profile.toUpperCase()
  const rate = env[`${prefix}_RATE`]
  const duration = env[`${prefix}_DURATION`]
  if (!rate && !duration) return phases
  return [{
    ...phases[0],
    ...(rate ? {arrivalRate: positiveInteger(`${prefix}_RATE`, rate)} : {}),
    ...(duration ? {duration: positiveInteger(`${prefix}_DURATION`, duration, 86_400)} : {})
  }]
}

function staircaseOverrides(phases, env) {
  const result = phases.map((phase) => ({...phase}))
  if (env.WARMUP_RATE) result[0].arrivalRate = positiveInteger('WARMUP_RATE', env.WARMUP_RATE)
  if (env.WARMUP_DURATION) result[0].duration = positiveInteger('WARMUP_DURATION', env.WARMUP_DURATION, 86_400)
  if (env.STAIRCASE_DURATION) {
    const duration = positiveInteger('STAIRCASE_DURATION', env.STAIRCASE_DURATION, 86_400)
    for (const phase of result.slice(1)) phase.duration = duration
  }
  if (env.STAIRCASE_RATES) {
    const rates = env.STAIRCASE_RATES.split(',').map((value) => positiveInteger('STAIRCASE_RATES', value.trim()))
    if (rates.length !== 5) throw new Error('STAIRCASE_RATES must provide exactly 5 comma-separated rates')
    rates.forEach((rate, index) => { result[index + 1].arrivalRate = rate })
  }
  return result
}

export async function buildConfig(profile, target, env = process.env) {
  validateTarget(target)
  const profiles = JSON.parse(await readFile(profilesPath, 'utf8'))
  if (!Object.hasOwn(profiles, profile)) throw new Error(`Unknown profile: ${profile}`)
  if (profile === 'overload' && env.ENABLE_OVERLOAD !== '1') {
    throw new Error('Refusing overload profile unless ENABLE_OVERLOAD=1')
  }

  let phases = profiles[profile].map((phase) => ({...phase}))
  phases = simpleOverrides(profile, phases, env)
  if (profile === 'staircase') phases = staircaseOverrides(phases, env)
  for (const [index, phase] of phases.entries()) {
    positiveInteger(`phase ${index} duration`, phase.duration, 86_400)
    positiveInteger(`phase ${index} arrivalRate`, phase.arrivalRate)
  }

  const corpusPath = path.resolve(env.REQUEST_CORPUS_PATH || defaultCorpusPath)
  return {
    config: {
      target,
      phases,
      processor: path.resolve(processorPath),
      payload: {
        path: corpusPath,
        fields: ['zip_code', 'offset'],
        skipHeader: true,
        order: 'sequence'
      },
      plugins: {
        ensure: {
          conditions: [{expression: 'vusers.failed == 0'}]
        }
      }
    },
    scenarios: [{
      name: `${profile} Zellit listings`,
      flow: [{get: {
        url: '/api/v1/zip-codes/{{ zip_code }}/listings?limit=20&offset={{ offset }}',
        beforeRequest: 'prepareZellitRequest',
        afterResponse: 'assertZellitResponse'
      }}]
    }]
  }
}

async function main([profile, target, outputPath]) {
  if (!profile || !target || !outputPath) {
    throw new Error('Usage: node scripts/render-config.mjs <profile> <target> <output-path>')
  }
  const config = await buildConfig(profile, target)
  await mkdir(path.dirname(path.resolve(outputPath)), {recursive: true})
  await writeFile(outputPath, `${JSON.stringify(config, null, 2)}\n`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  main(process.argv.slice(2)).catch((error) => { console.error(error.message); process.exitCode = 1 })
}
