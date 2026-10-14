import { publicCatalog } from "../../_lib/bmce.js";
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300");
  res.status(200).json({ products: await publicCatalog() });
}
