# Haat: multi-vendor marketplace server

Express + EJS panels + MongoDB + Redis + Razorpay. API-first, so the React / React Native storefront plugs into `/api/v2` without touching the server.

## Run it
```bash
npm install
cp .env.example .env          # fill MONGO_URI, JWT_SECRET, Razorpay keys (REDIS_URL optional)
npm run seed:admin            # first admin (ADMIN_EMAIL / ADMIN_PASSWORD from .env)
npm run indexes               # once per deploy in production (autoIndex is off there)
npm run dev
```
Open `http://localhost:3000/login`. Admin tab -> onboard stores (Mx) and delivery partners (DP) from **Partners**. Configure `APP_URL` and the `SMTP_*` values to enable five-minute password reset links for non-admin accounts; admins can create users, set passwords, and change roles from **Customers**.

**Razorpay webhook:** dashboard -> Webhooks -> `https://YOUR_HOST/api/v2/payments/webhook`, secret = `RAZORPAY_WEBHOOK_SECRET`, events `payment.captured`, `order.paid`, `refund.processed`.

## Roles
| Role | How created | Can do |
|---|---|---|
| `admin` | `npm run seed:admin` | Everything: onboarding, user creation/role/password management, any store/product/order, dispatch, recycle bin |
| `mx` | Onboarded by admin | Only their own store, products, orders |
| `dp` | Onboarded by admin | Only orders assigned to them (pick up, deliver) |
| `cx` | Self-register | Own profile and orders, pay, cancel, return |

## API (`/api/v2`, JSON `{ success, data | message }`)
| Area | Endpoints |
|---|---|
| Open | `GET /products` (`q, store, category, min, max, sort, page, limit`), `GET /products/:idOrSlug`, `GET /stores`, `GET /stores/:idOrSlug` |
| Auth | `POST /auth/register` (cx), `POST /auth/login`, `POST /auth/logout`, `GET/PATCH /auth/me`, `POST /auth/password-reset/request`, `POST /auth/password-reset/confirm` (non-admin; SMTP required; five-minute, one-use link) |
| Admin | `POST /admin/login`, `GET /admin/stats`, `GET /admin/notifications`, `POST /admin/users`, `PATCH /admin/users/:id` (role/password), `POST /admin/onboard/mx`, `POST /admin/onboard/dp`, `GET /admin/{users,stores,products,orders}`, `PATCH /admin/{stores,products}/:id`, `PATCH /admin/orders/:id/{assign,status}`, `DELETE /admin/:model/:id` (soft), `GET /admin/recycle/:model`, `POST /admin/recycle/:model/:id/restore` |
| Mx | `GET/PATCH/DELETE /mx/store`, `GET /mx/stats`, `GET/POST /mx/products`, `PATCH/DELETE /mx/products/:id`, `GET /mx/recycle`, `POST /mx/recycle/:id/restore`, `GET /mx/orders`, `PATCH /mx/orders/:id/status` |
| DP | `GET /dp/orders?scope=active\|done`, `PATCH /dp/orders/:id/status`, `PATCH /dp/availability` |
| Cx orders | `POST /orders`, `GET /orders`, `GET /orders/:idOrNo`, `GET /orders/:id/payment`, `POST /orders/:id/cancel`, `POST /orders/:id/return` |
| Payments | `POST /payments/verify`, `POST /payments/webhook` |

Money is always **integer paise**. Send `Authorization: Bearer <token>` (React Native) or rely on the httpOnly cookie plus the `X-Requested-With: XMLHttpRequest` header (web).

### Storefront checkout flow (React)
1. `POST /orders` with `{ storeId, items:[{productId, qty}], address }` -> returns `order` and `payment` params.
2. Open Razorpay Checkout with `payment.keyId`, `payment.razorpayOrderId`, `payment.amount`.
3. In the success handler, `POST /payments/verify` with the three `razorpay_*` fields. The webhook confirms it even if the tab closes.
4. Unpaid orders are cancelled and stock is released after `PENDING_ORDER_TTL_MIN` minutes.

## Design decisions
- **Nothing is hard-deleted.** A Mongoose plugin adds `isDeleted/deletedAt/deletedBy/deleteReason`, hides deleted records from every query and aggregation, and **blocks** `deleteOne/deleteMany/findOneAndDelete`. Removing a store cascades its products into the bin; restoring brings them back unlisted. Permanent deletion is only possible manually in the database.
- **Orders are snapshots.** Item name, price, image, SKU, store, customer and partner details are copied at purchase time, so delivery, returns and replacements still work after a product is unlisted or a store is removed.
- **Oversell-proof stock.** Order creation runs in a transaction with an atomic `stock >= qty` decrement. Cancels and accepted returns put stock back.
- **Redis is optional.** It provides version-keyed response caching (one `INCR` invalidates a whole namespace), token revocation on logout, shared rate limits and a job lock. Without it the app continues with MongoDB and per-process rate limits; run one app instance so scheduled cleanup is not duplicated. Admins see Redis status in **Notifications**.
- **Security:** helmet with nonce CSP, bcrypt, JWT in httpOnly cookie, login rate limits, CSRF header guard, zod validation on every write, filters that accept only strings (no operator injection), Razorpay HMAC checks on both callback and webhook, role-scoped order lookup.
- **Scaling path:** stateless app (scale horizontally), indexes on every hot query, versioned `/api/v2`. Cursor pagination, a job queue (BullMQ) and multi-store carts are the natural next steps.
