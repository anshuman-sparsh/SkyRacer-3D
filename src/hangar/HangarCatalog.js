// M5-A: display-only aircraft catalog and theme defaults.
// Do not treat these entries as unlocked/equipped models before M5-B/C.
export const HANGAR_AIRCRAFT = Object.freeze([
    Object.freeze({
        id: 'cyan-striker', name: 'Cyan Striker', tier: 'Starter',
        color: 'cyan', requirement: 'Free · Neon / Cyan theme default',
        description: 'The original electric-cyan aircraft concept.',
    }),
    Object.freeze({
        id: 'ember-striker', name: 'Ember Striker', tier: 'Starter',
        color: 'ember', requirement: 'Free · Racing Ember theme default',
        description: 'The orange-and-black starter counterpart.',
    }),
    Object.freeze({
        id: 'silver-arrow', name: 'Silver Arrow', tier: 'Achievement',
        color: 'silver', requirement: 'Collect 100 verified rings',
        description: 'A clean silver finish with bright engine trails.',
    }),
    Object.freeze({
        id: 'voidrunner', name: 'Voidrunner', tier: 'Achievement',
        color: 'violet', requirement: 'Fly 10,000 units and collect 500 rings',
        description: 'A dark stealth silhouette with violet accents.',
    }),
    Object.freeze({
        id: 'nova-vortex', name: 'Nova Vortex', tier: 'Elite',
        color: 'nova', requirement: 'Fly 25,000 units and collect 1,500 rings',
        description: 'Proposed ring-assist ability for unranked Enhanced Flight.',
    }),
    Object.freeze({
        id: 'apex-overdrive', name: 'Apex Overdrive', tier: 'Legendary',
        color: 'apex', requirement: 'Win 10 Friend Challenges and complete 10 Daily Challenges',
        description: 'Proposed extended energy boost for unranked Enhanced Flight.',
    }),
]);

export const HANGAR_MILESTONES = Object.freeze([
    Object.freeze({ title: 'First Flight', criterion: 'Complete a verified Standard flight' }),
    Object.freeze({ title: 'Ring Collector', criterion: 'Collect 100 verified rings · Silver Arrow' }),
    Object.freeze({ title: 'Long Haul', criterion: 'Fly 10,000 verified distance units' }),
    Object.freeze({ title: 'Rival Hunter', criterion: 'Win 10 verified Friend Challenges' }),
]);

export function themeDefaultAircraft(theme) {
    return theme === 'neon' ? 'cyan-striker' : 'ember-striker';
}

export function aircraftForTheme(theme) {
    return HANGAR_AIRCRAFT.find(aircraft => aircraft.id === themeDefaultAircraft(theme));
}

// When M5-B introduces choosing a model, an explicit selection may override
// the theme, while 'match-theme' continues following live theme changes.
export function resolveAircraftId({ theme, preference = 'match-theme', ownedIds = [] } = {}) {
    if (preference !== 'match-theme' && ownedIds.includes(preference)
        && HANGAR_AIRCRAFT.some(aircraft => aircraft.id === preference)) {
        return preference;
    }
    return themeDefaultAircraft(theme);
}
