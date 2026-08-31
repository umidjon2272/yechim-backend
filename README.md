# YECHIM CRM Backend

NestJS + PostgreSQL + Prisma backend for the YECHIM CRM frontend.

## Local Setup

1. Copy `.env.example` to `.env`.
2. Fill `DATABASE_URL`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `ADMIN_EMAIL`, and `ADMIN_PASSWORD`.
3. Install and prepare the database:

```bash
npm install
npx prisma generate
npx prisma migrate deploy
npm run seed
```

4. Start the API:

```bash
npm run start:dev
```

The API is served under `/api`; health check is `GET /api/health`.

## Render Setup

Use these settings:

```text
Root Directory: backend
Build Command: npm install && npx prisma generate && npm run build
Pre-deploy/Migration Command: npx prisma migrate deploy
Start Command: npm run start:prod

`npm run build` emits the canonical `dist/main.js` entrypoint and also keeps a
temporary compatibility entrypoint at `dist/src/main.js` for older Render
service settings. Update Render Start Command to `npm run start:prod` when
possible.
```

Required environment variables:

```env
PORT=3000
NODE_ENV=production
DATABASE_URL=
JWT_SECRET=
JWT_REFRESH_SECRET=
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=30d
FRONTEND_URL=https://your-project.vercel.app
ADMIN_EMAIL=
ADMIN_PASSWORD=
```

`FRONTEND_URL` must be the exact Vercel origin (no `/` at the end); multiple
origins may be comma-separated. `JWT_SECRET` and `JWT_REFRESH_SECRET` must be
long random production-only values. The frontend stores only the access/refresh
token pair in `localStorage` so an installed PWA can restore a still-valid
session, and sends the access token as `Authorization: Bearer`. The backend
does not use browser-wide auth cookies; old cookie names are only expired as a
migration cleanup. Every app launch must still validate the token through
`/api/auth/me`.

Run `npm run seed` once after the first deploy to create the admin configured
by `ADMIN_EMAIL`/`ADMIN_PASSWORD`, the `Asosiy savdo` pipeline, and the 9
default customer stages. On a new empty database it also creates the initial
customer groups; those groups are marked as seeded and are never recreated by
later seed/deploy runs after an admin deletes one. There is no built-in
production admin password.

## Neon connection pooling

`PrismaService` runs as a single long-lived client for the life of the Render
process (see `src/prisma/prisma.service.ts`), so it keeps its own connection
pool open across requests — it is not a per-request/serverless connection.
Two Neon-specific settings matter for request latency:

- **Use Neon's pooled endpoint** (the host with an `-pooler` suffix) in
  `DATABASE_URL`, with `?pgbouncer=true&connection_limit=10&pool_timeout=20`
  (tune `connection_limit` to Render's CPU/RAM tier — Prisma's own default is
  only `num_cpus * 2 + 1`, which is too small for a handful of endpoints that
  each issue several queries per request and can leave requests queueing for
  a pooled connection under concurrent load).
- **Check Neon's autosuspend/scale-to-zero setting** on the production
  branch. A suspended compute takes noticeably longer (often 1s+) to resume
  on the first query after idle; every request in this app pays that cost
  identically regardless of which endpoint it hits, which is a common cause
  of uniformly slow requests across otherwise cheap and expensive endpoints
  alike. For a production API, prefer a Neon plan/branch with autosuspend
  disabled (or a long idle timeout) over tuning application code further.
