# CryptoX — Full-Stack Crypto Exchange Platform

A full-featured cryptocurrency exchange platform with user trading portal, admin dashboard, REST API, Go-based order matching engine, and Expo mobile app.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `PORT=23744 BASE_PATH=/admin/ pnpm --filter @workspace/admin run dev` — Admin panel (port 23744, path /admin/)
- `PORT=23475 BASE_PATH=/user/ pnpm --filter @workspace/user-portal run dev` — User portal (port 23475, path /user/)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string (auto-provisioned)

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5, Redis (embedded), WebSocket price streaming
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)
- Go service: Order matching engine (`artifacts/go-service/`)
- Mobile: Expo React Native (`artifacts/crypto-exchange/`)

## Where things live

- DB schema source of truth: `lib/db/src/schema/index.ts`
- API contract: `lib/api-spec/openapi.yaml`
- API server routes: `artifacts/api-server/src/routes/`
- Admin frontend: `artifacts/admin/src/`
- User portal frontend: `artifacts/user-portal/src/`
- Go order matching engine: `artifacts/go-service/`
- Mobile app: `artifacts/crypto-exchange/`

## Architecture decisions

- Single Express API server serves all routes under `/api` prefix
- Redis runs embedded (in-process) for caching, pub/sub, and leader election
- DB migrations use Drizzle `push` (dev) — production schema managed by Replit Publish flow
- Admin and user-portal are separate Vite/React SPAs at `/admin/` and `/user/` paths
- Go service is a standalone order-matching engine communicating over HTTP

## Product

- Full crypto exchange: spot trading, futures, options, P2P, copy trading, earn
- Admin panel: exchange settings, user management, market listings, content management
- User portal: trading interface, wallet, deposits/withdrawals, KYC, referrals
- AI trading bots, price alerts, WebSocket real-time feeds

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Admin and user-portal require `PORT` and `BASE_PATH` env vars set when starting dev server
- `pnpm --filter @workspace/db run push` requires `DATABASE_URL` to be set (auto-provisioned via Replit DB)
- Do NOT run `pnpm dev` at workspace root — use per-package filter commands
- After schema changes: run `db push`, then restart `api-server` workflow

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
