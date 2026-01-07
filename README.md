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
- **User Dashboard**: View account info, recent orders, and quick actions
- **Purchase History**: Complete order history with receipt downloads for users
- **Receipt Generator**: HTML receipts with order details, items, and print functionality
- **Admin Dashboard**: 
  - Product management (CRUD operations)
  - Order management with status updates (pending → processing → completed)
  - Sales analytics with interactive charts
- **Secure Account Deletion**: Multi-step confirmation with lockout protection

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

For production: Set `JWT_SECRET` environment variable for secure JWT token signing:

```zsh
export JWT_SECRET="your-secure-random-secret-key"
```

Notes:
- By default the app uses in‑memory storage; when `DATABASE_URL` is present it automatically uses PostgreSQL.
- Static product images now live in `client/public` and are served from the web root, e.g. `/Rose_gold_diamond_ring_406b3b84.png`.

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
client/public/    # Static images (served at `/<filename>`)
```

Path aliases (see `vite.config.ts`): `@` -> `client/src`, `@shared` -> `shared`.
Static assets: files in `client/public` are served from the root path (e.g., `/image.png`).

---

## Frontend
- Router: paths defined in `client/src/App.tsx`
  - `/` Home
  - `/products` Product listing (supports `?category=...`)
  - `/product/:id` Product detail
  - `/checkout` Checkout (requires login)
  - `/order-success` Order success with link to purchase history
  - `/login`, `/register`
  - `/dashboard` User dashboard with order summary
  - `/purchase-history` User's complete order history with receipt downloads
  - `/admin` Admin dashboard with product, order, and sales management
  - `/admin/orders` Full order management with status controls
  - `/admin/products/new` Create new product
  - `/admin/products/:id/edit` Edit existing product
- State:
  - Cart: `CartProvider` in `client/src/lib/cart-context.tsx` (localStorage persistence; add‑to‑cart and checkout are auth‑gated)
  - Auth: `AuthProvider` in `client/src/lib/auth-context.tsx` (cookie session; `token`) — supports `returnTo` redirect on login/register
  - Data fetching: React Query (`client/src/lib/queryClient.ts`)
- UI: Tailwind + Radix UI components (`client/src/components/ui/*`)
  - Fully responsive design optimized for mobile, tablet, and desktop
  - Toasts are dismissible and auto‑hide quickly to avoid blocking UI
  - Confirm dialog: `client/src/components/ui/confirm-dialog.tsx` — centered modal with portal + overlay; use to confirm destructive or sensitive actions (e.g., logout)
  - Modal overlays for order details and receipt viewing

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
- `GET /api/orders` → list all orders (admin only)
- `GET /api/orders/:id` → get order by id
- `GET /api/user/orders` → get orders for logged-in user (requires auth)
- `POST /api/orders` → create order (Zod validated, totals in cents) — requires a logged‑in user (session cookie)
- `PATCH /api/orders/:id/status` `{ status }` → update order status (admin only)

### Receipts
- `POST /api/receipt/generate` `{ orderId }` → generate HTML receipt (requires auth; users can only access their own receipts, admins can access all)

### Admin
- `GET /api/admin/summary` → requires admin; returns `{ products, orders, revenue }`
- `GET /api/admin/sales?period=week|month|quarter` → sales data for charts (admin only)

### Account Management
- `POST /api/account/delete` `{ password, confirm: "DELETE" }` → delete user account with rate limiting and lockout protection (requires auth, not allowed for admins)

### Payment (Simulated)
- `POST /api/payment/simulate` `{ amount, orderId }` → 95% success, latency ~1.5s

Sessions: HTTP‑only JWT token cookie (`token`, `SameSite=Lax`, path `/`). Session cookies expire when the browser is closed (auto logout). Set `JWT_SECRET` environment variable in production for secure token signing.

Static assets: files in `client/public` are served from the root path (`/`).

### User Flow
1. **Browse & Shop**: Users can browse products without authentication
2. **Authentication Required**: Login/register required for cart and checkout
3. **Checkout**: Multi-step form with shipping details and simulated payment
4. **Order Confirmation**: Success page with link to purchase history
5. **Purchase History**: View all orders with details and download receipts
6. **Account Management**: View dashboard, manage orders, or delete account

### Admin Flow
1. **Product Management**: Create, edit, delete, and preview products
2. **Order Management**: 
   - View all customer orders with filtering (all/pending/processing/completed/cancelled)
   - Update order status with action buttons:
     - Pending orders → Start Processing
     - Processing orders → Mark as Completed
     - Active orders → Cancel Order
3. **Sales Analytics**: View revenue trends with interactive charts (week/month/quarter)

---

## Data Model (shared/schema.ts)
TypeScript types and Zod insert schemas are defined and used with Postgres when configured.

- User: `{ id, name, email, passwordHash, role, createdAt }`
  - Insert: `{ name, email, role? } & { password }`
- Product: `{ id, name, description, price (cents), category, imageUrl, images[], material, isPreOrder, inStock, sizes?[] }`
  - Foreign Keys: None
  - Indexes: `category`, `inStock`
- Order: `{ id, userId, customerName, customerEmail, customerPhone, shippingAddress, shippingCity, shippingPostalCode, shippingCountry, totalAmount (cents), status, isPreOrder, paymentStatus, createdAt }`
  - Foreign Keys: `userId -> users.id` (cascade delete)
  - Indexes: `userId`, `createdAt`, `status`
- OrderItem: `{ id, orderId, productId, productName, productPrice (cents), quantity, size }`
  - Foreign Keys: `orderId -> orders.id` (cascade delete), `productId -> products.id`
  - Indexes: `orderId`, `productId`
  - Note: Product name and price are snapshotted at time of order
- CartItem: `{ id, productId, quantity, size, userId }`
  - Foreign Keys: `productId -> products.id` (cascade delete), `userId -> users.id` (cascade delete)
  - Indexes: `userId`, `productId`
- Session: `{ id (sid), userId, createdAt }` (persisted in Postgres when configured; JWT tokens used for authentication)
  - Foreign Keys: `userId -> users.id` (cascade delete)
  - Indexes: `userId`

Currency: All monetary values are stored in IDR cents. Format on the client via `Intl.NumberFormat("id-ID")`.

**Authentication**: Sessions use JWT tokens (HttpOnly cookie named `token`) with encrypted payloads. Set `JWT_SECRET` environment variable for production. Session cookies expire when browser closes (users must login on each visit).

---

## ERD Cheat Sheet (for ERD Owners)
The implementation uses a normalized schema with foreign keys and indexes. Relationships are enforced via Drizzle ORM.

Mermaid (conceptual):
```mermaid
erDiagram
  USER ||--o{ ORDER : places
  USER ||--o{ CART_ITEM : has
  USER ||--o{ SESSION : has
  ORDER ||--o{ ORDER_ITEM : contains
  PRODUCT ||--o{ ORDER_ITEM : "ordered as"
  PRODUCT ||--o{ CART_ITEM : "in cart"

  USER {
    string id PK
    string name
    string email
    string passwordHash
    string role
    date createdAt
  }
  PRODUCT {
    string id PK
    string name
    string description
    int price_cents
    string category "idx"
    string material
    bool inStock "idx"
  }
  ORDER {
    string id PK
    string userId FK "idx, cascade"
    string customerName
    string customerEmail
    string shippingAddress
    string shippingCity
    string shippingPostalCode
    string shippingCountry
    int totalAmount_cents
    string status "idx"
    string paymentStatus
    date createdAt "idx"
  }
  ORDER_ITEM {
    string id PK
    string orderId FK "idx, cascade"
    string productId FK "idx"
    string productName
    int productPrice_cents
    int quantity
    string size
  }
  CART_ITEM {
    string id PK
    string productId FK "idx, cascade"
    string userId FK "idx, cascade"
    int quantity
    string size
  }
  SESSION {
    string sid PK
    string userId FK "idx, cascade"
    date createdAt
  }
```

Notes for ERD:
- Orders are now normalized with a separate `order_items` table linked via foreign keys
- Product name and price are snapshotted in `order_items` at time of purchase
- All foreign keys include appropriate cascade delete behavior
- Indexes are created on commonly queried fields (category, status, user relationships, etc.)
- Sessions table exists but JWT tokens are used for authentication (table kept for potential future audit trail)

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
- User actions: Browse products → Add to cart → Checkout form → Simulated payment → Order created → View purchase history → Download receipts
- Auth required for: Add to Cart, Checkout, and Purchase History. Register/Login also grants access to user dashboard and purchase history.
- Admin actions: Product CRUD → Order management (view all orders, update status) → Sales analytics

Mermaid (system request/response flow):
```mermaid
flowchart TD
  A[Browser UI] -->|HTTP GET| B[/Express Server/]
  B -->|Serves| C[Client index.html + JS]
  A -->|XHR: /api/products| D[(DB: Products)]
  A -->|XHR: /api/search| D
  A -->|XHR: /api/auth/*| E[(DB: Users & Sessions)]
  A -->|POST: /api/orders| F["DB: Orders (auth)"]
  A -->|GET: /api/user/orders| F
  A -->|POST: /api/receipt/generate| G[Receipt Generator]
  A -->|POST: /api/payment/simulate| H{{Payment Simulator}}
  A -->|PATCH: /api/orders/:id/status| F
  H -->|status| A
  G -->|HTML file| A
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
7. View User Orders (`GET /api/user/orders`)
8. Generate Receipt (`POST /api/receipt/generate`)
9. Admin Summary (`GET /api/admin/summary`)
10. Admin Order Management (`GET /api/orders`, `PATCH /api/orders/:id/status`)
11. Admin Sales Analytics (`GET /api/admin/sales`)
12. Delete Account (`POST /api/account/delete`)

Data Stores
- D1 Products
- D2 Orders & OrderItems
- D3 Users
- D4 Sessions
- D5 CartItems

Mermaid (level 1 sketch):
```mermaid
flowchart TB
  U[User]
  A[Admin]
  P1["1. Browse Products"]
  P2["2. Search Products"]
  P3["3. Manage Cart"]
  P4["4. Authenticate"]
  P5["5. Create Order"]
  P6["6. Simulate Payment"]
  P7["7. View User Orders"]
  P8["8. Generate Receipt"]
  P9["9. Admin Summary"]
  P10["10. Admin Order Mgmt"]
  P11["11. Admin Sales Analytics"]
  P12["12. Delete Account"]

  D1[(Products)]
  D2[(Orders)]
  D3[(Users)]
  D4[(Sessions)]
  D5[(CartItems)]

  U --> P1 --> D1 --> P1 --> U
  U --> P2 --> D1 --> P2 --> U
  U --> P3 --> D5
  U --> P4 --> D3
  P4 --> D4
  U --> P5 --> D2 --> U
  P5 --> P6 --> U
  U --> P7 --> D2 --> U
  U --> P8 --> D2 --> U
  A --> P9 --> D1
  P9 --> D2
  A --> P10 --> D2
  A --> P11 --> D2
  U --> P12 --> D3
  P12 --> D4
```

### Data Dictionary (for DFD)
- Product: `id, name, description, price_cents, category, imageUrl, images[], material, isPreOrder, inStock, sizes?[]`
- Order: `id, userId, customerName, customerEmail, customerPhone, shippingAddress, shippingCity, shippingPostalCode, shippingCountry, totalAmount_cents, status, isPreOrder, paymentStatus, createdAt`
- OrderItem: `id, orderId, productId, productName, productPrice_cents, quantity, size` (normalized order line items)
- User: `id, name, email, passwordHash, role, createdAt`
- Session: `sid, userId, createdAt` (table exists but JWT tokens used for auth)
- CartItem: `id, productId, userId, quantity, size` (persistent cart linked to user)

### Diagramming Tips
- Keep context diagram to 2 external entities and 4 data stores
- Use numbered processes in Level 1 and match them to endpoints/components
- Show client‑only cart as a process without a server data store
- When `DATABASE_URL` is set, treat stores as DB‑backed (PostgreSQL)

---

## Conventions & Notes
- Price values are in cents; client formats to IDR
- Images were migrated to `client/public` and are served directly at `/<filename>`
- Validation: Zod schemas from `shared/schema.ts` used server‑side and for form schemas client‑side
- Error handling: server returns JSON `{ message, ... }` with appropriate status codes
- Schema: Normalized with foreign keys and indexes; `order_items` table links orders to products
- Auth: JWT tokens (HttpOnly session cookie) that expire on browser close; users must login each visit; set `JWT_SECRET` in production
- **Mobile Responsive**: All pages are fully optimized for mobile, tablet, and desktop views
- **Receipt Format**: HTML receipts with print-ready styling, auto-opens print dialog on download
- **Order Status Flow**: pending → processing → completed (or cancelled at any active stage)
- **Security**: Rate limiting on account deletion (5 attempts max, 15-minute lockout), admin accounts cannot be deleted

## Deployment
- Build via `npm run build` → outputs `dist/` with `dist/public` for client and bundled server entry
- Run with `NODE_ENV=production node dist/index.js` (already wired in `npm start`)
- `PORT` env var can override the default `5173`

## Roadmap (Optional)
- Payment gateway integration
- Email notifications for order updates
- PDF receipt generation (currently HTML)
- Order tracking and shipping integration
- Product reviews and ratings
- Wishlist functionality

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
