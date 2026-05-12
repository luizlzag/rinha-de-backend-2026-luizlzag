# Rinha de Backend 2026 — luizlzag

Solução para a [Rinha de Backend 2026](https://github.com/zanfranceschi/rinha-de-backend-2026) — detecção de fraude em transações de cartão usando busca vetorial.

## Stack

- **Runtime:** Node.js 22 + TypeScript 5
- **HTTP:** Fastify 5
- **Cliente HTTP:** undici 7
- **Testes:** vitest 3
- **Load balancer:** nginx

## Arquitetura

```
nginx :9999 (round-robin)
├── api-1 :3000  (Fastify — stateless)
└── api-2 :3000  (Fastify — stateless)
         └── vector-svc :4000 (Fastify + IVF-Flat)
```

A detecção de fraude usa **IVF-Flat** (Inverted File Index com brute-force por partição):

1. 3 milhões de vetores de referência (14 dimensões) são clusterizados em **K=500 partições** durante o `docker build`
2. A cada request, o payload é vetorizado em 14 dimensões normalizadas
3. Os **10 clusters mais próximos** são selecionados e o brute-force encontra os **5 vizinhos mais próximos**
4. `fraud_score = fraudes_entre_5 / 5` — aprovado se `score < 0.6`

## Budget de recursos

| Serviço | CPU | RAM |
|---|---|---|
| nginx | 0.05 | 10 MB |
| api-1 | 0.20 | 20 MB |
| api-2 | 0.20 | 20 MB |
| vector-svc | 0.55 | 300 MB |
| **Total** | **1.0** | **350 MB** |

## Branches

- `main` — código-fonte
- `submission` — apenas `docker-compose.yml` e `nginx.conf` com imagens publicadas

## Licença

MIT
