// Called by the storefront after a Cash-on-Delivery order and after a successful Stripe card payment.
import { allowMethods, body, clip, isEmail, esc, rows, itemsTable, normaliseCart, totalsMad, fmt, sendMail, OWNER_EMAIL, CONTACT_EMAIL, RATES } from "./_lib/shared.js";

export default async function handler(req, res) {
  if (!allowMethods(req, res, ["POST"])) return;
  const b = body(req);
  const items = normaliseCart(b.cart);
  const currency = RATES[b.currency] ? b.currency : "MAD";
  const { subtotal, shipping, total } = totalsMad(items);
  const method = b.paymentMethod === "card" ? "card" : "cod";
  const methodLabel = method === "card" ? "Carte bancaire (Stripe)" : "Paiement à la livraison (COD)";
  const orderId = clip(b.orderId, 40) || "MK-" + Date.now();
  const customer = {
    name: clip(b.customerName, 200), email: clip(b.customerEmail, 200),
    phone: clip(b.customerPhone, 60), address: clip(b.customerAddress, 500),
  };
  const lang = b.language === "EN" ? "EN" : "FR";
  const totals = `<p style="text-align:right">Sous-total : ${fmt(subtotal, currency)}<br>Livraison : ${shipping ? fmt(shipping, currency) : "Gratuite"}<br><strong>Total : ${fmt(total, currency)}</strong></p>`;

  const owner = await sendMail({
    to: OWNER_EMAIL,
    replyTo: isEmail(customer.email) ? customer.email : undefined,
    subject: `🛍️ Nouvelle commande ${orderId} — ${method === "card" ? "PAYÉE PAR CARTE" : "COD"} — ${fmt(total, currency)}`,
    html: rows({ Commande: orderId, Paiement: methodLabel, Client: customer.name, Email: customer.email, Téléphone: customer.phone, Adresse: customer.address, Langue: lang }) +
      itemsTable(items, currency) + totals +
      (method === "card" ? `<p style="font-size:12px;color:#6B4E2E">Vérifiez le paiement dans votre tableau de bord Stripe avant expédition.</p>` : ""),
  });

  let customerMail = { ok: false, skipped: true };
  if (isEmail(customer.email)) {
    const en = lang === "EN";
    customerMail = await sendMail({
      to: customer.email,
      replyTo: CONTACT_EMAIL,
      subject: en ? `Your MERAKYA order ${orderId}` : `Votre commande MERAKYA ${orderId}`,
      html: `<p>${en ? "Dear" : "Chère / Cher"} ${esc(customer.name)},</p><p>${en
        ? "Thank you for your order. Our Marrakech atelier is preparing your rituals."
        : "Merci pour votre commande. Notre atelier prépare vos rituels avec soin."}</p>` +
        itemsTable(items, currency) + totals +
        rows({ [en ? "Payment" : "Paiement"]: methodLabel, [en ? "Delivery address" : "Adresse de livraison"]: customer.address }) +
        `<p>${en ? "Questions? Reply to this email or write to" : "Une question ? Répondez à cet e-mail ou écrivez à"} ${CONTACT_EMAIL}.</p>`,
    });
  }

  res.status(owner.ok ? 200 : 502).json({ ok: owner.ok, orderId, ownerEmail: owner, customerEmail: customerMail });
}
