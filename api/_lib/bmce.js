import crypto from "node:crypto";
import { redis, getJSON, setJSON } from "./store.js";
import { CATALOG, byId } from "./catalog.js";
import { esc, sendMail, OWNER_EMAIL, CONTACT_EMAIL, SHIPPING_MAD, FREE_SHIPPING_FROM_MAD } from "./shared.js";

// BIN list supplied by BMCE – Bank of Africa (first 8 digits of the card)
export const BMCE_BINS = new Set(`63941205 55924700 55296910 54493745 54492336 54175150 54175140 54175130 54175120 54019080
53645130 53645110 53645100 52757870 52757850 52737531 52576530 52444900 52408250 52408240 52408200 49668810 47791070
47791060 47791050 47791040 47791030 47791020 47791000 45071630 45071610 44667130 44667100 44638370 44638340 44638130
44638120 44638100 43247690 43247630 43247600 43243620 42404446`.split(/\s+/).filter(Boolean));

export const COUPON_DAYS = 30;
const DAY = 86400000;
const KEEP_SEC = 400 * 86400; // keep records ~13 months for follow-up / export
const SITE = () => (process.env.SITE_URL || "https://merakyalab.com").replace(/\/$/, "");

export const normEmail = (e) => String(e || "").trim().toLowerCase();
export const normCode = (c) => String(c || "").trim().toUpperCase().replace(/\s+/g, "");
const kCoupon = (c) => `bmce:coupon:${c}`;
const kEmail = (e) => `bmce:email:${e}`;
const frDate = (ts) => new Date(ts).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "Africa/Casablanca" });

// ── Rate limiting ────────────────────────────────────────────────────────────
export async function hit(key, limit, windowSec) {
  const k = `bmce:rl:${key}`;
  const n = Number(await redis("INCR", k));
  if (n === 1) await redis("EXPIRE", k, windowSec);
  return n <= limit;
}
export const clientIp = (req) => String(req.headers["x-forwarded-for"] || req.headers["x-real-ip"] || "unknown").split(",")[0].trim();

// ── Coupon state ─────────────────────────────────────────────────────────────
// A coupon "blocks" its email while it is active (or in a card payment) and not expired.
export function couponState(c, now = Date.now()) {
  if (!c) return "none";
  if (c.status === "used") return "used";
  if (now > c.expiresAt) return "expired";
  if (c.status === "pending" && now < (c.pendingUntil || 0)) return "pending";
  return "active";
}

function newCode() {
  const A = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I
  const b = crypto.randomBytes(8);
  let s = ""; for (let i = 0; i < 8; i++) s += A[b[i] % A.length];
  return `BMCE-${s.slice(0, 4)}-${s.slice(4)}`;
}

export async function issueCoupon(email) {
  const existingCode = await redis("GET", kEmail(email));
  const existing = existingCode ? await getJSON(kCoupon(existingCode)) : null;
  const st = couponState(existing);
  if (st === "active" || st === "pending") return { status: "exists", coupon: existing };

  const now = Date.now();
  for (let i = 0; i < 6; i++) {
    const code = newCode();
    const coupon = { code, email, createdAt: now, expiresAt: now + COUPON_DAYS * DAY, status: "active" };
    const ok = await redis("SET", kCoupon(code), JSON.stringify(coupon), "NX", "EX", KEEP_SEC);
    if (ok === "OK") {
      await redis("SET", kEmail(email), code, "EX", KEEP_SEC);
      await redis("RPUSH", "bmce:log", code);
      return { status: "created", coupon };
    }
  }
  throw new Error("CODE_GENERATION_FAILED");
}

export async function revokeCoupon(coupon, previousCode) {
  await redis("DEL", kCoupon(coupon.code));
  if (previousCode) await redis("SET", kEmail(coupon.email), previousCode, "EX", KEEP_SEC);
  else await redis("DEL", kEmail(coupon.email));
}

