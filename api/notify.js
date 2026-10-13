// Contact form, newsletter sign-ups and new customer accounts → email to the owner.
import { allowMethods, body, clip, isEmail, rows, sendMail, OWNER_EMAIL } from "./_lib/shared.js";

const TYPES = {
  contact: "✉️ Nouveau message (formulaire de contact)",
  newsletter: "📰 Nouvelle inscription newsletter",
  signup: "👤 Nouveau compte client créé",
  booking: "📅 Nouvelle demande de réservation",
};

export default async function handler(req, res) {
  if (!allowMethods(req, res, ["POST"])) return;
  const b = body(req);
  const type = TYPES[b.type] ? b.type : null;
  if (!type) return res.status(400).json({ error: "UNKNOWN_TYPE" });
  if (b.email && !isEmail(b.email)) return res.status(400).json({ error: "INVALID_EMAIL" });

  const fields = {
    Nom: clip(b.name || b.fullName, 200),
    Email: clip(b.email, 200),
    Téléphone: clip(b.phone, 60),
    Ville: clip(b.city, 120),
    Adresse: clip(b.address, 300),
    Source: clip(b.source, 80),
    Message: clip(b.message, 5000),
    Langue: clip(b.language, 5),
    Date: new Date().toLocaleString("fr-FR", { timeZone: "Africa/Casablanca" }),
  };

  const r = await sendMail({
    to: OWNER_EMAIL,
    replyTo: isEmail(b.email) ? b.email : undefined,
    subject: `${TYPES[type]}${fields.Nom ? " — " + fields.Nom : fields.Email ? " — " + fields.Email : ""}`,
    html: rows(fields),
  });
  res.status(r.ok ? 200 : 502).json({ ok: r.ok });
}
