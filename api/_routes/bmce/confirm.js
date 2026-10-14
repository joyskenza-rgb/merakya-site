// POST { session_id, action?: 'cancel' } — called by /BMCE when returning from Stripe.
import Stripe from "stripe";
import { allowMethods, body } from "../../_lib/shared.js";
import { finalizeStripeSession, getCoupon, markActive } from "../../_lib/bmce.js";

export default async function handler(req, res) {
  if (!allowMethods(req, res, ["POST"])) return;
  const b = body(req);
  const id = String(b.session_id || "");
  if (!/^cs_(live|test)_[A-Za-z0-9]+$/.test(id) || !process.env.STRIPE_SECRET_KEY) return res.status(400).json({ ok: false });
  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    let s = await stripe.checkout.sessions.retrieve(id);
    if (s.metadata?.bmce !== "1") return res.status(400).json({ ok: false });
    if (s.payment_status === "paid") {
      const r = await finalizeStripeSession(s);
      return res.status(200).json({ ok: true, paid: true, orderId: r.orderId, total: s.amount_total / 100, code: Boolean(s.metadata?.code) });
    }
    if (b.action === "cancel") {
      if (s.status === "open") s = await stripe.checkout.sessions.expire(id).catch(() => s);
      const code = s.metadata?.code;
      if (code) { const c = await getCoupon(code); if (c && c.status === "pending" && c.sessionId === id) await markActive(c); }
      return res.status(200).json({ ok: true, paid: false, released: true });
    }
    return res.status(200).json({ ok: true, paid: false });
  } catch (e) {
    console.error("[bmce/confirm]", e);
    return res.status(500).json({ ok: false });
  }
}
