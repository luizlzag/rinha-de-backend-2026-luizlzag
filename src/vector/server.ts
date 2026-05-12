import Fastify from 'fastify'
import { join } from 'node:path'
import { loadIndex } from './ivf-flat.js'
import searchRoutes from './routes/search.js'

const PORT   = parseInt(process.env.PORT   ?? '4000')
const NPROBE = parseInt(process.env.NPROBE ?? '10')
const INDEX_PATH = process.env.INDEX_PATH ?? join(import.meta.dirname, '../../index.bin')

console.log('Loading index...')
const index = loadIndex(INDEX_PATH)
console.log(`Index loaded: ${index.N} vectors, ${index.K} clusters`)

const app = Fastify({ logger: false })
await app.register(searchRoutes, { index, nprobe: NPROBE })
await app.listen({ port: PORT, host: '0.0.0.0' })
console.log(`Vector service listening on :${PORT}`)
