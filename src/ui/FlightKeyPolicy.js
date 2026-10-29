/**
 * Flight shortcuts never initiate a new run or retry.
 * On-screen START FLIGHT / FLY AGAIN actions have exclusive launch ownership.
 * P and Escape retain their existing pause/resume behavior in active flights.
 */
export function shouldToggleFlightPause(state, keyCode, isRepeat = false) {
    return !isRepeat
        && (state === 'running' || state === 'paused')
        && (keyCode === 'KeyP' || keyCode === 'Escape');
}
