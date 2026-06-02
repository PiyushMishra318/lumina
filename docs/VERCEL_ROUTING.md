# Serving Lumina at `piyushm.dev/products/lumina`

Lumina is a **static site** (`public/`) deployed as its own Vercel project (e.g. `lumina-one-beta.vercel.app`). To expose it under your main domain at `/products/lumina`, use **one** of the approaches below.

## Option A — Rewrites on `piyushm.dev` (recommended)

Keep the Lumina project at the repo root with **no** `basePath`. Add rewrites on the **piyushm.dev** Vercel project so paths proxy to this deployment.

In the **piyushm.dev** project root `vercel.json`:

```json
{
  "rewrites": [
    {
      "source": "/products/lumina",
      "destination": "https://lumina-one-beta.vercel.app/"
    },
    {
      "source": "/products/lumina/",
      "destination": "https://lumina-one-beta.vercel.app/"
    },
    {
      "source": "/products/lumina/:path*",
      "destination": "https://lumina-one-beta.vercel.app/:path*"
    }
  ]
}
```

Replace `lumina-one-beta.vercel.app` with your production Lumina deployment hostname after you connect the custom path.

### Dashboard steps (piyushm.dev project)

1. Vercel → **piyushm.dev** project → **Settings** → **Domains** — ensure `piyushm.dev` is attached.
2. Deploy the updated `vercel.json` from the portfolio/main site repo (or add the same rewrites in **Project → Settings → Redirects** UI).
3. Deploy Lumina from this repo; confirm `https://<lumina-deployment>/` works.
4. Visit `https://piyushm.dev/products/lumina` — should show the Lumina landing page and demo.

**Why this is recommended:** Asset paths stay relative (`styles.css`, `demo.js`), so CSS/JS work without retuning every link.

---

## Option B — `basePath` on the Lumina project

If Lumina must be the project mounted directly on `piyushm.dev` under a subpath (monorepo / single project):

1. Lumina `vercel.json`:

```json
{
  "basePath": "/products/lumina"
}
```

2. Use **relative** asset URLs only (this repo already uses `styles.css`, not `/styles.css`).
3. In Vercel → Lumina project → **Settings** → **Domains**, add `piyushm.dev` and set **Path** to `/products/lumina` (Vercel UI: domain configuration for subdirectory).

---

## This repo’s `vercel.json`

- `outputDirectory`: `public`
- Optional rewrites map `/products/lumina` → `/index.html` when the same deployment is accessed with that path prefix (useful if you later add `basePath`).

---

## Checklist

| Step | Owner |
|------|--------|
| Lumina deploys successfully | Lumina Vercel project |
| Demo works on `*.vercel.app` | You |
| Rewrites or `basePath` configured | piyushm.dev or Lumina project |
| `https://piyushm.dev/products/lumina` loads CSS + demo | You |

If styles break on the custom path, you are likely missing the `:path*` rewrite (Option A) or `basePath` (Option B).
