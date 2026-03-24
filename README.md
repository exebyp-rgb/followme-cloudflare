# followme-cloudflare

Cloudflare Worker — media/API layer for **FollowMe.direct**.

## Architecture

```
Base44 (main app) ──► followme.direct  [DNS only, grey cloud]
Cloudflare Worker ──► api.followme.direct  [proxied]
Cloudflare R2    ──► cdn.followme.direct  [R2 custom domain]
Cloudflare Stream ──► video upload + playback
```

> GitHub is used only as source control + Cloudflare deploy trigger.  
> GitHub is NOT between Base44 and Cloudflare.

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| POST | `/stream/init-upload` | Init Cloudflare Stream upload |
| POST | `/r2/init-upload` | Init R2 presigned upload |

## Deploy

```bash
# Install Wrangler
npm install -g wrangler

# Authenticate
wrangler login

# Set secrets (never commit these)
wrangler secret put CF_STREAM_TOKEN
wrangler secret put R2_ACCESS_KEY_ID
wrangler secret put R2_SECRET_ACCESS_KEY

# Deploy
wrangler deploy
```

## Secrets Strategy

**Never stored in git — always via Cloudflare secrets:**
- `CF_STREAM_TOKEN` — Cloudflare Stream API token
- `R2_ACCESS_KEY_ID` — R2 access key
- `R2_SECRET_ACCESS_KEY` — R2 secret key

**Public env (in wrangler.toml):**
- `CF_ACCOUNT_ID` — Cloudflare account ID
- `R2_BUCKET_NAME` — followme-media
- `CDN_BASE_URL` — https://cdn.followme.direct

## Structure

```
followme-cloudflare/
├── src/
│   └── index.js        # Worker entry point
├── wrangler.toml       # Cloudflare config
├── package.json
├── .env.example        # Public vars reference
├── .gitignore
└── README.md
```
