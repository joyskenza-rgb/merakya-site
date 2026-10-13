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

## Environment variables (Vercel → Settings → Environment Variables)
| Name | Required | Value |
|---|---|---|
| `STRIPE_SECRET_KEY` | yes | `sk_live_…` (Stripe → Developers → API keys) |
| `RESEND_API_KEY` | yes | `re_…` (resend.com → API Keys) |
| `MAIL_FROM` | after domain verified | `MERAKYA <contact@merakyalab.app>` |
| `STRIPE_WEBHOOK_SECRET` | recommended | `whsec_…` (see below) |
| `ORDER_NOTIFICATION_EMAIL` | optional | defaults to `joys.kenza@gmail.com` |
| `VITE_STRIPE_PUBLIC_KEY` | optional | the live `pk_live_…` key is already built in |

Redeploy after adding variables.

### Stripe webhook
Stripe → Developers → Webhooks → Add endpoint `https://merakyalab.com/api/stripe-webhook`, event `checkout.session.completed`, then copy the signing secret into `STRIPE_WEBHOOK_SECRET`.

### Resend
Until `merakyalab.app` is verified in Resend (Domains → add the DNS records), Resend only delivers to the email address of the Resend account itself — so sign up to Resend with joys.kenza@gmail.com and order notifications work immediately; customer confirmation emails start once the domain is verified and `MAIL_FROM` is set.
