/**
 * M5-D: earned elite abilities are active in ALL flight modes when equipped:
 * Classic, Daily Challenge, and Friend Challenge. They do not change score
 * formulas, course generation, collisions, or maximum flight speeds.
 *
 * Buffs are deliberately small and within existing server plausibility limits.
 */
export const BASE_RING_CAPTURE_RADIUS = 0.7;
export const BASE_ENERGY_BOOST_DURATION = 4.5;
export const NOVA_RING_CAPTURE_RADIUS = 0.9;
export const APEX_ENERGY_BOOST_DURATION = 6.0;

const STANDARD = Object.freeze({
    id: 'standard', title: 'Standard flight',
    ringCaptureRadius: BASE_RING_CAPTURE_RADIUS,
    energyBoostDuration: BASE_ENERGY_BOOST_DURATION,
});
const NOVA = Object.freeze({
    id: 'ring-assist', title: 'Ring Assist',
    ringCaptureRadius: NOVA_RING_CAPTURE_RADIUS,
    energyBoostDuration: BASE_ENERGY_BOOST_DURATION,
});
const APEX = Object.freeze({
    id: 'extended-boost', title: 'Extended Boost',
    ringCaptureRadius: BASE_RING_CAPTURE_RADIUS,
    energyBoostDuration: APEX_ENERGY_BOOST_DURATION,
});

export function eliteAbilityFor(aircraftId, ownedIds = []) {
    // A locally persisted preference is never enough to claim a locked reward.
    if (!Array.isArray(ownedIds) || !ownedIds.includes(aircraftId)) return STANDARD;
    if (aircraftId === 'nova-vortex') return NOVA;
    if (aircraftId === 'apex-overdrive') return APEX;
    return STANDARD;
}
