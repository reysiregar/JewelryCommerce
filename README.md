# JewelCommerce (Lumière Jewelry)

 Elegant, full‑stack demo storefront for fine jewelry. React + Vite frontend, Express backend, and Drizzle ORM for Postgres. Ships with in‑memory data by default, automatically uses Postgres when `DATABASE_URL` is set, cookie‑based sessions (persisted when Postgres is enabled), product browsing, auth‑gated cart/checkout with simulated payments, and an admin summary.

## Overview
- Monorepo layout with `client/` (React + Tailwind) and `server/` (Express + Vite middleware in dev)
- Data layer uses an in‑memory store (`MemStorage`) by default, and can use PostgreSQL via Drizzle when `DATABASE_URL` is set
- Database schema defined via Drizzle for PostgreSQL in `shared/schema.ts` and applied via `drizzle-kit push`
- Auth uses HTTP‑only cookie `sid` session, seeded admin account for testing

## Tech Stack
- Frontend: React 18, Wouter (routing), Tailwind CSS, Radix UI, React Query
- Backend: Express 4, Vite middleware in dev, Node ESM
- Data/Validation: Zod, Drizzle ORM schema, in‑memory storage with optional PostgreSQL
- Tooling: TypeScript, Vite, esbuild, tsx, Tailwind plugins

## Features
- Product catalog with categories, search, product detail
- Client‑side cart with size variants, persistent in `localStorage` (add to cart requires login)
- Checkout flow with Zod‑validated form and simulated payment (requires login)
- Auth: register, login, logout, current user (`/api/auth/me`)
- Admin dashboard summary endpoint

---

## Quick Start (macOS, zsh)
Prereqs: Node >= 18, npm >= 10. Postgres is optional (not required for dev).

```zsh
# Install dependencies
npm install

# Start dev server (Express + Vite middleware)
npm run dev
# Open the URL printed in the terminal (default http://localhost:5173)

# Build for production (client + bundled server)
npm run build

# Run production build
npm start
```

Optional: Use PostgreSQL for persistence. Set `DATABASE_URL` and run:

```zsh
export DATABASE_URL="postgres://user:pass@host:5432/dbname"
npm run db:push

# (Optional) seed sample products and an admin user
npm run db:seed
```

Notes:
- By default the app uses in‑memory storage; when `DATABASE_URL` is present it automatically uses PostgreSQL.
- Static product images are served at `/assets/...` from `attached_assets/`.

---

## Project Structure
```
client/           # React app (Vite)
  src/
    pages/        # Route components (wouter)
    components/   # UI primitives + composite components
    lib/          # Auth/cart contexts, query client, utils
server/           # Express app
  index.ts        # Server bootstrap
  routes.ts       # REST API endpoints
  storage.ts      # Storage abstraction (in‑memory by default, Postgres via Drizzle when configured)
  db.ts           # Drizzle + pg Pool setup (used when DATABASE_URL is set)
  vite.ts         # Vite dev server integration and static serve
shared/
  schema.ts       # Drizzle models + Zod insert schemas (types)
attached_assets/  # Product images
```

Path aliases (see `vite.config.ts`): `@` -> `client/src`, `@shared` -> `shared`, `@assets` -> `attached_assets`.

---

## Frontend
- Router: paths defined in `client/src/App.tsx`
  - `/` Home
  - `/products` Product listing (supports `?category=...`)
  - `/product/:id` Product detail
  - `/checkout` Checkout (requires login)
  - `/order-success` Order success
  - `/login`, `/register`
  - `/dashboard` User dashboard
  - `/admin` Admin dashboard
- State:
  - Cart: `CartProvider` in `client/src/lib/cart-context.tsx` (localStorage persistence; add‑to‑cart and checkout are auth‑gated)
  - Auth: `AuthProvider` in `client/src/lib/auth-context.tsx` (cookie session; `sid`) — supports `returnTo` redirect on login/register
  - Data fetching: React Query (`client/src/lib/queryClient.ts`)
- UI: Tailwind + Radix UI components (`client/src/components/ui/*`)
  - Toasts are dismissible and auto‑hide quickly to avoid blocking UI
  - Confirm dialog: `client/src/components/ui/confirm-dialog.tsx` — centered modal with portal + overlay; use to confirm destructive or sensitive actions (e.g., logout)

---

## Backend
Express server with JSON + URL‑encoded middleware, logging, and Vite middleware in dev.

Base URL: `http://localhost:5173` in dev (server and client share port via Vite middleware).

