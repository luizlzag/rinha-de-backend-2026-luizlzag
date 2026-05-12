import { describe, it, expect } from 'vitest'
import { vectorize } from '../vectorize.js'
import type { VectorizeConfig } from '../types.js'

const CONFIG: VectorizeConfig = {
  norm: {
    max_amount: 10000,
    max_installments: 12,
    amount_vs_avg_ratio: 10,
    max_minutes: 1440,
    max_km: 1000,
    max_tx_count_24h: 20,
    max_merchant_avg_amount: 10000
  },
  mccRisk: {
    '5411': 0.15, '5812': 0.30, '5912': 0.20, '5944': 0.45,
    '7801': 0.80, '7802': 0.75, '7995': 0.85, '4511': 0.35,
    '5311': 0.25, '5999': 0.50
  }
}

describe('vectorize', () => {
  it('produces correct 14-dim vector for legit transaction (spec example)', () => {
    const payload = {
      id: 'tx-1329056812',
      transaction: { amount: 41.12, installments: 2, requested_at: '2026-03-11T18:45:53Z' },
      customer: { avg_amount: 82.24, tx_count_24h: 3, known_merchants: ['MERC-003', 'MERC-016'] },
      merchant: { id: 'MERC-016', mcc: '5411', avg_amount: 60.25 },
      terminal: { is_online: false, card_present: true, km_from_home: 29.23 },
      last_transaction: null
    }
    const v = vectorize(payload, CONFIG)

    expect(v).toHaveLength(14)
    expect(v[0]).toBeCloseTo(0.0041, 3)
    expect(v[1]).toBeCloseTo(0.1667, 3)
    expect(v[2]).toBeCloseTo(0.05, 3)
    expect(v[3]).toBeCloseTo(0.7826, 3)
    expect(v[4]).toBeCloseTo(0.3333, 3)
    expect(v[5]).toBe(-1)
    expect(v[6]).toBe(-1)
    expect(v[7]).toBeCloseTo(0.0292, 3)
    expect(v[8]).toBeCloseTo(0.15, 3)
    expect(v[9]).toBe(0)
    expect(v[10]).toBe(1)
    expect(v[11]).toBe(0)
    expect(v[12]).toBeCloseTo(0.15, 3)
    expect(v[13]).toBeCloseTo(0.006, 3)
  })

  it('produces correct vector for fraudulent transaction (spec example)', () => {
    const payload = {
      id: 'tx-3330991687',
      transaction: { amount: 9505.97, installments: 10, requested_at: '2026-03-14T05:15:12Z' },
      customer: { avg_amount: 81.28, tx_count_24h: 20, known_merchants: ['MERC-008', 'MERC-007', 'MERC-005'] },
      merchant: { id: 'MERC-068', mcc: '7802', avg_amount: 54.86 },
      terminal: { is_online: false, card_present: true, km_from_home: 952.27 },
      last_transaction: null
    }
    const v = vectorize(payload, CONFIG)

    expect(v[0]).toBeCloseTo(0.9506, 3)
    expect(v[1]).toBeCloseTo(0.8333, 3)
    expect(v[2]).toBe(1.0)
    expect(v[3]).toBeCloseTo(0.2174, 3)
    expect(v[4]).toBeCloseTo(0.8333, 3)
    expect(v[5]).toBe(-1)
    expect(v[6]).toBe(-1)
    expect(v[7]).toBeCloseTo(0.9523, 3)
    expect(v[8]).toBe(1.0)
    expect(v[9]).toBe(0)
    expect(v[10]).toBe(1)
    expect(v[11]).toBe(1)
    expect(v[12]).toBeCloseTo(0.75, 3)
    expect(v[13]).toBeCloseTo(0.0055, 3)
  })

  it('computes minutes_since_last_tx and km_from_last_tx when last_transaction is present', () => {
    const payload = {
      id: 'tx-001',
      transaction: { amount: 100, installments: 1, requested_at: '2026-03-11T10:00:00Z' },
      customer: { avg_amount: 100, tx_count_24h: 0, known_merchants: [] },
      merchant: { id: 'MERC-001', mcc: '9999', avg_amount: 100 },
      terminal: { is_online: false, card_present: true, km_from_home: 0 },
      last_transaction: { timestamp: '2026-03-11T09:00:00Z', km_from_current: 100 }
    }
    const v = vectorize(payload, CONFIG)

    expect(v[5]).toBeCloseTo(60 / 1440, 4)
    expect(v[6]).toBeCloseTo(100 / 1000, 4)
  })

  it('clamps amount_vs_avg to 1.0 when ratio exceeds 10x', () => {
    const payload = {
      id: 'tx-002',
      transaction: { amount: 5000, installments: 1, requested_at: '2026-03-11T10:00:00Z' },
      customer: { avg_amount: 10, tx_count_24h: 0, known_merchants: [] },
      merchant: { id: 'MERC-001', mcc: '9999', avg_amount: 100 },
      terminal: { is_online: false, card_present: true, km_from_home: 0 },
      last_transaction: null
    }
    expect(vectorize(payload, CONFIG)[2]).toBe(1.0)
  })

  it('defaults mcc_risk to 0.5 for unknown MCC', () => {
    const payload = {
      id: 'tx-003',
      transaction: { amount: 100, installments: 1, requested_at: '2026-03-11T10:00:00Z' },
      customer: { avg_amount: 100, tx_count_24h: 0, known_merchants: [] },
      merchant: { id: 'MERC-001', mcc: 'UNKNOWN', avg_amount: 100 },
      terminal: { is_online: false, card_present: true, km_from_home: 0 },
      last_transaction: null
    }
    expect(vectorize(payload, CONFIG)[12]).toBe(0.5)
  })
})
