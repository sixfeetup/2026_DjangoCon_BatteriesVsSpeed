import {mkdir, writeFile} from 'node:fs/promises'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

const scriptPath = fileURLToPath(import.meta.url)

export const FASTAPI_RUNTIME = Object.freeze({
  runtime_label: 'uvicorn-1',
  server: 'uvicorn',
  workers: 1,
  concurrency_model: 'asyncio',
  database_access: 'sqlalchemy-async',
  database_driver: 'asyncpg',
  pool_size: 20,
  max_overflow: 0,
})

export async function renderFastapiRuntime(outputPath) {
  if (!outputPath) throw new Error('output path is required')
  const resolved = path.resolve(outputPath)
  await mkdir(path.dirname(resolved), {recursive: true})
  await writeFile(resolved, `${JSON.stringify(FASTAPI_RUNTIME, null, 2)}\n`)
  return {...FASTAPI_RUNTIME}
}

async function main([outputPath]) {
  if (!outputPath) throw new Error('Usage: node scripts/render-fastapi-runtime.mjs <output-path>')
  await renderFastapiRuntime(outputPath)
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
}
