# Seere Yaana Commerce Boilerplate

Minimalist-luxury boutique commerce stack with:
- Next.js + Tailwind frontend
- Express + Prisma + PostgreSQL backend
- Razorpay Orders API + webhook verification
- Mobile-first secure admin experience
- Docker Compose for one-command local bring-up

## Quick Start

1. Copy env file:
   ```bash
   cp .env.example .env
   ```
2. Start all services:
   ```bash
   docker compose up --build
   ```
   This uses the database name `seere_yaana_db`.
   API container runs `prisma db push` on startup to keep schema in sync.
3. API: http://localhost:4000
4. Web: http://localhost:3445
5. PostgreSQL host port: 5435

## Razorpay Reliability Notes

- Payments are initiated from server-created orders (`/api/payments/razorpay/order`).
- Webhook endpoint (`/api/webhooks/razorpay`) handles `payment.captured` and `order.paid`.
- Signature validation is enforced for both checkout callbacks and webhooks.

## Seamless User Login (SSO)

- Primary flow: mobile OTP sign-in
   - Request OTP with mobile number
   - Verify OTP and create user automatically if first-time
   - First-time mobile users complete profile on `/complete-profile`
- Auth is powered by NextAuth/Auth.js with Google, Facebook, and Apple providers.
- API route: `/api/auth/[...nextauth]`
- Custom sign-in page: `/login`
- Checkout is login-required; signed-out users are redirected to `/login` and then returned via `callbackUrl`.
- Populate provider credentials in `.env` from `.env.example`:
   - `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
   - `FACEBOOK_CLIENT_ID`, `FACEBOOK_CLIENT_SECRET`
   - `AUTH_APPLE_ID`, `AUTH_APPLE_SECRET`
   - `AUTH_SECRET`, `AUTH_URL`
   - `API_INTERNAL_URL`
- Mobile OTP settings:
   - `MOBILE_OTP_EXPIRY_MINUTES`
   - `MOBILE_OTP_BYPASS=true` (currently dev-only OTP mode)
- Homepage shows session state and checkout uses signed-in identity where available.

## Admin Mobile Workflow

- `/admin` route is guarded using cookie-based token middleware.
- Add item flow supports gallery/files/camera picker on mobile (no forced camera mode).
- Quick stock toggles let you switch between `IN_STOCK` and `SOLD_OUT` in one tap.
- Storage uses ImageKit for uploads and CDN delivery.
- Upload endpoint: `POST /api/admin/upload/imagekit` with multipart file field `image`.
- Backward-compatible alias: `POST /api/admin/upload/local` (now routes to ImageKit).
- Required env vars:
   - `IMAGEKIT_PUBLIC_KEY`
   - `IMAGEKIT_PRIVATE_KEY`
   - `IMAGEKIT_URL_ENDPOINT`
   - Optional: `IMAGEKIT_FOLDER`, `IMAGE_UPLOAD_WEBP_QUALITY`, `IMAGE_UPLOAD_MAX_BYTES` (default: 15728640 = 15 MB)

### Admin Access Using Mobile Login

Admin access is now tied to mobile OTP login.

1. Set admin mobiles in `.env`:
   ```dotenv
   ADMIN_MOBILE_NUMBERS=9999999999,8888888888
   ```
2. Login with OTP using one of those mobile numbers.
3. Open `/admin`.

When an allowed mobile user opens `/admin`, the app auto-creates an admin API session cookie and enables admin APIs.

### Color Variants and Notify-Me APIs

- Admin color management:
   - `POST /api/admin/products/:id/colors`
   - `PATCH /api/admin/products/:id/colors/:colorId/default`
   - `PATCH /api/admin/products/:id/colors/:colorId/stock`
- Public product detail (includes color variants and default color):
   - `GET /api/products/:id`
- Back-in-stock subscription (one per user per item+color):
   - `POST /api/products/:id/notify-me`
   - Body: `customerId`, `productColorId`
