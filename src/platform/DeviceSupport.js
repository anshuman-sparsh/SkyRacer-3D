export function usesTouchControls(win, nav = {}) {
    return Boolean(win.matchMedia?.('(pointer: coarse)').matches
        || (nav.maxTouchPoints > 0 && (win.matchMedia?.('(any-pointer: coarse)').matches
            || /iPad|Tablet|Android/i.test(nav.userAgent ?? '')
            || (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1))));
}

export function installScrollGuard(win) {
    const onWheel = event => {
        // Results can exceed a short viewport; keep their native scrolling too.
        if (!event.target?.closest?.('dialog, [data-quick-menu], .state-overlay__content')) event.preventDefault();
    };
    win.addEventListener('wheel', onWheel, { passive: false });
    return () => win.removeEventListener('wheel', onWheel);
}
