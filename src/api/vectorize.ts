import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { TransactionPayload, VectorizeConfig, NormalizationConstants, MccRisk } from './types.js'

export function loadVectorizeConfig(resourcesDir: string): VectorizeConfig {
  const norm: NormalizationConstants = JSON.parse(
    readFileSync(join(resourcesDir, 'normalization.json'), 'utf-8')
  )
  const mccRisk: MccRisk = JSON.parse(
    readFileSync(join(resourcesDir, 'mcc_risk.json'), 'utf-8')
  )
  return { norm, mccRisk }
}

function clamp(x: number): number {
  return Math.max(0, Math.min(1, x))
}

export function vectorize(payload: TransactionPayload, config: VectorizeConfig): Float32Array {
  const { norm, mccRisk } = config
  const { transaction: tx, customer, merchant, terminal, last_transaction: lastTx } = payload
  const v = new Float32Array(14)

  v[0] = clamp(tx.amount / norm.max_amount)
  v[1] = clamp(tx.installments / norm.max_installments)
  v[2] = clamp((tx.amount / customer.avg_amount) / norm.amount_vs_avg_ratio)

  const requestedAt = new Date(tx.requested_at)
  v[3] = requestedAt.getUTCHours() / 23
  v[4] = ((requestedAt.getUTCDay() + 6) % 7) / 6

  if (lastTx !== null) {
    const minutes = (new Date(tx.requested_at).getTime() - new Date(lastTx.timestamp).getTime()) / 60_000
    v[5] = clamp(minutes / norm.max_minutes)
    v[6] = clamp(lastTx.km_from_current / norm.max_km)
  } else {
    v[5] = -1
    v[6] = -1
  }

  v[7]  = clamp(terminal.km_from_home / norm.max_km)
  v[8]  = clamp(customer.tx_count_24h / norm.max_tx_count_24h)
  v[9]  = terminal.is_online ? 1 : 0
  v[10] = terminal.card_present ? 1 : 0
  v[11] = customer.known_merchants.includes(merchant.id) ? 0 : 1
  v[12] = mccRisk[merchant.mcc] ?? 0.5
  v[13] = clamp(merchant.avg_amount / norm.max_merchant_avg_amount)

  return v
}