// Check a code typed at checkout. Returns { ok, coupon } or { ok:false, error, message }.
export async function checkCoupon(code, email, { allowPendingSession } = {}) {
  code = normCode(code); email = normEmail(email);
  if (!/^BMCE-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code)) return { ok: false, error: "FORMAT", message: "Ce code n'est pas valide. Vérifiez qu'il est saisi exactement comme dans votre e-mail (ex. BMCE-AB12-CD34)." };
  const c = await getJSON(kCoupon(code));
  if (!c) return { ok: false, error: "NOT_FOUND", message: "Ce code est introuvable. Vérifiez sa saisie ou demandez votre code personnel via l'offre BMCE." };
  if (c.email !== email) return { ok: false, error: "EMAIL_MISMATCH", message: "Ce code est personnel : il ne fonctionne qu'avec l'adresse e-mail à laquelle il a été envoyé. Saisissez cette adresse dans le champ e-mail." };
  const st = couponState(c);
  if (st === "used") return { ok: false, error: "USED", message: "Ce code a déjà été utilisé. Vous pouvez demander un nouveau code personnel avec la même adresse e-mail." };
  if (st === "expired") return { ok: false, error: "EXPIRED", message: `Ce code a expiré le ${frDate(c.expiresAt)}. Vous pouvez demander un nouveau code personnel.` };
  if (st === "pending" && c.sessionId !== allowPendingSession) return { ok: false, error: "PENDING", message: "Un paiement par carte est en cours avec ce code. Terminez-le, ou réessayez dans quelques minutes." };
  return { ok: true, coupon: c };
}

export const markPending = (c, sessionId, untilMs) => setJSON(kCoupon(c.code), { ...c, status: "pending", sessionId, pendingUntil: untilMs }, KEEP_SEC);
export const markActive = (c) => { const { sessionId, pendingUntil, ...rest } = c; return setJSON(kCoupon(c.code), { ...rest, status: "active" }, KEEP_SEC); };
export const markUsed = (c, orderId) => setJSON(kCoupon(c.code), { ...c, status: "used", usedAt: Date.now(), orderId }, KEEP_SEC);
export const getCoupon = (code) => getJSON(kCoupon(normCode(code)));

// ── Stock (only enforced when catalogue stock is a number) ───────────────────
export async function stockLeft(p) {
  if (p.stock === null || p.stock === undefined) return Infinity;
  const sold = Number(await redis("GET", `bmce:sold:${p.id}`)) || 0;
  return Math.max(0, p.stock - sold);
}
export async function publicCatalog() {
  return Promise.all(CATALOG.map(async (p) => {
    const left = await stockLeft(p).catch(() => Infinity);
    return { ...p, inStock: p.available && left > 0, stockLeft: Number.isFinite(left) ? left : null };
  }));
}
export async function deductStock(lines) {
  for (const l of lines) { const p = byId(l.id); if (p && p.stock !== null && p.stock !== undefined) await redis("INCRBY", `bmce:sold:${l.id}`, l.qty); }
}

// ── Order pricing (server-side, never trusts browser prices) ─────────────────
export async function priceOrder(rawItems, withCoupon) {
  if (!Array.isArray(rawItems) || !rawItems.length) return { error: "Votre panier est vide." };
  const merged = new Map();
  for (const it of rawItems.slice(0, 30)) {
    const id = String(it?.id || ""); const qty = Math.min(20, Math.max(1, parseInt(it?.qty, 10) || 1));
    merged.set(id, (merged.get(id) || 0) + qty);
  }
  const lines = [];
  for (const [id, qty] of merged) {
    const p = byId(id);
    if (!p || !p.available || !p.price) return { error: "Un article de votre panier n'est plus disponible. Merci de le retirer." };
    const left = await stockLeft(p);
    if (qty > left) return { error: left > 0 ? `Il ne reste que ${left} « ${p.name} » en stock.` : `« ${p.name} » est en rupture de stock.` };
    const unit = withCoupon ? p.bmcePrice : p.price;
    lines.push({ id, name: p.name, qty, regular: p.price, unit, total: unit * qty });
  }
  const regularSubtotal = lines.reduce((s, l) => s + l.regular * l.qty, 0);
  const subtotal = lines.reduce((s, l) => s + l.total, 0);
  const shipping = subtotal >= FREE_SHIPPING_FROM_MAD ? 0 : SHIPPING_MAD;
  return { lines, regularSubtotal, discount: regularSubtotal - subtotal, subtotal, shipping, total: subtotal + shipping };
}

// ── Emails ───────────────────────────────────────────────────────────────────
const gold = "#A67C52", ink = "#1E1A16", ivory = "#F7F2EB", line = "#E8DCC6", sage = "#2F4A3E";

