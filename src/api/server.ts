import Fastify from 'fastify'
import { join } from 'node:path'
import { loadVectorizeConfig } from './vectorize.js'
import { createVectorClient } from './vector-client.js'
import fraudScoreRoutes from './routes/fraud-score.js'

const PORT               = parseInt(process.env.PORT               ?? '3000')
const VECTOR_SERVICE_URL = process.env.VECTOR_SERVICE_URL          ?? 'http://vector-svc:4000'
const RESOURCES_DIR      = process.env.RESOURCES_DIR               ?? join(import.meta.dirname, '../../resources')

const config       = loadVectorizeConfig(RESOURCES_DIR)
const vectorClient = createVectorClient(VECTOR_SERVICE_URL)

const app = Fastify({ logger: false })
await app.register(fraudScoreRoutes, { config, vectorClient })
await app.listen({ port: PORT, host: '0.0.0.0' })
console.log(`API listening on :${PORT}`)
