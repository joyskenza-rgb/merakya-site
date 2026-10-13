// Shared helpers for MERAKYA serverless functions (files starting with "_" are not deployed as routes).

export const OWNER_EMAIL = process.env.ORDER_NOTIFICATION_EMAIL || "joys.kenza@gmail.com";
export const CONTACT_EMAIL = "contact@merakyalab.app";
export const MAIL_FROM = process.env.MAIL_FROM || "MERAKYA <onboarding@resend.dev>";
export const SHIPPING_MAD = 45;            // same as the storefront
export const FREE_SHIPPING_FROM_MAD = 400; // same as the storefront
export const RATES = { MAD: 1, EUR: 0.092, USD: 0.099, GBP: 0.078 }; // same as the storefront

export function allowMethods(req, res, methods) {
  if (!methods.includes(req.method)) {
    res.setHeader("Allow", methods.join(", "));
    res.status(405).json({ error: "METHOD_NOT_ALLOWED" });
    return false;
  }
  return true;
}

export function body(req) {
  if (req.body && typeof req.body === "object") return req.body;
  try { return JSON.parse(req.body || "{}"); } catch { return {}; }
}

export const clip = (v, n = 500) => String(v ?? "").slice(0, n).trim();
export const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || ""));
export const esc = (v) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export function origin(req) {
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/$/, "");
  const proto = req.headers["x-forwarded-proto"] || "https";
  return `${proto}://${req.headers["x-forwarded-host"] || req.headers.host}`;
}

// Normalise the storefront cart: [{ product: { id, name, price }, quantity }]
export function normaliseCart(cart) {
  if (!Array.isArray(cart)) return [];
  return cart.slice(0, 50).map((it) => ({
    id: clip(it?.product?.id ?? it?.id, 80),
    name: clip(it?.product?.name ?? it?.name ?? "Produit MERAKYA", 120),
    priceMad: Math.max(0, Number(it?.product?.price ?? it?.price) || 0),
    quantity: Math.min(99, Math.max(1, parseInt(it?.quantity, 10) || 1)),
  })).filter((i) => i.priceMad > 0);
}

export function totalsMad(items) {
  const subtotal = items.reduce((s, i) => s + i.priceMad * i.quantity, 0);
  const shipping = subtotal >= FREE_SHIPPING_FROM_MAD ? 0 : SHIPPING_MAD;
  return { subtotal, shipping, total: subtotal + shipping };
}

export function fmt(amountMad, currency = "MAD") {
  const rate = RATES[currency] ?? 1;
  const sym = { MAD: "DH", EUR: "€", USD: "$", GBP: "£" }[currency] || currency;
  return `${(amountMad * rate).toFixed(currency === "MAD" ? 0 : 2)} ${sym}`;
}

// Send an email through Resend (https://resend.com). Returns { ok, id?, error? }.
export async function sendMail({ to, subject, html, replyTo }) {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.warn("[mail] RESEND_API_KEY missing — email not sent:", subject);
    return { ok: false, error: "RESEND_API_KEY_MISSING" };
  }
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: MAIL_FROM,
        to: Array.isArray(to) ? to : [to],
        subject,
        html: layout(subject, html),
        ...(replyTo ? { reply_to: replyTo } : {}),
      }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) { console.error("[mail] Resend error", r.status, data); return { ok: false, error: data?.message || r.status }; }
    return { ok: true, id: data.id };
  } catch (e) {
    console.error("[mail] send failed", e);
    return { ok: false, error: e.message };
  }
}

function layout(title, inner) {
  return `<!doctype html><html><body style="margin:0;background:#F7F2EB;font-family:Georgia,serif;color:#1E1A16">
<div style="max-width:600px;margin:0 auto;padding:32px 24px">
<div style="text-align:center;letter-spacing:6px;font-size:20px;color:#A67C52;margin-bottom:24px">MERAKYA</div>
<div style="background:#fff;border:1px solid #E8DCC6;padding:28px;font-family:Helvetica,Arial,sans-serif;font-size:14px;line-height:1.6">
<h2 style="font-family:Georgia,serif;font-weight:normal;margin:0 0 16px">${esc(title)}</h2>${inner}</div>
<p style="text-align:center;font-size:11px;color:#6B4E2E;margin-top:20px">MERAKYA · Casablanca · ${CONTACT_EMAIL}</p>
</div></body></html>`;
}

export function rows(obj) {
  return `<table style="width:100%;border-collapse:collapse">${Object.entries(obj)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `<tr><td style="padding:6px 8px;border-bottom:1px solid #F0E8DA;color:#6B4E2E;width:35%">${esc(k)}</td><td style="padding:6px 8px;border-bottom:1px solid #F0E8DA">${esc(v).replace(/\n/g, "<br>")}</td></tr>`)
    .join("")}</table>`;
}

export function itemsTable(items, currency) {
  return `<table style="width:100%;border-collapse:collapse;margin:12px 0">
<tr style="background:#F7F2EB"><th align="left" style="padding:6px 8px">Produit</th><th style="padding:6px 8px">Qté</th><th align="right" style="padding:6px 8px">Prix</th></tr>
${items.map((i) => `<tr><td style="padding:6px 8px;border-bottom:1px solid #F0E8DA">${esc(i.name)}</td><td align="center" style="padding:6px 8px;border-bottom:1px solid #F0E8DA">${i.quantity}</td><td align="right" style="padding:6px 8px;border-bottom:1px solid #F0E8DA">${fmt(i.priceMad * i.quantity, currency)}</td></tr>`).join("")}
</table>`;
}
