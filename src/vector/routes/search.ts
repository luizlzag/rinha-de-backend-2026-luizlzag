import type { FastifyInstance } from 'fastify'
import { search, type IVFIndex } from '../ivf-flat.js'

export default async function searchRoutes(
  app: FastifyInstance,
  opts: { index: IVFIndex; nprobe: number }
) {
  app.get('/health', async () => ({ status: 'ok' }))

  app.post<{ Body: { vector: number[] } }>(
    '/search',
    {
      schema: {
        body: {
          type: 'object',
          required: ['vector'],
          properties: { vector: { type: 'array', items: { type: 'number' }, minItems: 1 } }
        },
        response: {
          200: {
            type: 'object',
            properties: { neighbors: { type: 'array', items: { type: 'integer' } } }
          }
        }
      }
    },
    async (req) => {
      const query = new Float32Array(req.body.vector)
      const neighbors = search(opts.index, query, 5, opts.nprobe)
      return { neighbors }
    }
  )
}
