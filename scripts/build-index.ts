import { createReadStream, openSync, writeSync, closeSync } from 'node:fs'
import { createGunzip } from 'node:zlib'
import { join } from 'node:path'

const D = 14
const K = 500
const SAMPLE_SIZE = 50_000
const MAX_ITER = 25
const RESOURCES_DIR = join(import.meta.dirname, '../../resources')
const OUT_PATH = join(import.meta.dirname, '../../index.bin')

async function readReferences(): Promise<{ vectors: Float32Array; labels: Uint8Array }> {
  const gzPath = join(RESOURCES_DIR, 'references.json.gz')
  const chunks: Buffer[] = []

  await new Promise<void>((resolve, reject) => {
    const gunzip = createGunzip()
    gunzip.on('data', (c: Buffer) => chunks.push(c))
    gunzip.on('end', resolve)
    gunzip.on('error', reject)
    createReadStream(gzPath).pipe(gunzip)
  })

  console.log('Parsing JSON...')
  const refs: Array<{ vector: number[]; label: string }> = JSON.parse(
    Buffer.concat(chunks).toString('utf-8')
  )

  const N = refs.length
  const vectors = new Float32Array(N * D)
  const labels = new Uint8Array(N)

  for (let i = 0; i < N; i++) {
    const r = refs[i]
    for (let d = 0; d < D; d++) vectors[i * D + d] = r.vector[d]
    labels[i] = r.label === 'fraud' ? 1 : 0
  }

  console.log(`Loaded ${N} references.`)
  return { vectors, labels }
}

function buildCentroids(vectors: Float32Array, N: number): Float32Array {
  const step = Math.floor(N / SAMPLE_SIZE)
  const sample = new Float32Array(SAMPLE_SIZE * D)
  for (let i = 0; i < SAMPLE_SIZE; i++) {
    sample.set(vectors.subarray((i * step) * D, (i * step + 1) * D), i * D)
  }

  const centroids = new Float32Array(K * D)
  const initStep = Math.floor(SAMPLE_SIZE / K)
  for (let k = 0; k < K; k++) {
    centroids.set(sample.subarray(k * initStep * D, (k * initStep + 1) * D), k * D)
  }

  const assignments = new Int32Array(SAMPLE_SIZE)

  for (let iter = 0; iter < MAX_ITER; iter++) {
    let changed = 0

    for (let i = 0; i < SAMPLE_SIZE; i++) {
      let minDist = Infinity, minK = 0
      for (let k = 0; k < K; k++) {
        let dist = 0
        for (let d = 0; d < D; d++) {
          const diff = sample[i * D + d] - centroids[k * D + d]
          dist += diff * diff
        }
        if (dist < minDist) { minDist = dist; minK = k }
      }
      if (assignments[i] !== minK) { changed++; assignments[i] = minK }
    }

    const newC = new Float32Array(K * D)
    const counts = new Int32Array(K)
    for (let i = 0; i < SAMPLE_SIZE; i++) {
      const k = assignments[i]
      counts[k]++
      for (let d = 0; d < D; d++) newC[k * D + d] += sample[i * D + d]
    }
    for (let k = 0; k < K; k++) {
      if (counts[k] > 0) {
        for (let d = 0; d < D; d++) newC[k * D + d] /= counts[k]
      } else {
        const r = Math.floor(Math.random() * SAMPLE_SIZE)
        newC.set(sample.subarray(r * D, (r + 1) * D), k * D)
      }
    }
    centroids.set(newC)

    console.log(`K-means iter ${iter + 1}/${MAX_ITER}: ${changed} reassignments`)
    if (changed === 0) break
  }

  return centroids
}

function assignAll(vectors: Float32Array, N: number, centroids: Float32Array): Int32Array {
  const assignments = new Int32Array(N)
  for (let i = 0; i < N; i++) {
    let minDist = Infinity, minK = 0
    for (let k = 0; k < K; k++) {
      let dist = 0
      for (let d = 0; d < D; d++) {
        const diff = vectors[i * D + d] - centroids[k * D + d]
        dist += diff * diff
      }
      if (dist < minDist) { minDist = dist; minK = k }
    }
    assignments[i] = minK
    if (i % 500_000 === 0) console.log(`  Assigned ${i}/${N}`)
  }
  return assignments
}

function sortByCluster(
  vectors: Float32Array,
  labels: Uint8Array,
  assignments: Int32Array,
  N: number
): { sorted: Float32Array; sortedLabels: Uint8Array; offsets: Int32Array } {
  const sizes = new Int32Array(K)
  for (let i = 0; i < N; i++) sizes[assignments[i]]++

  const offsets = new Int32Array(K + 1)
  for (let k = 0; k < K; k++) offsets[k + 1] = offsets[k] + sizes[k]

  const sorted = new Float32Array(N * D)
  const sortedLabels = new Uint8Array(N)
  const pos = new Int32Array(offsets)

  for (let i = 0; i < N; i++) {
    const k = assignments[i]
    const p = pos[k]++
    sorted.set(vectors.subarray(i * D, i * D + D), p * D)
    sortedLabels[p] = labels[i]
  }

  return { sorted, sortedLabels, offsets }
}

function writeIndex(
  outPath: string,
  centroids: Float32Array,
  offsets: Int32Array,
  sorted: Float32Array,
  sortedLabels: Uint8Array,
  N: number
): void {
  const fd = openSync(outPath, 'w')

  const header = Buffer.allocUnsafe(12)
  header.writeInt32LE(K, 0)
  header.writeInt32LE(D, 4)
  header.writeInt32LE(N, 8)
  writeSync(fd, header)

  writeSync(fd, Buffer.from(centroids.buffer))
  writeSync(fd, Buffer.from(offsets.buffer))

  const CHUNK = 64 * 1024 * 1024
  const vBuf = Buffer.from(sorted.buffer)
  let written = 0
  while (written < vBuf.length) {
    const toWrite = Math.min(CHUNK, vBuf.length - written)
    writeSync(fd, vBuf, written, toWrite)
    written += toWrite
  }

  writeSync(fd, Buffer.from(sortedLabels.buffer))
  closeSync(fd)

  const sizeMB = ((12 + K * D * 4 + (K + 1) * 4 + N * D * 4 + N) / 1024 / 1024).toFixed(1)
  console.log(`Index written to ${outPath} (${sizeMB} MB)`)
}

async function main() {
  console.log('Reading references...')
  const { vectors, labels } = await readReferences()
  const N = labels.length

  console.log('Building centroids (K-means on sample)...')
  const centroids = buildCentroids(vectors, N)

  console.log('Assigning all vectors to clusters...')
  const assignments = assignAll(vectors, N, centroids)

  console.log('Sorting by cluster...')
  const { sorted, sortedLabels, offsets } = sortByCluster(vectors, labels, assignments, N)

  writeIndex(OUT_PATH, centroids, offsets, sorted, sortedLabels, N)
}

main().catch(err => { console.error(err); process.exit(1) })
