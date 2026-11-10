/** Poki records never share keys with web identities, records, or equipment. */
export function createSafeStorage({ getStorage = () => globalThis.localStorage,
    prefix = 'skyracer_poki_v1:', onUnavailable = () => {} } = {}) {
    const memory = new Map();
    let unavailable = false;
    function fail() { if (!unavailable) { unavailable = true; onUnavailable(); } }
    return {
        get persistent() { return !unavailable; },
        getItem(key) {
            if (memory.has(key)) return memory.get(key);
            if (unavailable) return null;
            try {
                const storage = getStorage();
                if (!storage) throw Error('Storage unavailable');
                const value = storage.getItem(prefix + key);
                if (value !== null) memory.set(key, value);
                return value;
            } catch { fail(); return null; }
        },
        setItem(key, value) {
            memory.set(key, String(value));
            if (unavailable) return;
            try { const storage = getStorage(); if (!storage) throw Error(); storage.setItem(prefix + key, String(value)); }
            catch { fail(); }
        },
        removeItem(key) {
            memory.set(key, null);
            if (unavailable) return;
            try { const storage = getStorage(); if (!storage) throw Error(); storage.removeItem(prefix + key); }
            catch { fail(); }
        },
    };
}
