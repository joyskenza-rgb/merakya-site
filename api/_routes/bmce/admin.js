// GET /api/bmce/admin?key=YOUR_BMCE_ADMIN_KEY → CSV export of every BMCE code issued (status, dates, order).
import { redis } from "../../_lib/store.js";
import { getCoupon, couponState } from "../../_lib/bmce.js";

export default async function handler(req, res) {
  const key = process.env.BMCE_ADMIN_KEY;
  if (!key || req.query?.key !== key) return res.status(401).send("Unauthorized");
  const codes = (await redis("LRANGE", "bmce:log", 0, -1)) || [];
  const d = (t) => (t ? new Date(t).toISOString().replace("T", " ").slice(0, 16) : "");
  const out = ["code;email;statut;cree_le;expire_le;utilise_le;commande"];
  for (const code of codes) {
    const c = await getCoupon(code); if (!c) continue;
    out.push([c.code, c.email, couponState(c), d(c.createdAt), d(c.expiresAt), d(c.usedAt), c.orderId || ""].join(";"));
  }
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="codes-bmce-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.status(200).send("﻿" + out.join("\n"));
}
