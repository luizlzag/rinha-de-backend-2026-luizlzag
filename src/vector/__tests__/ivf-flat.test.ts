import { describe, it, expect } from 'vitest'
import { search } from '../ivf-flat.js'
import type { IVFIndex } from '../ivf-flat.js'

function makeIndex(): IVFIndex {
  // 2 clusters, 3 vectors each, D=2
  // Cluster 0 (indices 0-2): vectors near [0, 0]  → 2 legit, 1 fraud
  // Cluster 1 (indices 3-5): vectors near [1, 1]  → all fraud
  const K = 2, D = 2, N = 6
  const centroids = new Float32Array([0.05, 0.05, 0.95, 0.95])
  const clusterOffsets = new Int32Array([0, 3, 6])
  const vectors = new Float32Array([
    0.0, 0.0,
    0.1, 0.1,
    0.0, 0.2,
    1.0, 1.0,
    0.9, 0.9,
    1.1, 0.9,
  ])
  const labels = new Uint8Array([0, 0, 1, 1, 1, 1])
  return { K, D, N, centroids, clusterOffsets, vectors, labels }
}

describe('search', () => {
  it('returns k labels of nearest neighbors', () => {
    const index = makeIndex()
    const query = new Float32Array([0.05, 0.05])
    const result = search(index, query, 3, 1)

    expect(result).toHaveLength(3)
    expect(result.filter(l => l === 0).length).toBe(2)
    expect(result.filter(l => l === 1).length).toBe(1)
  })

  it('searches multiple clusters when nprobe > 1', () => {
    const index = makeIndex()
    const query = new Float32Array([0.5, 0.5])
    const result = search(index, query, 5, 2)

    expect(result).toHaveLength(5)
    const fraudCount = result.filter(l => l === 1).length
    expect(fraudCount).toBeGreaterThanOrEqual(1)
  })

  it('handles k larger than cluster size by using nprobe clusters', () => {
    const index = makeIndex()
    const query = new Float32Array([0.0, 0.0])
    const result = search(index, query, 5, 2)

    expect(result).toHaveLength(5)
  })
})
