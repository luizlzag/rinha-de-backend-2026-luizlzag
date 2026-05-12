import { openSync, readSync, closeSync } from 'node:fs'

export interface IVFIndex {
  K: number
  D: number
  N: number
  centroids: Float32Array
  clusterOffsets: Int32Array
  vectors: Float32Array
  labels: Uint8Array
}

export function loadIndex(indexPath: string): IVFIndex {
  const fd = openSync(indexPath, 'r')

  const header = Buffer.allocUnsafe(12)
  readSync(fd, header, 0, 12, 0)
  const K = header.readInt32LE(0)
  const D = header.readInt32LE(4)
  const N = header.readInt32LE(8)

  let pos = 12

  const centroids = new Float32Array(K * D)
  readSync(fd, Buffer.from(centroids.buffer), 0, K * D * 4, pos)
  pos += K * D * 4

  const clusterOffsets = new Int32Array(K + 1)
  readSync(fd, Buffer.from(clusterOffsets.buffer), 0, (K + 1) * 4, pos)
  pos += (K + 1) * 4

  const vectors = new Float32Array(N * D)
  const vectorBuf = Buffer.from(vectors.buffer)
  const CHUNK = 64 * 1024 * 1024
  let read = 0
  while (read < N * D * 4) {
    const toRead = Math.min(CHUNK, N * D * 4 - read)
    readSync(fd, vectorBuf, read, toRead, pos + read)
    read += toRead
  }
  pos += N * D * 4

  const labels = new Uint8Array(N)
  readSync(fd, Buffer.from(labels.buffer), 0, N, pos)

  closeSync(fd)
  return { K, D, N, centroids, clusterOffsets, vectors, labels }
}

function l2sq(a: Float32Array, aOff: number, b: Float32Array, bOff: number, D: number): number {
  let d = 0
  for (let i = 0; i < D; i++) {
    const diff = a[aOff + i] - b[bOff + i]
    d += diff * diff
  }
  return d
}

export function search(index: IVFIndex, query: Float32Array, k: number, nprobe: number): number[] {
  const { K, D, centroids, clusterOffsets, vectors, labels } = index

  const centDists: [number, number][] = new Array(K)
  for (let i = 0; i < K; i++) {
    centDists[i] = [l2sq(query, 0, centroids, i * D, D), i]
  }
  centDists.sort((a, b) => a[0] - b[0])

  const candidates: [number, number][] = []
  for (let p = 0; p < Math.min(nprobe, K); p++) {
    const ci = centDists[p][1]
    const start = clusterOffsets[ci]
    const end = clusterOffsets[ci + 1]
    for (let i = start; i < end; i++) {
      candidates.push([l2sq(query, 0, vectors, i * D, D), i])
    }
  }

  candidates.sort((a, b) => a[0] - b[0])
  return candidates.slice(0, k).map(([, i]) => labels[i])
}
