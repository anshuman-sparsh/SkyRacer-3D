import test from 'node:test';
import assert from 'node:assert/strict';
import { InputManager } from '../src/managers/InputManager.js';

test('quick navigation steals neither Space nor arrow keys from native controls', () => {
    const previousWindow = globalThis.window;
    const listeners = new Map();
    const windowStub = {
        addEventListener(type, callback) { listeners.set(type, callback); },
        removeEventListener(type) { listeners.delete(type); },
    };
    globalThis.window = windowStub;
    let input;
    try {
        input = new InputManager(windowStub);
        const keydown = listeners.get('keydown');
        let blockedDefault = false;
        const quickMenuButton = {
            closest(selector) {
                return selector.includes('[data-quick-menu]') ? {} : null;
            },
        };
        keydown({
            code: 'Space', target: quickMenuButton,
            preventDefault() { blockedDefault = true; },
        });
        assert.equal(input.state.boost, false);
        assert.equal(blockedDefault, false);
        // Browser native Space/Enter activation must still work on primary
        // actions even while global game input listeners are mounted.
        for (const attr of ['data-start-flight', 'data-restart']) {
            blockedDefault = false;
            const button = { closest: (selector) => selector.includes('[' + attr + ']') ? {} : null };
            keydown({
                code: 'Space', target: button,
                preventDefault() { blockedDefault = true; },
            });
            assert.equal(blockedDefault, false, attr + ' must keep native click behavior');
            assert.equal(input.state.boost, false);
        }

        const canvas = { closest: () => null };
        keydown({
            code: 'Space', target: canvas,
            preventDefault() { blockedDefault = true; },
        });
        assert.equal(input.state.boost, true);
        assert.equal(blockedDefault, true);
    } finally {
        input?.destroy();
        if (previousWindow === undefined) delete globalThis.window;
        else globalThis.window = previousWindow;
    }
});
