# Seere Yaana E-commerce Architecture

## 1) Runtime Topology

- Web Client: Next.js (App Router) + Tailwind CSS
- API Service: Express + Prisma
- Database: PostgreSQL
- Object Storage: Cloudinary signed uploads and WebP output
- Payment Gateway: Razorpay Standard Checkout

## 2) Service Boundaries

- `apps/web`
  - Luxury storefront and payment initiation UI
  - Mobile-first `/admin` screen for quick catalog operations
  - Isolated API client (`lib/api.ts`) to keep components portable to React Native/Capacitor
- `apps/api`
  - Product, inventory, checkout, payment verification, webhook ingestion
  - Centralized payment trust boundary and signature verification
  - Data persistence through Prisma

## 3) Core Payment Sequence

1. Client calls API to create order.
2. API computes authoritative amount from DB and creates Razorpay order.
3. Client opens Razorpay checkout with returned order id.
4. Razorpay callback is verified at `/api/payments/razorpay/verify`.
5. Webhook listener updates order status on `payment.captured` and `order.paid`.
6. Order state converges even if customer closes browser.

## 4) Security Controls

- Order amount never trusted from client.
- Checkout signature verification for callback payload.
- Webhook HMAC validation with constant-time compare.
- Admin endpoints protected by bearer token middleware.
- Mobile admin route protected with Next middleware cookie gate.

## 5) Scalability and Ops

- Stateless app containers and Postgres volume persistence.
- Read/compute logic in API supports future native clients.
- Compose can be migrated to orchestrators with separate replicas for web/api.
- Image payload reduced via WebP upload format for lower mobile bandwidth.
