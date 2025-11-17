# Deploy to Koyeb

This guide describes deploying the app (Express API + built React client) to Koyeb using Buildpacks. It also covers Postgres setup (recommended: Neon free tier).

## Prerequisites
- GitHub repository with this code.
- A Postgres database (e.g., Neon). Copy its connection string and ensure it includes `?sslmode=require` if needed.
- Enable the `pgcrypto` extension on your Postgres instance:

```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;
```

This is required by the `gen_random_uuid()` defaults in `shared/schema.ts`.

## Steps (Buildpacks)
1. In Koyeb, create a new App → Deploy a Service from your GitHub repo.
2. Select Buildpacks as the deployment method.
3. Configure the service:
   - Build Command:
     ```zsh
     npm ci
     npm run db:push
     npm run build
     npm run db:seed
     ```
   - Run Command:
     ```zsh
     npm start
     ```
   - Environment Variables:
     - `NODE_ENV=production`
     - `DATABASE_URL=<your_postgres_connection_string>`
4. Deploy. Koyeb sets `PORT` automatically; the server already uses `process.env.PORT`.

## Notes
- The app serves the API and built client from the same service, no separate frontend hosting required.
- Seeding is idempotent: it skips products if present and only creates the admin user if missing.
- For Neon/Postgres, ensure `pgcrypto` is enabled once (see SQL above).
- Static images in `attached_assets/` are served via `/assets/*`.

## Optional: Docker deployment
You can deploy with a Dockerfile instead of Buildpacks. Create a Dockerfile like this and push:

```dockerfile
# syntax=docker/dockerfile:1
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

FROM node:20-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Build client + server bundle
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
# Koyeb provides PORT; no need to EXPOSE explicitly
CMD ["npm", "start"]
```

When using Docker on Koyeb, set the same env vars (`DATABASE_URL`, `NODE_ENV`) and keep the default start command. Run `npm run db:push` and `npm run db:seed` once manually (e.g., locally or via a one-off service run) unless you prefer to wrap them into your deployment workflow.
