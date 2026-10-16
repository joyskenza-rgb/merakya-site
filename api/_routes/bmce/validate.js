// POST { code, email, items } → checks the code for this email and returns the discounted totals.
import { allowMethods, body } from "../../_lib/shared.js";
import { checkCoupon, priceOrder, hit, clientIp } from "../../_lib/bmce.js";

export default async function handler(req, res) {
  if (!allowMethods(req, res, ["POST"])) return;
  const b = body(req);
  try {
    if (!(await hit(`val:${clientIp(req)}`, 40, 3600))) return res.status(429).json({ ok: false, message: "Trop de tentatives. Réessayez plus tard." });
    const c = await checkCoupon(b.code, b.email);
    if (!c.ok) return res.status(200).json(c);
    const priced = await priceOrder(b.items, true);
    if (priced.error) return res.status(200).json({ ok: false, message: priced.error });
    res.status(200).json({ ok: true, code: c.coupon.code, expiresAt: c.coupon.expiresAt, ...priced });
  } catch (e) {
    console.error("[bmce/validate]", e);
    res.status(503).json({ ok: false, message: "Vérification momentanément indisponible. Réessayez dans quelques instants." });
  }
}
