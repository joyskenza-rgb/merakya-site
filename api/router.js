// Single Vercel Serverless Function serving every /api/* route (Hobby plan: max 12 functions).
// vercel.json rewrites /api/<path> → /api/router?path=<path>. Handlers live in api/_routes (not deployed separately).
import stripeConfig from "./_routes/stripe-config.js";
import createCheckoutSession from "./_routes/create-checkout-session.js";
import createPaymentIntent from "./_routes/create-payment-intent.js";
import sendOrderConfirmation from "./_routes/send-order-confirmation.js";
import notify from "./_routes/notify.js";
import stripeWebhook from "./_routes/stripe-webhook.js";
import generateImage from "./_routes/generate-image.js";
import bmceCatalog from "./_routes/bmce/catalog.js";
import bmceCoupon from "./_routes/bmce/coupon.js";
import bmceValidate from "./_routes/bmce/validate.js";
import bmceOrder from "./_routes/bmce/order.js";
import bmceConfirm from "./_routes/bmce/confirm.js";
import bmceAdmin from "./_routes/bmce/admin.js";

const ROUTES = {
  "stripe-config": stripeConfig,
  "create-checkout-session": createCheckoutSession,
  "create-payment-intent": createPaymentIntent,
  "send-order-confirmation": sendOrderConfirmation,
  "notify": notify,
  "stripe-webhook": stripeWebhook,
  "generate-image": generateImage,
  "bmce/catalog": bmceCatalog,
  "bmce/coupon": bmceCoupon,
  "bmce/validate": bmceValidate,
  "bmce/order": bmceOrder,
  "bmce/confirm": bmceConfirm,
  "bmce/admin": bmceAdmin,
};

// Stripe webhook signature needs the raw body, so Vercel must not pre-parse it.
// Other routes parse JSON themselves via body() in _lib/shared.js.
export const config = { api: { bodyParser: false } };

function routeOf(req) {
  let p = req.query && req.query.path;
  if (Array.isArray(p)) p = p.join("/");
  if (!p) p = String(req.url || "").split("?")[0].replace(/^\/api\/?/, "");
  return String(p).replace(/^\/+|\/+$/g, "").toLowerCase();
}

async function readJson(req) {
  const chunks = [];
  for await (const c of req) chunks.push(typeof c === "string" ? Buffer.from(c) : c);
  const raw = Buffer.concat(chunks).toString("utf8");
  try { return raw ? JSON.parse(raw) : {}; } catch { return {}; }
}

export default async function handler(req, res) {
  const route = routeOf(req);
  const fn = ROUTES[route];
  if (!fn) return res.status(404).json({ error: "NOT_FOUND", route });
  if (route !== "stripe-webhook" && req.method === "POST") {
    const parsed = await readJson(req);
    Object.defineProperty(req, "body", { value: parsed, writable: true, configurable: true });
  }
  return fn(req, res);
}
