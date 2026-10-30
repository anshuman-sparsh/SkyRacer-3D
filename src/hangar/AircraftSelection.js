import { resolveAircraftId } from './HangarCatalog.js';
export const AIRCRAFT_PREFERENCE_KEY = 'skyracer_aircraft_preference_v1';
export const FREE_AIRCRAFT = Object.freeze(['cyan-striker','ember-striker']);
export class AircraftSelection {
    constructor({ storage = null, theme = 'ember', onChange = () => {} } = {}) {
        this.storage = storage;
        this.theme = theme;
        this.onChange = onChange;
        let preference = 'match-theme';
        try { preference = storage?.getItem(AIRCRAFT_PREFERENCE_KEY) ?? 'match-theme'; } catch {}
        this.preference = FREE_AIRCRAFT.includes(preference) ? preference : 'match-theme';
        this.notify();
    }
    get activeId() {
        return resolveAircraftId({theme:this.theme, preference:this.preference, ownedIds:FREE_AIRCRAFT});
    }
    choose(preference) {
        if (preference !== 'match-theme' && !FREE_AIRCRAFT.includes(preference)) return false;
        this.preference = preference;
        try { this.storage?.setItem(AIRCRAFT_PREFERENCE_KEY, preference); } catch {}
        this.notify();
        return true;
    }
    setTheme(theme) { this.theme = theme; this.notify(); }
    notify() { this.onChange(this.activeId, this.preference); }
}