### Auth
- `GET /api/auth/me` → current user; 401 if not logged in
- `POST /api/auth/register` `{ name, email, password }` → creates user, sets `sid` cookie
- `POST /api/auth/login` `{ email, password }` → logs in, sets `sid` cookie
- `POST /api/auth/logout` → clears session cookie

Seeded admin credentials (also seeded into Postgres when using `npm run db:seed`):
- Email: `admin@lumiere.test`
- Password: `admin123`

### Products
- `GET /api/products` → list products
- `GET /api/products/:id` → get product
- `POST /api/products` → create product (Zod validated)
- `GET /api/search?q=...` → search products (name, description, material, category with boosts)

### Orders
- `GET /api/orders` → list orders
- `GET /api/orders/:id` → get order by id
- `POST /api/orders` → create order (Zod validated, totals in cents) — requires a logged‑in user (session cookie)
- `PATCH /api/orders/:id/status` `{ status }` → update status

### Admin
- `GET /api/admin/summary` → requires admin; returns `{ products, orders, revenue }`

### Payment (Simulated)
- `POST /api/payment/simulate` `{ amount, orderId }` → 95% success, latency ~1.5s

Sessions: HTTP‑only `sid` cookie (`SameSite=Lax`, path `/`). When `DATABASE_URL` is set, sessions are stored in the `sessions` table (Postgres). Otherwise, sessions are stored in an in‑memory map `sid -> userId`.

Static assets: `/assets/*` mapped to `attached_assets/`.

---

## Data Model (shared/schema.ts)
TypeScript types and Zod insert schemas are defined and used with Postgres when configured.

- User: `{ id, name, email, passwordHash, role, createdAt }`
  - Insert: `{ name, email, role? } & { password }`
- Product: `{ id, name, description, price (cents), category, imageUrl, images[], material, isPreOrder, inStock, sizes?[] }`
- Order: `{ id, customerName, customerEmail, customerPhone, shippingAddress, shippingCity, shippingPostalCode, shippingCountry, items (JSON string), totalAmount (cents), status, isPreOrder, paymentStatus, createdAt }`
- Session: `{ id (sid), userId, createdAt }`; persisted in Postgres when configured, otherwise stored in memory

Currency: All monetary values are stored in IDR cents. Format on the client via `Intl.NumberFormat("id-ID")`.

---

## ERD Cheat Sheet (for ERD Owners)
The implementation supports both in‑memory and Postgres stores. Relationships are mostly logical (no FKs yet). Use this as guidance when drawing an ERD.

Mermaid (conceptual):
```mermaid
erDiagram
  USER ||--o{ ORDER : places
  ORDER }o--o{ PRODUCT : contains
  USER ||--o{ SESSION : has

  USER {
    string id
    string name
    string email
    string role
    date createdAt
  }
  PRODUCT {
    string id
    string name
    string description
    int price_cents
    string category
    string material
    bool inStock
  }
  ORDER {
    string id
    string customerName
    string customerEmail
    string shippingAddress
    string shippingCity
    string shippingPostalCode
    string shippingCountry
    json items
    int totalAmount_cents
    string status
    string paymentStatus
    date createdAt
  }
  SESSION {
    string sid
    string userId
  }
```

Notes for ERD:
- Orders currently embed `items` as JSON; there is no `order_items` table. When normalizing, introduce `ORDER_ITEM` with FK(`order_id`) and FK(`product_id`).
- Sessions can be persisted (when using Postgres) via `sessions` and relate to `USER`.
- A `cart_items` schema exists for future use but is not wired in the current app flow.

## API Examples
```zsh
# Get current user
curl -i http://localhost:5173/api/auth/me

# Register
curl -i -X POST http://localhost:5173/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"name":"Jane","email":"jane@test","password":"secret"}'

# Login
curl -i -X POST http://localhost:5173/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@lumiere.test","password":"admin123"}'

# Products
curl -s http://localhost:5173/api/products | jq '.[0]'

# Search
curl -s "http://localhost:5173/api/search?q=ring"
```

---

## Flowchart and DFD Guide (for Documentation Owners)
This section helps teammates create clear system flowcharts and Data Flow Diagrams (DFDs). Use it as a checklist and source of truth for entities, processes, data stores, and flows. Mermaid samples are included; render them in tools that support Mermaid (e.g., GitHub, VS Code extensions, Mermaid Live Editor).

### System Flowchart (High‑level)
- Start → User opens web app → Frontend loads via Vite/static
- User actions: Browse products → Add to cart → Checkout form → Simulated payment → Order created
- Auth required for: Add to Cart and Checkout. Register/Login also grants access to admin summary (if role = admin).

