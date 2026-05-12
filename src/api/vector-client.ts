import { Pool } from 'undici'
import type { VectorClient } from './types.js'

export function createVectorClient(url: string, connections = 50): VectorClient {
  const pool = new Pool(url, { connections, pipelining: 1 })

  return {
    async search(query: Float32Array): Promise<number[]> {
      const { body } = await pool.request({
        method: 'POST',
        path: '/search',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ vector: Array.from(query) })
      })
      const data = await body.json() as { neighbors: number[] }
      return data.neighbors
    },

    async close(): Promise<void> {
      await pool.close()
    }
  }
}
