/**
 * Optional native-fetch Supabase transport; no extra browser dependencies.
 * Anonymous account tokens are stored on the player's device, never in URLs.
 * The service role/secret key must never be present in frontend code.
 */
const SESSION_KEY = 'skyracer_lb_session_v1';
const NAME_KEY = 'skyracer_lb_nickname_v1';

async function asJson(response) {
    const body = await response.json().catch(() => null);
    if (!response.ok) {
        const error = body?.error_description ?? body?.message ?? body?.error
            ?? 'The leaderboard is temporarily unavailable.';
        throw new Error(typeof error === 'string' ? error : 'Leaderboard request failed.');
    }
    return body;
}

export class LeaderboardService {
    constructor({
        url = import.meta.env?.VITE_SUPABASE_URL,
        publishableKey = import.meta.env?.VITE_SUPABASE_PUBLISHABLE_KEY,
        fetchImpl = (...args) => globalThis.fetch(...args),
        storage = null,
    } = {}) {
        this.url = typeof url === 'string' ? url.trim().replace(/\/+$/, '') : '';
        this.key = typeof publishableKey === 'string' ? publishableKey.trim() : '';
        this.enabled = /^https:\/\/[a-z0-9.-]+(?::\d+)?$/i.test(this.url)
            && this.key.length > 0 && typeof fetchImpl === 'function';
        this.fetchImpl = fetchImpl;
        // Browsers can throw just from reading localStorage (privacy mode).
        // Keep the entire game usable even if persistent storage is blocked.
        if (storage !== null) {
            this.storage = storage;
        } else {
            try { this.storage = globalThis.localStorage ?? null; }
            catch { this.storage = null; }
        }
        this.authPromise = null;
        this.session = this.#loadSession();
    }

    #read(key) {
        try { return this.storage?.getItem(key) ?? null; } catch { return null; }
    }

    #save(key, value) {
        try { this.storage?.setItem(key, value); } catch { /* Storage blocked */ }
    }

    #loadSession() {
        try {
            const value = JSON.parse(this.#read(SESSION_KEY) ?? 'null');
            return typeof value?.access_token === 'string'
                && typeof value?.refresh_token === 'string' ? value : null;
        } catch { return null; }
    }

    #storeSession(raw) {
        const data = raw?.session ?? raw;
        if (typeof data?.access_token !== 'string'
            || typeof data?.refresh_token !== 'string') {
            throw new Error('Could not start an anonymous player session.');
        }
        this.session = {
            access_token: data.access_token,
            refresh_token: data.refresh_token,
            expires_at: Number(data.expires_at)
                || Math.floor(Date.now() / 1000) + Number(data.expires_in ?? 3600),
        };
        this.#save(SESSION_KEY, JSON.stringify(this.session));
        return this.session;
    }

    async #auth(endpoint, body) {
        const response = await this.fetchImpl(`${this.url}/auth/v1/${endpoint}`, {
            method: 'POST',
            headers: { apikey: this.key, 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        return this.#storeSession(await asJson(response));
    }

    async #ensureSession(forceRefresh = false) {
        if (!this.enabled) throw new Error('Leaderboard is not configured.');
        if (!forceRefresh && this.session?.expires_at > Date.now() / 1000 + 45) {
            return this.session;
        }
        if (this.authPromise) return this.authPromise;
        this.authPromise = (async () => {
            if (this.session?.refresh_token) {
                try {
                    return await this.#auth('token?grant_type=refresh_token', {
                        refresh_token: this.session.refresh_token,
                    });
                } catch {
                    this.session = null;
                }
            }
            return this.#auth('signup', { data: {} });
        })();
        try { return await this.authPromise; }
        finally { this.authPromise = null; }
    }

    async #request(method, body = null, retry = true) {
        const session = await this.#ensureSession();
        const response = await this.fetchImpl(`${this.url}/functions/v1/leaderboard`, {
            method,
            headers: {
                apikey: this.key,
                Authorization: `Bearer ${session.access_token}`,
                ...(body ? { 'Content-Type': 'application/json' } : {}),
            },
            ...(body ? { body: JSON.stringify(body) } : {}),
        });
        if (response.status === 401 && retry) {
            await this.#ensureSession(true);
            return this.#request(method, body, false);
        }
        return asJson(response);
    }

    async beginRun() {
        if (!this.enabled) return null;
        const result = await this.#request('POST', { action: 'start' });
        if (typeof result?.runId !== 'string') throw new Error('Run could not be registered.');
        return result.runId;
    }

    async #getCountryProof(runId) {
        // Ask our same-origin Vercel Function to sign the player's IP-derived
        // country for this run. On localhost or unsupported networks the
        // response has no proof; scoring remains fully operational.
        try {
            const response = await this.fetchImpl('/api/country', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ runId }),
                cache: 'no-store',
            });
            if (!response.ok) return null;
            const data = await response.json();
            return typeof data?.proof === 'string' && data.proof.length <= 160
                ? data.proof : null;
        } catch {
            return null;
        }
    }

    async finishRun({ runId, nickname, score, rings, distance }) {
        const countryProof = await this.#getCountryProof(runId);
        const result = await this.#request('POST', {
            action: 'finish', runId, nickname, score, rings, distance,
            ...(countryProof ? { countryProof } : {}),
        });
        if (result?.accepted) this.#save(NAME_KEY, nickname);
        return result;
    }

    async getLeaderboard() {
        if (!this.enabled) return { entries: [], me: null };
        const response = await this.#request('GET');
        // Always prefer the server's immutable registered nickname over an
        // outdated value in localStorage for this browser session.
        if (typeof response?.me?.nickname === 'string') {
            this.#save(NAME_KEY, response.me.nickname);
        }
        return response;
    }

    getNickname() {
        return this.#read(NAME_KEY) ?? '';
    }
}
