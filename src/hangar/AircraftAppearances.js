// Fixed procedural paint schemes. Visual appearance must never change flight physics.
export const AIRCRAFT_APPEARANCES = Object.freeze({
    'cyan-striker': Object.freeze({
        hull: 0x24bfb7, hullGlow: 0x063e3b, trim: 0xf6c84b,
        trimGlow: 0x4a3003, canopy: 0x67cfff, canopyGlow: 0x123d66,
        exhaust: 0x8cfff0, hotCore: 0xfff2a6, trail: 0x66ffe2,
        detail: 0x83f6ed, profile: 'striker',
    }),
    'ember-striker': Object.freeze({
        hull: 0xe47724, hullGlow: 0x592009, trim: 0xffc074,
        trimGlow: 0x78300b, canopy: 0xffd292, canopyGlow: 0x7b330c,
        exhaust: 0xff8b3d, hotCore: 0xffe09b, trail: 0xff8131,
        detail: 0xffbe78, profile: 'striker',
    }),
    'silver-arrow': Object.freeze({
        hull: 0xd9e5ee, hullGlow: 0x34435c, trim: 0x7890ad,
        trimGlow: 0x212f49, canopy: 0xd9f8ff, canopyGlow: 0x426c8a,
        exhaust: 0xe0faff, hotCore: 0xffffff, trail: 0xcdefff,
        detail: 0xffffff, profile: 'arrow',
    }),
    'voidrunner': Object.freeze({
        hull: 0x26263e, hullGlow: 0x1b1539, trim: 0x9361e9,
        trimGlow: 0x4c228a, canopy: 0x9c8eff, canopyGlow: 0x392e9d,
        exhaust: 0xa35dff, hotCore: 0xe4b5ff, trail: 0x7c4dff,
        detail: 0x8f69ff, profile: 'void',
    }),
    'nova-vortex': Object.freeze({
        hull: 0x275cb7, hullGlow: 0x202a7e, trim: 0xe078f5,
        trimGlow: 0x78268b, canopy: 0xc0f0ff, canopyGlow: 0x2457a9,
        exhaust: 0xd35fff, hotCore: 0xffffff, trail: 0x9c77ff,
        detail: 0x94d7ff, profile: 'nova',
    }),
    'apex-overdrive': Object.freeze({
        hull: 0x9d2635, hullGlow: 0x61111e, trim: 0xf9bc5e,
        trimGlow: 0x854811, canopy: 0xffe2a7, canopyGlow: 0x8c4012,
        exhaust: 0xff5e31, hotCore: 0xffefb2, trail: 0xff8b44,
        detail: 0xffd570, profile: 'apex',
    }),
});

export function appearanceFor(id) {
    return AIRCRAFT_APPEARANCES[id] ?? AIRCRAFT_APPEARANCES['ember-striker'];
}
