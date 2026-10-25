/**
 * Deterministic off-track landmarks for each recycled course segment.
 * This uses no TrackManager randomness, so obstacles and rings retain their
 * established spawn sequence. No objects are created during animation frames.
 */
export const SCENERY_STATIONS_PER_SIDE = 4;

function fraction(seed, side, station, channel) {
    let value = (Math.imul(seed | 0, 0x9e3779b1)
        ^ Math.imul(side, 0x85ebca6b)
        ^ Math.imul(station + 1, 0xc2b2ae35)
        ^ Math.imul(channel + 1, 0x27d4eb2f)) >>> 0;
    value = Math.imul(value ^ (value >>> 16), 0x7feb352d);
    value = Math.imul(value ^ (value >>> 15), 0x846ca68b);
    return ((value ^ (value >>> 16)) >>> 0) / 0x100000000;
}

/**
 * Landmark positions are local to one track segment. Markers stay beyond the
 * guard rails, while tall silhouettes are much further from the flight lane.
 */
export function buildSceneryLayout(width, length, segmentZ) {
    const seed = Math.round(segmentZ / length);
    const placements = [];
    for (const side of [-1, 1]) {
        for (let station = 0; station < SCENERY_STATIONS_PER_SIDE; station += 1) {
            const markerZ = -length / 2 + length
                * (station + 0.5) / SCENERY_STATIONS_PER_SIDE;
            const towerZ = markerZ
                + (fraction(seed, side, station, 0) - 0.5) * length * 0.12;
            // Alternate two subtle depth bands, never introducing landmarks
            // into the flight corridor or changing gameplay RNG.
            const farLayer = (station + (side > 0 ? 1 : 0)) % 2 === 1;
            placements.push({
                markerX: side * (width / 2 + 2.1),
                markerZ,
                markerHeight: station % 3 === 0 ? 1.7 : 1.35,
                markerWidth: station % 3 === 0 ? 0.18 : 0.13,
                towerLayer: farLayer ? 'far' : 'near',
                towerX: side * (width / 2 + (farLayer ? 20 : 9)
                    + fraction(seed, side, station, 1) * (farLayer ? 7 : 8)),
                towerZ,
                towerHeight: 3.5 + fraction(seed, side, station, 2) * (farLayer ? 5.7 : 8.5),
                towerWidth: 1 + fraction(seed, side, station, 3) * 1.7,
                towerDepth: 0.9 + fraction(seed, side, station, 4) * 1.5,
            });
        }
    }
    return placements;
}

/** Smooth, frame-rate-independent response for decorative light accents. */
export function advanceSceneryGlow(current, enabled, delta) {
    const blend = 1 - Math.exp(-4 * Math.max(0, delta));
    return current + ((enabled ? 1 : 0) - current) * blend;
}
