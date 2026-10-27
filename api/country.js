import { createHmac } from 'node:crypto';

// Vercel's proxy supplies this on the incoming Function request. Never use
// country codes, forwarded IPs, or country headers supplied by the browser.
const COUNTRY_CODE = /^[A-Z]{2}$/;
const RUN_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function signCountryProof(runId, countryCode, issuedAt, secret) {
    const payload = `v1.${runId}.${countryCode}.${issuedAt}`;
    const signature = createHmac('sha256', secret).update(payload).digest('hex');
    return `${payload}.${signature}`;
}

/**
 * A same-origin Vercel Function, not a Vite client module.
 * Returns a short-lived HMAC proof tied to a specific online run. Supabase
 * verifies the proof before saving a country; users cannot choose a country.
 */
export default function handler(request, response) {
    response.setHeader('Cache-Control', 'private, no-store');
    if (request.method !== 'POST') {
        response.setHeader('Allow', 'POST');
        return response.status(405).json({ error: 'Method not allowed.' });
    }

    let body = request.body;
    if (typeof body === 'string') {
        try { body = JSON.parse(body); }
        catch { return response.status(400).json({ error: 'Invalid JSON.' }); }
    }
    const runId = body?.runId;
    if (typeof runId !== 'string' || !RUN_ID.test(runId)) {
        return response.status(400).json({ error: 'Invalid run ID.' });
    }

    // Without Vercel's server-injected location (or the shared secret), do
    // not guess a country. Local development and unsupported IPs are unknown.
    const rawCountry = request.headers['x-vercel-ip-country'];
    const countryCode = typeof rawCountry === 'string' ? rawCountry : '';
    const secret = process.env.LEADERBOARD_GEO_SECRET;
    if (process.env.VERCEL !== '1' || !COUNTRY_CODE.test(countryCode)
        || typeof secret !== 'string' || secret.length < 32) {
        return response.status(200).json({ proof: null });
    }

    const issuedAt = Math.floor(Date.now() / 1000);
    return response.status(200).json({
        proof: signCountryProof(runId, countryCode, issuedAt, secret),
    });
}
