import type { FastifyInstance } from 'fastify'
import { vectorize } from '../vectorize.js'
import type { TransactionPayload, FraudScoreResponse, VectorizeConfig, VectorClient } from '../types.js'

const bodySchema = {
  type: 'object',
  required: ['id', 'transaction', 'customer', 'merchant', 'terminal'],
  properties: {
    id: { type: 'string' },
    transaction: {
      type: 'object', required: ['amount', 'installments', 'requested_at'],
      properties: { amount: { type: 'number' }, installments: { type: 'integer' }, requested_at: { type: 'string' } }
    },
    customer: {
      type: 'object', required: ['avg_amount', 'tx_count_24h', 'known_merchants'],
      properties: { avg_amount: { type: 'number' }, tx_count_24h: { type: 'integer' }, known_merchants: { type: 'array', items: { type: 'string' } } }
    },
    merchant: {
      type: 'object', required: ['id', 'mcc', 'avg_amount'],
      properties: { id: { type: 'string' }, mcc: { type: 'string' }, avg_amount: { type: 'number' } }
    },
    terminal: {
      type: 'object', required: ['is_online', 'card_present', 'km_from_home'],
      properties: { is_online: { type: 'boolean' }, card_present: { type: 'boolean' }, km_from_home: { type: 'number' } }
    },
    last_transaction: {
      oneOf: [
        { type: 'null' },
        {
          type: 'object', required: ['timestamp', 'km_from_current'],
          properties: { timestamp: { type: 'string' }, km_from_current: { type: 'number' } }
        }
      ]
    }
  }
}

const responseSchema = {
  200: {
    type: 'object',
    properties: { approved: { type: 'boolean' }, fraud_score: { type: 'number' } }
  }
}

export default async function fraudScoreRoutes(
  app: FastifyInstance,
  opts: { config: VectorizeConfig; vectorClient: VectorClient }
) {
  app.get('/ready', async () => ({ status: 'ok' }))

  app.post<{ Body: TransactionPayload; Reply: FraudScoreResponse }>(
    '/fraud-score',
    { schema: { body: bodySchema, response: responseSchema } },
    async (req, reply) => {
      const vector = vectorize(req.body, opts.config)

      let neighbors: number[]
      try {
        neighbors = await opts.vectorClient.search(vector)
      } catch {
        return reply.send({ approved: true, fraud_score: 0.0 })
      }

      const fraudCount = neighbors.filter(l => l === 1).length
      const fraud_score = fraudCount / 5
      return reply.send({ approved: fraud_score < 0.6, fraud_score })
    }
  )
}
