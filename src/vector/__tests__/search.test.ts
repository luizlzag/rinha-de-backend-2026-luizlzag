import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import searchRoutes from '../routes/search.js'
import type { IVFIndex } from '../ivf-flat.js'

function makeIndex(): IVFIndex {
  const K = 2, D = 2, N = 6
  const centroids = new Float32Array([0.05, 0.05, 0.95, 0.95])
  const clusterOffsets = new Int32Array([0, 3, 6])
  const vectors = new Float32Array([
    0.0, 0.0, 0.1, 0.1, 0.0, 0.2,
    1.0, 1.0, 0.9, 0.9, 1.1, 0.9,
  ])
  const labels = new Uint8Array([0, 0, 1, 1, 1, 1])
  return { K, D, N, centroids, clusterOffsets, vectors, labels }
}

let app: FastifyInstance

beforeAll(async () => {
  app = Fastify()
  await app.register(searchRoutes, { index: makeIndex(), nprobe: 2 })
  await app.ready()
})

afterAll(() => app.close())

describe('POST /search', () => {
  it('returns 5 neighbor labels for a 2-dim query', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/search',
      payload: { vector: [0.05, 0.05] }
    })

    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body) as { neighbors: number[] }
    expect(body.neighbors).toHaveLength(5)
    body.neighbors.forEach(l => expect([0, 1]).toContain(l))
  })

  it('returns 400 when vector is missing', async () => {
    const res = await app.inject({ method: 'POST', url: '/search', payload: {} })
    expect(res.statusCode).toBe(400)
  })
})
