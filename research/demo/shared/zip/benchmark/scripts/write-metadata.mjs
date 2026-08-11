import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptPath = fileURLToPath(import.meta.url)

export const metadataFields = [
  'run_id',
  'started_at',
  'completed_at',
  'git_revision',
  'target',
  'profile',
  'node_version',
  'artillery_version',
  'python_version',
  'application_version',
  'framework_version',
  'server_version',
  'redis_version',
  'effective_phases',
  'execution_mode'
]

function normalizeMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    throw new Error('Metadata must be an object')
  }

  const ordered = {}
  for (const field of metadataFields) {
    if (!(field in metadata)) {
      throw new Error(`Missing metadata field: ${field}`)
    }

    const value = metadata[field]
    if (field !== 'completed_at' && (value === undefined || value === null || value === '')) {
      throw new Error(`Missing metadata field: ${field}`)
    }

    ordered[field] = value
  }

  return ordered
}

export async function writeMetadata(outputPath, metadata) {
  const ordered = normalizeMetadata(metadata)
  await mkdir(path.dirname(outputPath), {recursive: true})
  await writeFile(outputPath, `${JSON.stringify(ordered, null, 2)}\n`)
}

async function readStdin() {
  const chunks = []
  for await (const chunk of process.stdin) {
    chunks.push(chunk)
  }
  return Buffer.concat(chunks).toString('utf8')
}

async function main(argv) {
  const [outputPath] = argv
  if (!outputPath) {
    throw new Error('Usage: node scripts/write-metadata.mjs <output-path>')
  }

  const raw = await readStdin()
  const metadata = JSON.parse(raw)
  await writeMetadata(outputPath, metadata)
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
}
