export function buildPolicy(mode, env = {}) {
    const poki = mode === 'poki';
    const online = poki && env.POKI_ONLINE_APPROVED === 'true';
    let validPrivacyUrl = false;
    try {
        const url = new URL(env.POKI_PRIVACY_POLICY_URL);
        validPrivacyUrl = url.protocol === 'https:' && !url.username && !url.password;
    } catch { /* Online mode fails closed without an explicit hosted policy. */ }
    if (online && (!/^https:\/\/[a-z0-9.-]+$/i.test(env.VITE_SUPABASE_URL ?? '')
        || !env.VITE_SUPABASE_PUBLISHABLE_KEY || !validPrivacyUrl
        || !env.POKI_CSP_APPROVAL_REFERENCE)) {
        throw Error('Poki online builds require an approved Supabase origin, public key, hosted privacy policy, and CSP approval reference.');
    }
    return { poki, localOnly: poki && !online, online,
        privacyUrl: online ? env.POKI_PRIVACY_POLICY_URL : '' };
}

export function pokiHtml(html, policy) {
    if (!policy.poki) return html;
    return html.replace(/<html lang="en"/, '<html lang="en" data-platform="poki"')
        .replace(/\s*<link[^>]+https:\/\/fonts\.[^>]+>/g, '')
        .replace(/<link rel="icon"[^>]+>/, '<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 32 32%27%3E%3Cpath fill=%27%235ef0ff%27 d=%27M16 2 29 28 16 22 3 28Z%27/%3E%3C/svg%3E" />')
        .replace("localStorage.getItem('skyracer_theme_v2')", "localStorage.getItem('skyracer_poki_v1:skyracer_theme_v2')")
        .replace('</head>', '<script async src="https://game-cdn.poki.com/scripts/v2/poki-sdk.js" data-poki-sdk></script></head>');
}
