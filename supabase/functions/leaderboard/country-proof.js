// The proof is minted on Vercel from its request IP-geolocation header.
// Verify its HMAC here; never trust a client-sent two-letter country directly.
// This module uses Web Crypto so the same verifier runs in Deno and Node tests.
const PROOF_PATTERN = /^v1\.([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.([A-Z]{2})\.(\d{10})\.([a-f0-9]{64})$/i;
const MAX_AGE_MS = 5 * 60 * 1000;
const MAX_CLOCK_SKEW_MS = 30 * 1000;

export async function verifyCountryProof(proof, expectedRunId, secret, now = Date.now()) {
    if (typeof proof !== 'string' || proof.length > 160
        || typeof secret !== 'string' || secret.length < 32
        || typeof expectedRunId !== 'string') return null;

    const match = PROOF_PATTERN.exec(proof);
    if (!match || match[1] !== expectedRunId || !/^[A-Z]{2}$/.test(match[2])) return null;

    const issuedAtMs = Number(match[3]) * 1000;
    if (!Number.isSafeInteger(issuedAtMs)
        || issuedAtMs > now + MAX_CLOCK_SKEW_MS
        || now - issuedAtMs > MAX_AGE_MS) return null;

    const payload = `v1.${match[1]}.${match[2]}.${match[3]}`;
    const signatureHex = match[4];
    const signature = new Uint8Array(32);
    for (let i = 0; i < signature.length; i += 1) {
        signature[i] = Number.parseInt(signatureHex.slice(i * 2, i * 2 + 2), 16);
    }

    const key = await crypto.subtle.importKey(
        'raw', new TextEncoder().encode(secret),
        { name: 'HMAC', hash: 'SHA-256' }, false, ['verify'],
    );
    const valid = await crypto.subtle.verify(
        'HMAC', key, signature, new TextEncoder().encode(payload),
    );
    return valid ? match[2] : null;
}
