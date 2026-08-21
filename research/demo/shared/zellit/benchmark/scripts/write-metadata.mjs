import {mkdir, writeFile} from 'node:fs/promises'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

const scriptPath = fileURLToPath(import.meta.url)
export const requiredMetadataFields = [
  'run_id', 'started_at', 'completed_at', 'status', 'exit_status', 'profile', 'target',
  'execution_mode', 'git_revision', 'alphakit_revision', 'implementation', 'dataset',
  'request_corpus', 'effective_phases', 'versions', 'images', 'resource_limits', 'notes'
]

export function normalizeMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) throw new Error('Metadata must be an object')
  const output = {}
  for (const field of requiredMetadataFields) {
    if (!Object.hasOwn(metadata, field)) throw new Error(`Missing metadata field: ${field}`)
    output[field] = metadata[field]
  }
  for (const field of ['run_id', 'started_at', 'status', 'profile', 'target', 'execution_mode', 'git_revision', 'alphakit_revision', 'implementation']) {
    if (typeof output[field] !== 'string' || !output[field]) throw new Error(`Metadata field ${field} must be non-empty`)
  }
  if (!['running', 'succeeded', 'failed', 'interrupted'].includes(output.status)) throw new Error('Metadata status is invalid')
  if (!Array.isArray(output.effective_phases)) throw new Error('effective_phases must be an array')
  for (const field of ['dataset', 'request_corpus', 'versions', 'images']) {
    if (!output[field] || typeof output[field] !== 'object' || Array.isArray(output[field])) throw new Error(`${field} must be an object`)
  }
  return output
}

export async function writeMetadata(outputPath, metadata) {
  await mkdir(path.dirname(path.resolve(outputPath)), {recursive: true})
  await writeFile(outputPath, `${JSON.stringify(normalizeMetadata(metadata), null, 2)}\n`)
}

async function stdin() {
  const chunks = []
  for await (const chunk of process.stdin) chunks.push(chunk)
  return Buffer.concat(chunks).toString('utf8')
}

async function main([outputPath]) {
  if (!outputPath) throw new Error('Usage: node scripts/write-metadata.mjs <output-path>')
  await writeMetadata(outputPath, JSON.parse(await stdin()))
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  main(process.argv.slice(2)).catch((error) => { console.error(error.message); process.exitCode = 1 })
}
