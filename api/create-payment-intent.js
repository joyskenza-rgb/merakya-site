// Used by the admin panel "test Stripe" button.
import Stripe from "stripe";
import { allowMethods, body, clip, isEmail, RATES } from "./_lib/shared.js";

export default async function handler(req, res) {
  if (!allowMethods(req, res, ["POST"])) return;
  if (!process.env.STRIPE_SECRET_KEY) return res.status(500).json({ error: "STRIPE_SECRET_KEY_MISSING" });
  const b = body(req);
  const currency = RATES[b.currency] ? b.currency : "MAD";
  const amount = Math.min(1000, Math.max(1, Number(b.amount) || 150)); // capped: test only
  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const pi = await stripe.paymentIntents.create({
      amount: Math.round(amount * RATES[currency] * 100),
      currency: currency.toLowerCase(),
      receipt_email: isEmail(b.email) ? b.email : undefined,
      metadata: { purpose: "admin-test", customerName: clip(b.customerName, 200) },
      automatic_payment_methods: { enabled: true },
    });
    res.status(200).json({ clientSecret: pi.client_secret, id: pi.id });
  } catch (e) {
    res.status(500).json({ error: "STRIPE_ERROR", message: e.message });
  }
}
