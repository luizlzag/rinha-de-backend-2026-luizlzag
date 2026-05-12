import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import type { AddressInfo } from 'node:net'
import { createVectorClient } from '../vector-client.js'
import type { VectorClient } from '../types.js'

let mock: FastifyInstance
let client: VectorClient
let port: number

beforeAll(async () => {
  mock = Fastify()
  mock.post('/search', async () => ({ neighbors: [0, 1, 1, 0, 1] }))
  await mock.listen({ port: 0, host: '127.0.0.1' })
  port = (mock.server.address() as AddressInfo).port
  client = createVectorClient(`http://127.0.0.1:${port}`)
})

afterAll(async () => {
  await client.close()
  await mock.close()
})

describe('VectorClient', () => {
  it('sends vector to /search and returns neighbor labels', async () => {
    const query = new Float32Array(14).fill(0.5)
    const neighbors = await client.search(query)
    expect(neighbors).toEqual([0, 1, 1, 0, 1])
  })

  it('returns exactly 5 neighbors matching the mock response length', async () => {
    const query = new Float32Array(14).fill(0.1)
    const neighbors = await client.search(query)
    expect(neighbors).toHaveLength(5)
  })
})
