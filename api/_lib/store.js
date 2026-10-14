// Minimal Upstash Redis REST client (Vercel → Storage → Upstash Redis).
// Works with either env naming: KV_REST_API_URL/KV_REST_API_TOKEN or UPSTASH_REDIS_REST_URL/UPSTASH_REDIS_REST_TOKEN.
const URL_ = () => process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = () => process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

export class StoreError extends Error {}
export const storeReady = () => Boolean(URL_() && TOKEN());

export async function redis(...args) {
  if (globalThis.__MERAKYA_TEST_REDIS__) return globalThis.__MERAKYA_TEST_REDIS__(args);
  if (!storeReady()) throw new StoreError("STORAGE_NOT_CONFIGURED");
  const r = await fetch(URL_(), {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN()}`, "Content-Type": "application/json" },
    body: JSON.stringify(args.map(String)),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || data.error) throw new StoreError(data.error || `REDIS_HTTP_${r.status}`);
  return data.result;
}

export const getJSON = async (k) => { const v = await redis("GET", k); return v ? JSON.parse(v) : null; };
export const setJSON = (k, v, ttlSec) => ttlSec ? redis("SET", k, JSON.stringify(v), "EX", ttlSec) : redis("SET", k, JSON.stringify(v));
