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