function shell(preheader, inner) {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>MERAKYA</title></head>
<body style="margin:0;padding:0;background:${ivory};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${ivory};"><tr><td align="center" style="padding:28px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
<tr><td align="center" style="padding:8px 0 22px;font-family:Georgia,'Times New Roman',serif;color:${gold};font-size:26px;letter-spacing:10px;">MERAKYA</td></tr>
<tr><td align="center" style="padding:0 0 22px;font-family:Georgia,serif;color:${ink};opacity:.65;font-size:12px;letter-spacing:3px;font-style:italic;">When Souls Inspire Matter</td></tr>
<tr><td style="background:#FFFFFF;border:1px solid ${line};">${inner}</td></tr>
<tr><td align="center" style="padding:22px 10px;font-family:Helvetica,Arial,sans-serif;font-size:11px;line-height:1.7;color:#6B4E2E;">
MERAKYA · Casablanca, Maroc · <a href="mailto:${CONTACT_EMAIL}" style="color:#6B4E2E;">${CONTACT_EMAIL}</a><br>
Offre réservée aux clients BMCE – Bank of Africa, dans le cadre de notre partenariat.</td></tr>
</table></td></tr></table></body></html>`;
}
const P = (t, extra = "") => `<p style="margin:0 0 14px;font-family:Helvetica,Arial,sans-serif;font-size:14px;line-height:1.7;color:${ink};${extra}">${t}</p>`;

export function couponEmail(coupon, { resent } = {}) {
  const url = `${SITE()}/BMCE?code=${encodeURIComponent(coupon.code)}`;
  const until = frDate(coupon.expiresAt);
  const step = (n, t, d) => `<tr><td valign="top" width="38" style="padding:0 0 14px;"><div style="width:28px;height:28px;border-radius:50%;background:${sage};color:#fff;font-family:Georgia,serif;font-size:14px;line-height:28px;text-align:center;">${n}</div></td>
<td style="padding:2px 0 14px;font-family:Helvetica,Arial,sans-serif;font-size:14px;line-height:1.6;color:${ink};"><strong>${t}</strong><br><span style="color:#5a5148;">${d}</span></td></tr>`;
  const rule = (t) => `<tr><td valign="top" width="20" style="color:${gold};font-size:14px;padding:0 0 8px;">✦</td><td style="font-family:Helvetica,Arial,sans-serif;font-size:13px;line-height:1.6;color:#4a423a;padding:0 0 8px;">${t}</td></tr>`;
  const inner = `
<div style="height:4px;background:linear-gradient(90deg,${sage},${gold},${sage});background-color:${gold};"></div>
<div style="padding:34px 32px 10px;text-align:center;">
<div style="font-family:Helvetica,Arial,sans-serif;font-size:11px;letter-spacing:4px;color:${gold};text-transform:uppercase;margin-bottom:12px;">Offre exclusive clients BMCE – Bank of Africa</div>
<h1 style="margin:0 0 14px;font-family:Georgia,'Times New Roman',serif;font-weight:normal;font-size:30px;line-height:1.25;color:${ink};">${resent ? "Votre code personnel vous attend" : "Bienvenue dans l'univers MERAKYA"}</h1>
${P(resent
    ? "Un code personnel actif est déjà associé à cette adresse e-mail. Le voici à nouveau, pour que vous puissiez en profiter."
    : "Votre statut de client BMCE – Bank of Africa a bien été reconnu. Voici votre code de réduction <strong>exclusif et personnel</strong>, préparé rien que pour vous.", "color:#4a423a;")}
</div>
<div style="padding:4px 32px 26px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${ivory};border:1px dashed ${gold};">
<tr><td align="center" style="padding:24px 12px 8px;font-family:Helvetica,Arial,sans-serif;font-size:11px;letter-spacing:3px;color:#6B4E2E;text-transform:uppercase;">Votre code personnel</td></tr>
<tr><td align="center" style="padding:0 12px 8px;font-family:'Courier New',Courier,monospace;font-size:30px;font-weight:bold;letter-spacing:4px;color:${ink};">${esc(coupon.code)}</td></tr>
<tr><td align="center" style="padding:0 12px 22px;font-family:Helvetica,Arial,sans-serif;font-size:13px;color:${sage};"><strong>−15 % sur nos créations</strong> · <strong>Coffrets signatures à 935 DH</strong> au lieu de 1 099 DH</td></tr>
</table>
<p style="margin:12px 0 0;text-align:center;font-family:Helvetica,Arial,sans-serif;font-size:13px;color:#8a3b2a;"><strong>Valable jusqu'au ${until}</strong> (30 jours)</p>
</div>
<div style="padding:0 32px 8px;">
<h2 style="margin:0 0 16px;font-family:Georgia,serif;font-weight:normal;font-size:20px;color:${ink};">Comment utiliser votre code</h2>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
${step(1, "Choisissez vos créations", "Rendez-vous sur la page MERAKYA × BMCE et ajoutez vos coffrets et créations au panier.")}
${step(2, "Saisissez la même adresse e-mail", `Au moment de la commande, indiquez <strong>${esc(coupon.email)}</strong> : votre code est lié à cette adresse.`)}
${step(3, "Collez votre code et cliquez sur « Appliquer »", "La réduction s'affiche immédiatement dans le récapitulatif, avant validation.")}
${step(4, "Finalisez votre commande", "Paiement à la livraison ou par carte bancaire, en toute sécurité.")}
</table>
<div style="text-align:center;padding:10px 0 26px;"><a href="${url}" style="display:inline-block;background:${sage};color:#FFFFFF;text-decoration:none;font-family:Helvetica,Arial,sans-serif;font-size:13px;letter-spacing:2px;text-transform:uppercase;padding:15px 30px;border-radius:40px;">Découvrir la collection</a></div>
</div>
<div style="padding:22px 32px 26px;background:#FBF8F2;border-top:1px solid ${line};">
<h3 style="margin:0 0 12px;font-family:Georgia,serif;font-weight:normal;font-size:16px;color:${ink};">Conditions de votre code</h3>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
${rule(`Valable <strong>30 jours</strong>, jusqu'au <strong>${until}</strong>. Passé ce délai, il expire automatiquement.`)}
${rule("Utilisable <strong>une seule fois</strong>, uniquement avec <strong>votre adresse e-mail</strong>.")}
${rule("<strong>Une fois votre code utilisé</strong> pour une commande, vous pouvez en demander un nouveau avec la même adresse e-mail.")}
${rule("<strong>Tant que ce code n'est pas utilisé</strong>, aucun autre code ne peut être obtenu avec cette adresse avant son expiration.")}
${rule("<strong>Vérification à la livraison :</strong> pour un paiement en espèces, vous présenterez votre carte BMCE – Bank of Africa au livreur. Pour un paiement par carte en ligne, la carte utilisée doit être une carte BMCE.")}
${rule("<strong>Toute vérification non concluante entraîne l'annulation de la commande.</strong>")}
</table></div>`;
  return shell(`Votre code ${coupon.code} — valable jusqu'au ${until}`, inner);
}

