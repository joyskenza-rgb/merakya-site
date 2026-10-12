# MERAKYA – merakyalab.com (production build)

Exact copy of the live site, captured 2026-10-12.

## Deploy on Vercel
**Option A – drag & drop:** `npm i -g vercel`, then inside this folder run `vercel --prod`.
**Option B – GitHub:** push this folder to a repo, import it in Vercel, Framework Preset = **Other**, Build Command = *(empty)*, Output Directory = `.`

Then in Vercel → Settings → Domains, add `merakyalab.com`.

## Notes
- `vercel.json` sends every route to `index.html` so in-app pages work on refresh.
- This is a compiled Vite/React build (minified). To edit content, ask for a rebuilt editable source project.
