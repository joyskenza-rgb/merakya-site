# MERAKYA – merakyalab.com (production build + Vercel API)

## Structure
- `index.html`, `assets/` – compiled storefront (Vite/React)
- `api/` – Vercel serverless functions (Node 18+)
  - `stripe-config` – publishable key for the front end
  - `create-checkout-session` – Stripe Checkout for card orders
  - `create-payment-intent` – admin-panel Stripe test
  - `send-order-confirmation` – COD + card orders → email to owner + customer
  - `notify` – contact form, newsletter, new customer accounts → email to owner
  - `stripe-webhook` – verified "payment received" email (optional, recommended)
  - `generate-image` – disabled (the original AI image tool isn't part of this export)

## Deploy (GitHub → Vercel)
Import the repo in Vercel: Framework Preset = **Other**, Build Command = *(empty)*, Output Directory = `.`
Vercel installs `stripe` from `package.json` automatically.

## BMCE landing page — merakyalab.com/BMCE
- Page: `bmce/index.html` (images in `bmce/img/`). `/BMCE`, `/bmce`, `/Bmce` all work.
- API: `api/bmce/*` — `coupon` (BIN check + unique code by email), `validate` (code at checkout), `order` (COD / Stripe), `confirm` (Stripe return), `catalog`, `admin` (CSV export).
- **Catalogue, prices and stock:** `api/_lib/catalog.js` (one file). `stock: null` = not counted yet (unlimited); set a number to enforce it — units sold on /BMCE are deducted automatically. `available: false` = "À venir" (no buy button). After editing, run `node tools/sync-catalog.mjs` to refresh the page's offline copy.
- **BIN list:** `api/_lib/bmce.js` → `BMCE_BINS`.
- **Coupon rules:** one active code per e-mail, valid 30 days, single use, tied to that e-mail. Re-requesting while a code is active re-sends the same code. New code allowed once the previous one is used or expired.
- **Export of all codes:** `https://merakyalab.com/api/bmce/admin?key=YOUR_BMCE_ADMIN_KEY` (CSV: code, e-mail, status, dates, order).

## Environment variables (Vercel → Settings → Environment Variables)
| Name | Required | Value |
|---|---|---|
| `STRIPE_SECRET_KEY` | yes | `sk_live_…` (Stripe → Developers → API keys) |
| `RESEND_API_KEY` | yes | `re_…` (resend.com → API Keys) |
| `MAIL_FROM` | after domain verified | `MERAKYA <contact@merakyalab.app>` |
| `STRIPE_WEBHOOK_SECRET` | recommended | `whsec_…` (see below) |
| `KV_REST_API_URL` + `KV_REST_API_TOKEN` | yes (BMCE) | added automatically when you connect **Upstash Redis** (Vercel → Storage → Marketplace → Upstash → Redis → connect to this project). `UPSTASH_REDIS_REST_URL/TOKEN` also accepted |
| `BMCE_ADMIN_KEY` | recommended | any long secret phrase — protects the CSV export |
| `BMCE_NOTIFY_OWNER` | optional | set to `0` to stop the "code émis" e-mail you receive for each new code |
| `SITE_URL` | recommended | `https://merakyalab.com` (used in e-mail links) |
| `ORDER_NOTIFICATION_EMAIL` | optional | defaults to `joys.kenza@gmail.com` |
| `VITE_STRIPE_PUBLIC_KEY` | optional | the live `pk_live_…` key is already built in |

Redeploy after adding variables.

### Stripe webhook
Stripe → Developers → Webhooks → Add endpoint `https://merakyalab.com/api/stripe-webhook`, event `checkout.session.completed`, then copy the signing secret into `STRIPE_WEBHOOK_SECRET`.

### Resend
Until `merakyalab.app` is verified in Resend (Domains → add the DNS records), Resend only delivers to the email address of the Resend account itself — so sign up to Resend with joys.kenza@gmail.com and order notifications work immediately; customer confirmation emails start once the domain is verified and `MAIL_FROM` is set.
