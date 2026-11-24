import { usesTouchControls } from '../platform/DeviceSupport.js';

const positive = (value, fallback) => Number.isFinite(value) && value > 0 ? value : fallback;
export function boundedPixelRatio(width, height, dpr = 1, cap = 1.5, pixelBudget = 6_000_000) {
    return Math.min(positive(dpr, 1), cap,
        Math.sqrt(pixelBudget / (positive(width, 1) * positive(height, 1))));
}

/** Hints only affect decorative quality, never simulation or course generation. */
export function qualityProfile({ width = 1, height = 1, dpr = 1, touch = false,
    deviceMemory, hardwareConcurrency } = {}) {
    const limited = (positive(deviceMemory, Infinity) <= 4)
        || (positive(hardwareConcurrency, Infinity) <= 4);
    const compact = Math.min(positive(width, 1), positive(height, 1)) < 600;
    const reducedScenery = touch || compact || limited;
    const maxPixelRatio = reducedScenery ? 1 : 1.5;
    const pixelBudget = reducedScenery ? 2_000_000 : 6_000_000;
    return { reducedScenery, maxPixelRatio, pixelBudget,
        pixelRatio: boundedPixelRatio(width, height, dpr, maxPixelRatio, pixelBudget),
        speedParticles: limited ? 120 : reducedScenery ? 150 : 180 };
}

export function readQualityProfile(win = window, nav = navigator, width = win.innerWidth, height = win.innerHeight) {
    return qualityProfile({ width, height, dpr: win.devicePixelRatio,
        touch: usesTouchControls(win, nav), deviceMemory: nav.deviceMemory,
        hardwareConcurrency: nav.hardwareConcurrency });
}

const sizes = new WeakMap();
/** One atomic buffer resize, and none when URL-bar/observer events repeat. */
export function sizeRenderer(renderer, width, height, pixelRatio) {
    width = Math.max(1, Math.floor(positive(width, 1)));
    height = Math.max(1, Math.floor(positive(height, 1)));
    const previous = sizes.get(renderer);
    if (previous?.width === width && previous.height === height && previous.pixelRatio === pixelRatio) return false;
    renderer.setDrawingBufferSize(width, height, pixelRatio);
    sizes.set(renderer, { width, height, pixelRatio });
    return true;
}
