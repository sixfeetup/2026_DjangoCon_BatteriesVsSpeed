import {mkdir, readFile} from 'node:fs/promises'
import {spawnSync} from 'node:child_process'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

const scriptPath = fileURLToPath(import.meta.url)
const benchmarkDir = path.resolve(path.dirname(scriptPath), '..')
const djangoDir = path.resolve(benchmarkDir, '../../../django/zellit')
const rendererPath = path.join(djangoDir, 'scripts/render_runtime.py')

/** Delegate to Django's renderer so presets, defaults, bounds, and overrides have one implementation. */
export async function renderRuntime(mode, envFile, jsonFile, env = process.env) {
  if (!mode || !envFile || !jsonFile) throw new Error('mode, envFile, and jsonFile are required')
  await mkdir(path.dirname(path.resolve(envFile)), {recursive: true})
  await mkdir(path.dirname(path.resolve(jsonFile)), {recursive: true})
  const python = env.PYTHON_BIN || 'python3'
  const result = spawnSync(python, [rendererPath, mode, '--env-file', envFile, '--json-file', jsonFile], {
    encoding: 'utf8',
    env: {...process.env, ...env}
  })
  if (result.error) throw result.error
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout).trim()
    throw new Error(detail || `runtime renderer exited ${result.status}`)
  }
  return JSON.parse(await readFile(jsonFile, 'utf8'))
}

async function main([mode, envFile, jsonFile]) {
  if (!mode || !envFile || !jsonFile) {
    throw new Error('Usage: node scripts/render-runtime.mjs <gevent-1|gevent-2|sync-1|custom> <env-file> <json-file>')
  }
  await renderRuntime(mode, envFile, jsonFile)
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  main(process.argv.slice(2)).catch((error) => { console.error(error.message); process.exitCode = 1 })
}
