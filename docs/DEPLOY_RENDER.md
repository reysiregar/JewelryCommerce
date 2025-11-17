# Deploy to Render

This project ships with a Render Blueprint (`render.yaml`) that provisions a Web Service and a managed PostgreSQL database, then builds and runs the app.

## One‑click (Blueprint)
1. Push this repository to GitHub.
2. In Render, click New → Blueprint and select your repo.
3. Confirm the plan(s) and deploy. Render will:
   - Create a PostgreSQL database and export `DATABASE_URL` to the service.
   - Enable `pgcrypto` (for `gen_random_uuid()`) via `scripts/enable_pgcrypto.mjs`.
   - `npm run db:push` to apply the Drizzle schema.
   - `npm run build` to build the client and server.
   - `npm run db:seed` to seed products and an admin user.
   - Start with `npm start`.

## Manual setup (without Blueprint)
Create a Web Service and a Database in Render, then configure the service:

- Build Command

```zsh
npm ci
npm run db:enable:pgcrypto
npm run db:push
npm run build
npm run db:seed
```

- Start Command

```zsh
npm start
```

- Environment Variables
  - `DATABASE_URL`: use the database's Internal Connection string.

- Health Check
  - Path: `/`

## Notes
- The server listens on `process.env.PORT` (Render sets this automatically).
- Static product images under `attached_assets/` are served at `/assets/*`.
- Without `DATABASE_URL`, the app uses in‑memory storage (no persistence).