function orderTable(o) {
  const row = (a, b, s = "") => `<tr><td style="padding:8px 0;border-bottom:1px solid ${line};font-family:Helvetica,Arial,sans-serif;font-size:13px;color:${ink};${s}">${a}</td><td align="right" style="padding:8px 0;border-bottom:1px solid ${line};font-family:Helvetica,Arial,sans-serif;font-size:13px;color:${ink};white-space:nowrap;${s}">${b}</td></tr>`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
${o.lines.map((l) => row(`${esc(l.name)} <span style="color:#8a7f72;">× ${l.qty}</span>`, `${l.regular * l.qty} DH`)).join("")}
${o.discount ? row("Avantage BMCE (code " + esc(o.code) + ")", `−${o.discount} DH`, `color:${sage};`) : ""}
${row("Livraison", o.shipping ? `${o.shipping} DH` : "Offerte")}
${row("<strong>Total</strong>", `<strong>${o.total} DH</strong>`, "font-size:15px;border-bottom:none;")}
</table>`;
}

export function customerOrderEmail(o) {
  const cod = o.paymentMethod === "cod";
  const inner = `<div style="padding:32px 32px 8px;">
<div style="font-family:Helvetica,Arial,sans-serif;font-size:11px;letter-spacing:4px;color:${gold};text-transform:uppercase;margin-bottom:10px;">Commande ${esc(o.orderId)}</div>
<h1 style="margin:0 0 14px;font-family:Georgia,serif;font-weight:normal;font-size:26px;color:${ink};">Merci, ${esc(o.customer.name.split(" ")[0] || "")} ✦</h1>
${P(cod ? "Votre commande est bien enregistrée. Notre atelier la prépare avec soin ; notre équipe vous contactera pour convenir de la livraison." : "Votre paiement a bien été reçu. Notre atelier prépare votre commande avec soin.")}
${orderTable(o)}
${P(`<br><strong>Livraison :</strong> ${esc(o.customer.address)}, ${esc(o.customer.city)}<br><strong>Paiement :</strong> ${cod ? "à la livraison (espèces)" : "carte bancaire (payée)"}`)}
</div>
${o.code ? `<div style="margin:0 32px 26px;padding:16px 18px;background:#FBF3E8;border-left:3px solid ${gold};font-family:Helvetica,Arial,sans-serif;font-size:13px;line-height:1.6;color:#5a3f22;">
<strong>Vérification client BMCE :</strong> ${cod ? "merci de présenter votre carte BMCE – Bank of Africa au livreur lors de la remise du colis." : "la carte utilisée pour le paiement doit être une carte BMCE – Bank of Africa."} Toute vérification non concluante entraîne l'annulation de la commande.</div>` : ""}
<div style="padding:0 32px 28px;">${P(`Une question ? Répondez simplement à cet e-mail ou écrivez-nous à <a href="mailto:${CONTACT_EMAIL}" style="color:${gold};">${CONTACT_EMAIL}</a>.`, "font-size:13px;color:#5a5148;")}</div>`;
  return shell(`Commande ${o.orderId} confirmée`, inner);
}

export function ownerOrderEmail(o) {
  const cod = o.paymentMethod === "cod";
  const inner = `<div style="padding:28px 28px 20px;">
<h1 style="margin:0 0 6px;font-family:Georgia,serif;font-weight:normal;font-size:22px;color:${ink};">Nouvelle commande BMCE ${esc(o.orderId)}</h1>
${P(`<strong>${cod ? "💵 PAIEMENT À LA LIVRAISON" : "💳 PAYÉE PAR CARTE (Stripe)"}</strong>${o.code ? ` · Code <strong>${esc(o.code)}</strong>` : " · sans code BMCE (prix normal)"}`)}
${cod && o.code ? P("⚠️ Le livreur doit vérifier la carte BMCE – Bank of Africa du client avant remise. Vérification non concluante = annulation.", "color:#8a3b2a;") : ""}
${!cod && o.code ? P("⚠️ Vérifiez dans Stripe que la banque émettrice de la carte est BMCE / Bank of Africa avant expédition.", "color:#8a3b2a;") : ""}
${orderTable(o)}
<br>${P(`<strong>Client :</strong> ${esc(o.customer.name)}<br><strong>E-mail :</strong> ${esc(o.customer.email)}<br><strong>Téléphone :</strong> ${esc(o.customer.phone)}<br><strong>Adresse :</strong> ${esc(o.customer.address)}, ${esc(o.customer.city)}${o.customer.note ? `<br><strong>Note :</strong> ${esc(o.customer.note)}` : ""}`)}
</div>`;
  return shell(`Commande ${o.orderId} — ${o.total} DH`, inner);
}

export async function sendOrderEmails(o) {
  const [owner, customer] = await Promise.all([
    sendMail({ to: OWNER_EMAIL, replyTo: o.customer.email, subject: `🛍️ Commande BMCE ${o.orderId} — ${o.paymentMethod === "cod" ? "COD" : "PAYÉE CARTE"} — ${o.total} DH`, html: ownerOrderEmail(o), raw: true }),
    sendMail({ to: o.customer.email, replyTo: CONTACT_EMAIL, subject: `Votre commande MERAKYA ${o.orderId}`, html: customerOrderEmail(o), raw: true }),
  ]);
  return { owner, customer };
}

export const newOrderId = () => "MKB-" + Date.now().toString(36).toUpperCase().slice(-5) + crypto.randomBytes(2).toString("hex").toUpperCase();

// Called after Stripe confirms payment (return page or webhook). Idempotent.
export async function finalizeStripeSession(session) {
  const m = session.metadata || {};
  if (m.bmce !== "1" || session.payment_status !== "paid") return { ok: false, reason: "NOT_PAID" };
  const first = await redis("SET", `bmce:session:${session.id}`, "1", "NX", "EX", KEEP_SEC);
  const order = JSON.parse(m.order || "{}");
  if (first !== "OK") return { ok: true, already: true, orderId: order.orderId };
  if (m.code) { const c = await getCoupon(m.code); if (c) await markUsed(c, order.orderId); }
  await deductStock(order.lines || []);
  const priced = await rebuild(order, m);
  await sendOrderEmails(priced);
  return { ok: true, orderId: order.orderId };
}
async function rebuild(order, m) {
  const lines = (order.lines || []).map((l) => { const p = byId(l.id) || {}; return { id: l.id, name: p.name || l.id, qty: l.qty, regular: p.price || l.u, unit: l.u, total: l.u * l.qty }; });
  const regularSubtotal = lines.reduce((s, l) => s + l.regular * l.qty, 0);
  const subtotal = lines.reduce((s, l) => s + l.total, 0);
  return { orderId: order.orderId, code: m.code || "", paymentMethod: "card", lines, regularSubtotal, discount: regularSubtotal - subtotal, subtotal, shipping: order.ship || 0, total: subtotal + (order.ship || 0),
    customer: { name: m.name || "", email: m.email || "", phone: m.phone || "", address: m.address || "", city: m.city || "", note: m.note || "" } };
}