Mermaid (system request/response flow):
```mermaid
flowchart TD
  A[Browser UI] -->|HTTP GET| B[/Express Server/]
  B -->|Serves| C[Client index.html + JS]
  A -->|XHR: /api/products| D[(DB: Products)]
  A -->|XHR: /api/search| D
  A -->|XHR: /api/auth/*| E[(DB: Users & Sessions)]
  A -->|POST: /api/orders| F["DB: Orders (auth)"]
  A -->|POST: /api/payment/simulate| G{{Payment Simulator}}
  G -->|status| A
```

### DFD — Context Diagram (Level 0)
- External Entities: Customer/User, Admin
- System: JewelCommerce
- Data Stores: Products, Orders, Users, Sessions (Postgres when configured; memory otherwise)

Mermaid (context):
```mermaid
flowchart LR
  extUser[Customer/User]
  extAdmin[Admin]
  subgraph System[JewelCommerce]
    procAPI[/REST API/]
    storeP[(Products)]
    storeO[(Orders)]
    storeU[(Users)]
    storeS[(Sessions)]
  end
  extUser -->|Browse/Search, Auth, Order| procAPI
  extAdmin -->|Auth, Admin Summary| procAPI
  procAPI --> storeP
  procAPI --> storeO
  procAPI --> storeU
  procAPI --> storeS
  procAPI -->|JSON responses| extUser
  procAPI -->|JSON responses| extAdmin
```

### DFD — Level 1 (Decomposition)
Define core processes with input/output and stores.

Processes
1. Browse Products (`GET /api/products`, `/api/products/:id`)
2. Search Products (`GET /api/search?q`)
3. Manage Cart (client‑side only; localStorage)
4. Authenticate User (`/api/auth/*`)
5. Create Order (`POST /api/orders`)
6. Simulate Payment (`POST /api/payment/simulate`)
7. Admin Summary (`GET /api/admin/summary`)
8. Update Order Status (`PATCH /api/orders/:id/status`)

Data Stores
- D1 Products
- D2 Orders
- D3 Users
- D4 Sessions

Mermaid (level 1 sketch):
```mermaid
flowchart TB
  U[User]
  A[Admin]
  P1["1. Browse Products"]
  P2["2. Search Products"]
  P3["3. Manage Cart (client)"]
  P4["4. Authenticate"]
  P5["5. Create Order"]
  P6["6. Simulate Payment"]
  P7["7. Admin Summary"]
  P8["8. Update Order Status"]

  D1[(Products)]
  D2[(Orders)]
  D3[(Users)]
  D4[(Sessions)]

  U --> P1 --> D1 --> P1 --> U
  U --> P2 --> D1 --> P2 --> U
  U --> P3
  U --> P4 --> D3
  P4 --> D4
  U --> P5 --> D2 --> U
  P5 --> P6 --> U
  A --> P7 --> D1
  P7 --> D2
  A --> P8 --> D2
```

### Data Dictionary (for DFD)
- Product: `id, name, description, price_cents, category, imageUrl, images[], material, isPreOrder, inStock, sizes?[]`
- Order: `id, customerName, customerEmail, customerPhone, shippingAddress, shippingCity, shippingPostalCode, shippingCountry, items(JSON), totalAmount_cents, status, isPreOrder, paymentStatus, createdAt`
- User: `id, name, email, passwordHash, role, createdAt`
- Session: `sid, userId, createdAt` (persisted in DB when configured)

### Diagramming Tips
- Keep context diagram to 2 external entities and 4 data stores
- Use numbered processes in Level 1 and match them to endpoints/components
- Show client‑only cart as a process without a server data store
- When `DATABASE_URL` is set, treat stores as DB‑backed (PostgreSQL)

---

## Conventions & Notes
- Price values are in cents; client formats to IDR
- Images under `attached_assets/generated_images/*` are served via `/assets/*`
- Validation: Zod schemas from `shared/schema.ts` used server‑side and for form schemas client‑side
- Error handling: server returns JSON `{ message, ... }` with appropriate status codes

## Deployment
- Build via `npm run build` → outputs `dist/` with `dist/public` for client and bundled server entry
- Run with `NODE_ENV=production node dist/index.js` (already wired in `npm start`)
- `PORT` env var can override the default `5173`

## Roadmap (Optional)
- Normalize schema: add `order_items`, FKs, indexes
- JWT or encrypted cookie sessions
- Payment gateway integration
- E2E tests (Playwright) and API tests

---

## Contributors
Group 1:
- Reynaldi Siregar
- Arif Maulana
- R Muhammad Haris
- Aji malela
- Ardika Zaki
- Teuku Rifky

---

## License
MIT
