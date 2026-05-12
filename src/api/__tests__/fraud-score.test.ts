import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import fraudScoreRoutes from '../routes/fraud-score.js'
import type { VectorizeConfig, VectorClient } from '../types.js'

const CONFIG: VectorizeConfig = {
  norm: {
    max_amount: 10000, max_installments: 12, amount_vs_avg_ratio: 10,
    max_minutes: 1440, max_km: 1000, max_tx_count_24h: 20, max_merchant_avg_amount: 10000
  },
  mccRisk: { '5411': 0.15 }
}

const LEGIT_PAYLOAD = {
  id: 'tx-test',
  transaction: { amount: 100, installments: 1, requested_at: '2026-03-11T10:00:00Z' },
  customer: { avg_amount: 100, tx_count_24h: 1, known_merchants: ['MERC-001'] },
  merchant: { id: 'MERC-001', mcc: '5411', avg_amount: 100 },
  terminal: { is_online: false, card_present: true, km_from_home: 5 },
  last_transaction: null
}

function makeApp(clientOverride?: Partial<VectorClient>): FastifyInstance {
  const mockClient: VectorClient = {
    search: async () => [0, 0, 0, 0, 0],
    close: async () => {},
    ...clientOverride
  }
  const app = Fastify()
  app.register(fraudScoreRoutes, { config: CONFIG, vectorClient: mockClient })
  return app
}

let app: FastifyInstance

beforeAll(async () => {
  app = makeApp()
  await app.ready()
})

afterAll(() => app.close())

describe('GET /ready', () => {
  it('returns 200', async () => {
    const res = await app.inject({ method: 'GET', url: '/ready' })
    expect(res.statusCode).toBe(200)
  })
})

describe('POST /fraud-score', () => {
  it('approves transaction when fraud_score < 0.6', async () => {
    const res = await app.inject({
      method: 'POST', url: '/fraud-score', payload: LEGIT_PAYLOAD
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.approved).toBe(true)
    expect(body.fraud_score).toBe(0.0)
  })

  it('rejects transaction when fraud_score >= 0.6', async () => {
    const fraudApp = makeApp({ search: async () => [1, 1, 1, 0, 0] })
    await fraudApp.ready()
    const res = await fraudApp.inject({
      method: 'POST', url: '/fraud-score', payload: LEGIT_PAYLOAD
    })
    const body = JSON.parse(res.body)
    expect(body.approved).toBe(false)
    expect(body.fraud_score).toBeCloseTo(0.6, 5)
    await fraudApp.close()
  })

  it('falls back to approved:true when vector service fails', async () => {
    const failApp = makeApp({ search: async () => { throw new Error('timeout') } })
    await failApp.ready()
    const res = await failApp.inject({
      method: 'POST', url: '/fraud-score', payload: LEGIT_PAYLOAD
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.approved).toBe(true)
    expect(body.fraud_score).toBe(0.0)
    await failApp.close()
  })

  it('returns 400 for missing required field', async () => {
    const res = await app.inject({
      method: 'POST', url: '/fraud-score', payload: { id: 'tx-bad' }
    })
    expect(res.statusCode).toBe(400)
  })
})
