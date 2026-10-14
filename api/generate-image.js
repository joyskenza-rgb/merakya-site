// The original AI image generator (admin panel) ran on Google AI Studio's server and isn't part of this export.
export default function handler(req, res) {
  res.status(501).json({ error: "NOT_AVAILABLE", message: "La génération d'images IA n'est pas disponible sur cet hébergement. Importez une image à la place." });
}
