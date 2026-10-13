// Optional but recommended: Stripe calls this when a card payment really succeeds,
// so you get a verified "payment received" email even if the customer closes the tab.
// Stripe Dashboard → Developers → Webhooks → endpoint https://merakyalab.com/api/stripe-webhook
// event: checkout.session.completed → copy the signing secret into STRIPE_WEBHOOK_SECRET.
import Stripe from "stripe";
import { rows, sendMail, OWNER_EMAIL } from "./_lib/shared.js";

export const config = { api: { bodyParser: false } };

async function rawBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(typeof c === "string" ? Buffer.from(c) : c);
  return Buffer.concat(chunks);
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET) return res.status(500).send("Stripe webhook not configured");
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  let event;
  try {
    event = stripe.webhooks.constructEvent(await rawBody(req), req.headers["stripe-signature"], process.env.STRIPE_WEBHOOK_SECRET);
  } catch (e) {
    return res.status(400).send(`Webhook Error: ${e.message}`);
  }
  if (event.type === "checkout.session.completed") {
    const s = event.data.object;
    const m = s.metadata || {};
    await sendMail({
      to: OWNER_EMAIL,
      replyTo: s.customer_details?.email || m.customerEmail || undefined,
      subject: `✅ Paiement Stripe confirmé — ${(s.amount_total / 100).toFixed(2)} ${String(s.currency).toUpperCase()}`,
      html: rows({
        "Session Stripe": s.id, Statut: s.payment_status,
        Montant: `${(s.amount_total / 100).toFixed(2)} ${String(s.currency).toUpperCase()}`,
        Client: m.customerName || s.customer_details?.name, Email: s.customer_details?.email || m.customerEmail,
        Téléphone: m.customerPhone, Adresse: m.customerAddress, Articles: m.items,
      }),
    });
  }
  res.status(200).json({ received: true });
}
