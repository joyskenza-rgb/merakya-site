// POST { email, bin } → verifies BMCE BIN, issues ONE unique personal code per email (30 days), emails it.
import { allowMethods, body, isEmail, sendMail, OWNER_EMAIL, rows } from "../_lib/shared.js";
import { StoreError } from "../_lib/store.js";
import { BMCE_BINS, normEmail, issueCoupon, revokeCoupon, couponEmail, hit, clientIp } from "../_lib/bmce.js";

const msg = {
  invalid: "Merci d'entrer une adresse e-mail valide et les 8 premiers chiffres de votre carte.",
  bin: "Désolé, cette offre est réservée exclusivement aux clients BMCE – Bank of Africa. Merci de vérifier les 8 premiers chiffres de votre carte et de saisir un BIN BMCE valide.",
  rate: "Trop de tentatives. Pour votre sécurité, merci de réessayer dans une heure.",
  mail: "Votre code n'a pas pu être envoyé pour le moment. Merci de vérifier votre adresse e-mail et de réessayer dans quelques instants.",
  storage: "Le service est momentanément indisponible. Merci de réessayer dans quelques instants.",
};

export default async function handler(req, res) {
  if (!allowMethods(req, res, ["POST"])) return;
  const b = body(req);
  const email = normEmail(b.email);
  const bin = String(b.bin || "").replace(/\D/g, "");
  if (!isEmail(email) || email.length > 160 || bin.length !== 8) return res.status(400).json({ ok: false, error: "INVALID", message: msg.invalid });

  try {
    const ip = clientIp(req);
    if (!(await hit(`ip:${ip}`, 12, 3600))) return res.status(429).json({ ok: false, error: "RATE", message: msg.rate });

    if (!BMCE_BINS.has(bin)) {
      if (!(await hit(`badcheck:${ip}`, 5, 3600))) return res.status(429).json({ ok: false, error: "RATE", message: msg.rate });
      return res.status(403).json({ ok: false, error: "NOT_BMCE", message: msg.bin });
    }
    if (!(await hit(`mail:${email}`, 4, 3600))) return res.status(429).json({ ok: false, error: "RATE", message: msg.rate });

    const r = await issueCoupon(email);
    const resent = r.status === "exists";
    const sent = await sendMail({
      to: email, raw: true, replyTo: "contact@merakyalab.app",
      subject: resent ? `Votre code MERAKYA × BMCE : ${r.coupon.code}` : `✦ Votre code exclusif MERAKYA × BMCE : ${r.coupon.code}`,
      html: couponEmail(r.coupon, { resent }),
    });
    if (!sent.ok) {
      if (!resent) await revokeCoupon(r.coupon);
      return res.status(502).json({ ok: false, error: "MAIL", message: msg.mail });
    }
    if (!resent && process.env.BMCE_NOTIFY_OWNER !== "0") {
      sendMail({ to: OWNER_EMAIL, subject: `🎟️ Code BMCE émis — ${email}`, html: rows({ Email: email, Code: r.coupon.code, "Expire le": new Date(r.coupon.expiresAt).toLocaleDateString("fr-FR") }) }).catch(() => {});
    }
    const until = new Date(r.coupon.expiresAt).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
    return res.status(200).json({
      ok: true, status: r.status, expiresAt: r.coupon.expiresAt,
      message: resent
        ? `Un code personnel est déjà actif pour cette adresse (valable jusqu'au ${until}). Nous venons de vous le renvoyer par e-mail. Un nouveau code ne pourra être obtenu qu'après son utilisation ou son expiration.`
        : `Félicitations ! Votre statut de client BMCE est confirmé. Votre code personnel vient d'être envoyé à ${email}. Pensez à vérifier vos courriers indésirables.`,
    });
  } catch (e) {
    console.error("[bmce/coupon]", e);
    return res.status(e instanceof StoreError ? 503 : 500).json({ ok: false, error: "SERVER", message: msg.storage });
  }
}
