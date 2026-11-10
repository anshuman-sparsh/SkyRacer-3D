export function usesTouchControls(win, nav = {}) {
    return Boolean(win.matchMedia?.('(pointer: coarse)').matches
        || (nav.maxTouchPoints > 0 && (win.matchMedia?.('(any-pointer: coarse)').matches
            || /iPad|Tablet|Android/i.test(nav.userAgent ?? '')
            || (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1))));
}

export function installScrollGuard(win) {
    const onWheel = event => {
        // Native dialogs scroll internally; overscroll-behavior contains them.
        if (!event.target?.closest?.('dialog, [data-quick-menu]')) event.preventDefault();
    };
    win.addEventListener('wheel', onWheel, { passive: false });
    return () => win.removeEventListener('wheel', onWheel);
}
