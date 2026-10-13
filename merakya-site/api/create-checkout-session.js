import Stripe from "stripe";
import { allowMethods, body, clip, isEmail, origin, normaliseCart, totalsMad, RATES, SHIPPING_MAD } from "./_lib/shared.js";

export default async function handler(req, res) {
  if (!allowMethods(req, res, ["POST"])) return;
  if (!process.env.STRIPE_SECRET_KEY) return res.status(500).json({ error: "STRIPE_SECRET_KEY_MISSING" });

  const b = body(req);
  const items = normaliseCart(b.cart);
  if (!items.length) return res.status(400).json({ error: "EMPTY_CART" });

  const currency = RATES[b.currency] ? b.currency : "MAD";
  const rate = RATES[currency];
  const toMinor = (mad) => Math.round(mad * rate * 100);
  const { shipping } = totalsMad(items);

  const meta = {
    customerName: clip(b.customerName, 200),
    customerEmail: clip(b.customerEmail, 200),
    customerPhone: clip(b.customerPhone, 60),
    customerAddress: clip(b.customerAddress, 450),
    items: clip(items.map((i) => `${i.quantity}x ${i.name}`).join(" | "), 480),
  };

  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const base = origin(req);
    const line_items = items.map((i) => ({
      quantity: i.quantity,
      price_data: { currency: currency.toLowerCase(), unit_amount: toMinor(i.priceMad), product_data: { name: i.name } },
    }));
    if (shipping > 0) {
      line_items.push({
        quantity: 1,
        price_data: { currency: currency.toLowerCase(), unit_amount: toMinor(SHIPPING_MAD), product_data: { name: "Livraison / Shipping" } },
      });
    }
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items,
      customer_email: isEmail(b.customerEmail) ? b.customerEmail : undefined,
      metadata: meta,
      payment_intent_data: { metadata: meta, receipt_email: isEmail(b.customerEmail) ? b.customerEmail : undefined },
      success_url: `${base}/?stripe_status=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${base}/?stripe_status=cancel`,
    });
    res.status(200).json({ url: session.url, id: session.id });
  } catch (e) {
    console.error("[checkout] Stripe error", e);
    res.status(500).json({ error: "STRIPE_ERROR", message: e.message });
  }
}
