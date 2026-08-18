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
long random production-only values. The frontend uses `credentials: include`,
so the Render API must return credentialed CORS and the auth cookies are
`httpOnly`, `secure`, and `SameSite=None` in production.

Run `npm run seed` once after the first deploy to create the admin configured
by `ADMIN_EMAIL`/`ADMIN_PASSWORD`, the `Asosiy savdo` pipeline, and the 9
default customer stages. There is no built-in production admin password.
