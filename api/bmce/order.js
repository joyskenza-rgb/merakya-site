// POST { items:[{id,qty}], customer:{name,email,phone,city,address,note}, code?, paymentMethod:'cod'|'card' }
import Stripe from "stripe";
import { allowMethods, body, clip, isEmail, origin } from "../_lib/shared.js";
import { checkCoupon, priceOrder, markUsed, markPending, deductStock, sendOrderEmails, newOrderId, normEmail, hit, clientIp } from "../_lib/bmce.js";

export default async function handler(req, res) {
  if (!allowMethods(req, res, ["POST"])) return;
  const b = body(req);
  const cu = b.customer || {};
  const customer = { name: clip(cu.name, 120), email: normEmail(cu.email), phone: clip(cu.phone, 30), city: clip(cu.city, 80), address: clip(cu.address, 300), note: clip(cu.note, 300) };
  if (!customer.name || !isEmail(customer.email) || customer.phone.replace(/\D/g, "").length < 9 || !customer.city || !customer.address)
    return res.status(400).json({ ok: false, message: "Merci de compléter vos coordonnées de livraison (nom, e-mail, téléphone, ville, adresse)." });
  const method = b.paymentMethod === "card" ? "card" : "cod";

  try {
    if (!(await hit(`order:${clientIp(req)}`, 15, 3600))) return res.status(429).json({ ok: false, message: "Trop de tentatives. Réessayez plus tard." });
    let coupon = null;
    if (b.code) {
      const c = await checkCoupon(b.code, customer.email);
      if (!c.ok) return res.status(200).json({ ok: false, couponError: true, message: c.message });
      coupon = c.coupon;
    }
    const priced = await priceOrder(b.items, Boolean(coupon));
    if (priced.error) return res.status(200).json({ ok: false, message: priced.error });
    const orderId = newOrderId();
    const order = { orderId, code: coupon?.code || "", paymentMethod: method, customer, ...priced };

    if (method === "cod") {
      if (coupon) await markUsed(coupon, orderId);
      await deductStock(priced.lines);
      await sendOrderEmails(order);
      return res.status(200).json({ ok: true, orderId, total: priced.total, paymentMethod: "cod" });
    }

    if (!process.env.STRIPE_SECRET_KEY) return res.status(200).json({ ok: false, message: "Le paiement par carte est momentanément indisponible. Choisissez le paiement à la livraison." });
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const base = origin(req);
    const expiresAt = Math.floor(Date.now() / 1000) + 31 * 60;
    const line_items = priced.lines.map((l) => ({ quantity: l.qty, price_data: { currency: "mad", unit_amount: l.unit * 100, product_data: { name: l.name + (coupon ? " — prix BMCE" : "") } } }));
    if (priced.shipping) line_items.push({ quantity: 1, price_data: { currency: "mad", unit_amount: priced.shipping * 100, product_data: { name: "Livraison" } } });
    const compact = JSON.stringify({ orderId, ship: priced.shipping, lines: priced.lines.map((l) => ({ id: l.id, qty: l.qty, u: l.unit })) });
    if (compact.length > 500) return res.status(200).json({ ok: false, message: "Trop d'articles différents pour un paiement par carte. Choisissez le paiement à la livraison ou divisez votre commande." });
    const metadata = { bmce: "1", code: coupon?.code || "", order: compact.slice(0, 500), name: customer.name, email: customer.email, phone: customer.phone, city: customer.city, address: customer.address, note: customer.note };
    const session = await stripe.checkout.sessions.create({
      mode: "payment", line_items, customer_email: customer.email, expires_at: expiresAt, locale: "fr",
      metadata, payment_intent_data: { metadata: { bmce: "1", orderId, code: metadata.code } },
      success_url: `${base}/BMCE?paid=1&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${base}/BMCE?canceled=1&session_id={CHECKOUT_SESSION_ID}`,
    });
    if (coupon) await markPending(coupon, session.id, (expiresAt + 4 * 60) * 1000);
    return res.status(200).json({ ok: true, url: session.url, orderId });
  } catch (e) {
    console.error("[bmce/order]", e);
    return res.status(500).json({ ok: false, message: "Votre commande n'a pas pu être enregistrée. Merci de réessayer dans quelques instants." });
  }
}
