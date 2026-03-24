/**
 * FollowMe.direct — Cloudflare Worker
 * Media/API layer: Cloudflare Stream + R2
 *
 * Endpoints:
 *   GET  /health
 *   POST /stream/init-upload
 *   POST /r2/init-upload
 *
 * Secrets (set via wrangler secret put):
 *   CF_STREAM_TOKEN
 *   R2_ACCESS_KEY_ID
 *   R2_SECRET_ACCESS_KEY
 *
 * Env vars (set in wrangler.toml [vars]):
 *   CDN_BASE_URL
 *   R2_BUCKET_NAME
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

function error(message, status = 400) {
  return json({ ok: false, error: message }, status);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const { pathname } = url;
    const method = request.method;

    // Handle CORS preflight
    if (method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    // ─── GET /health ──────────────────────────────────────────────
    if (method === 'GET' && pathname === '/health') {
      return json({
        ok: true,
        service: 'followme-cloudflare',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        endpoints: [
          'GET /health',
          'POST /stream/init-upload',
          'POST /r2/init-upload',
        ],
      });
    }

    // ─── POST /stream/init-upload ─────────────────────────────────
    if (method === 'POST' && pathname === '/stream/init-upload') {
      try {
        const body = await request.json().catch(() => ({}));
        const { fileName, fileSize, maxDurationSeconds = 3600 } = body;

        if (!fileName) return error('fileName is required');
        if (!fileSize) return error('fileSize is required');
        if (!env.CF_STREAM_TOKEN) return error('CF_STREAM_TOKEN secret not set', 500);

        // Call Cloudflare Stream TUS upload endpoint
        const accountId = env.CF_ACCOUNT_ID || '';
        const streamRes = await fetch(
          `https://api.cloudflare.com/client/v4/accounts/${accountId}/stream?direct_user=true`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${env.CF_STREAM_TOKEN}`,
              'Tus-Resumable': '1.0.0',
              'Upload-Length': String(fileSize),
              'Upload-Metadata': [
                `name ${btoa(fileName)}`,
                `maxDurationSeconds ${btoa(String(maxDurationSeconds))}`,
              ].join(','),
            },
          }
        );

        if (!streamRes.ok) {
          const errText = await streamRes.text();
          return error(`Stream API error: ${errText}`, 502);
        }

        const uploadUrl = streamRes.headers.get('Location');
        const streamMediaId = streamRes.headers.get('stream-media-id');

        return json({
          ok: true,
          uploadUrl,
          videoUid: streamMediaId,
          playbackUrl: streamMediaId
            ? `https://customer-stream.cloudflare.com/${streamMediaId}/manifest/video.m3u8`
            : null,
        });
      } catch (err) {
        return error(`Internal error: ${err.message}`, 500);
      }
    }

    // ─── POST /r2/init-upload ─────────────────────────────────────
    if (method === 'POST' && pathname === '/r2/init-upload') {
      try {
        const body = await request.json().catch(() => ({}));
        const { fileName, contentType = 'application/octet-stream', folder = 'uploads' } = body;

        if (!fileName) return error('fileName is required');
        if (!env.MEDIA_BUCKET) return error('R2 bucket binding (MEDIA_BUCKET) not configured', 500);

        const key = `${folder}/${Date.now()}-${fileName}`;
        const cdnBase = env.CDN_BASE_URL || 'https://cdn.followme.direct';

        // For direct R2 Worker upload (stream body directly to R2)
        // Client should PUT the file to the returned uploadKey via a follow-up
        // request to this Worker at POST /r2/upload with the key
        return json({
          ok: true,
          key,
          publicUrl: `${cdnBase}/${key}`,
          instructions: 'PUT the file body to POST /r2/upload with { key } field or upload directly via the Worker.',
          bucket: env.R2_BUCKET_NAME || 'followme-media',
        });
      } catch (err) {
        return error(`Internal error: ${err.message}`, 500);
      }
    }

    // ─── 404 ──────────────────────────────────────────────────────
    return error('Not found', 404);
  },
};
