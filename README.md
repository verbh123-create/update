# Street Taste Truck — Bahrain 🇧🇭

Full-stack ordering platform for a dual-concept food truck (**Beverage Truck** + **Food Truck**):
customer storefronts, POS terminals, kitchen displays (KDS), per-truck admin panels and a global super-admin command center.
Built with **Next.js (App Router) · TypeScript · Tailwind CSS 4 · Drizzle ORM · PostgreSQL (Neon-ready) · Resend**.

## Quick start

```bash
cp .env.example .env        # set DATABASE_URL (+ RESEND_API_KEY, AUTH_SECRET for production)
npm install
npx drizzle-kit push        # creates all tables
npm run build && npm start  # first request seeds trucks, menu, regions, staff accounts
```

### Deploying to Vercel + Neon
1. Create a Neon database and copy its connection string into the Vercel env var `DATABASE_URL`.
2. Add `RESEND_API_KEY` (and optionally `RESEND_FROM_EMAIL`, e.g. `Street Taste <orders@yourdomain.com>`), plus a long random `AUTH_SECRET`.
3. Run `DATABASE_URL=<neon url> npx drizzle-kit push` once (or set the Vercel build command to `npx drizzle-kit push && next build`).
4. Deploy. Uploaded images are stored in PostgreSQL (`/api/assets/:id`), so no file storage is required.

> Without `RESEND_API_KEY` the sign-up / password-reset OTP is shown on screen as a demo code. Always set the key in production.

## Hidden routes (never linked from public pages)

| Route | Purpose | Initial login |
|---|---|---|
| `/` | Landing (two truck cards, Google Map, WhatsApp) | public |
| `/beverage` · `/food` | Customer storefronts | public |
| `/pos/beverage` · `/pos/food` | Walk-in POS terminals | staff with `pos` permission (or super admin) |
| `/kitchen/beverage` | Beverage KDS | `beverage` / `12345678` |
| `/kitchen/food` | Food KDS | `kitchen` / `12345678` |
| `/admin/beverage` · `/admin/food` | Single-truck admin | staff with admin permissions (or super admin) |
| `/admin/global` | Super admin command center | `ahmad` / `Verde@123` (protected account) |

Change the seeded passwords after the first login (Super Admin → Employees & POS roles).

## Feature map

* **Dynamic assets** – every logo, hero background, truck card, product photo, category icon, ingredient image, banner and BenefitPay QR is uploaded with a file picker.
* **Master text engine** – every customer / POS / kitchen sentence (EN + AR, RTL/LTR) is editable under *Texts*; nothing user-facing is hard-coded.
* **5 themes** – Neon Night (default), Cyber Midnight, Warm Street Gourmet, Minimal Luxe, Vibrant Foodie (Super Admin → Themes).
* **Storefront** – guest or registered ordering, Resend OTP sign-up, password recovery, default + temporary delivery address, timed categories, spicy/fresh tags, ingredient customizers, coupons, loyalty (buy 10 → 11th free; master switch), independent delivery slots, strict hours / closed-day guardrails.
* **Subscriptions** – any items across the full menu, date range, delivery days, auto discount (default 10 %), closed weekdays can’t be scheduled, closed dates are skipped.
* **Grace periods** – direct orders editable/cancellable for 1 minute; subscription deliveries up to 1 hour before delivery (both configurable).
* **KDS** – `NOT_READY → COMPLETED` (immutable), 3-minute alerts for direct orders, 5-minute alerts for subscription orders starting 1 hour before delivery, unified or split view.
* **Payments** – Cash, BenefitPay (QR + IBAN, manual verification) and Cards / Apple Pay / Google Pay via a Gulf gateway (Tap Payments or MyFatoorah). Card orders reach the kitchen only after the gateway webhook confirms payment (`/api/payments/webhook/<truck>`; the charge is re-verified server-side with the secret key).
* **Admin** – live orders with sound alerts, driver assignment & commissions, driver reports, weekly “Paid to Driver” payouts, sales reports with Excel / PDF export, menu & stock, hours / split shifts / closures / delivery slots, regions & fees, coupons & banners, CRM with password resets, RBAC employees.

## Security notes
* Passwords are hashed with scrypt; sessions are HMAC-signed httpOnly cookies; login / OTP endpoints are rate-limited.
* The `ahmad` super admin is protected: it cannot be deleted, demoted, deactivated or have its password changed by anyone else.
* Gateway secret keys are never sent back to the browser (masked) and the webhook payload is never trusted without re-fetching from the gateway.
