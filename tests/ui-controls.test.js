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

test('typing flight-control letters in nickname and editable fields is never intercepted', () => {
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
        const targets = [
            { name: 'Classic nickname', selector: 'input' },
            { name: 'Daily nickname', selector: 'input' },
            { name: 'Friend nickname', selector: 'input' },
            { name: 'textarea', selector: 'textarea' },
            { name: 'select', selector: 'select' },
            { name: 'editable', selector: '[contenteditable]' },
            { name: 'custom textbox', selector: '[role="textbox"]' },
        ];
        const keys = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'ArrowLeft', 'ArrowRight'];
        for (const target of targets) {
            for (const code of keys) {
                let prevented = false;
                const event = {
                    code,
                    target: { closest: selector => selector.includes(target.selector) ? {} : null },
                    preventDefault() { prevented = true; },
                };
                listeners.get('keydown')(event);
                listeners.get('keyup')(event);
                assert.equal(prevented, false, target.name + ' blocked ' + code);
                assert.equal(input.state.moveLeft, false);
                assert.equal(input.state.moveRight, false);
                assert.equal(input.state.moveUp, false);
                assert.equal(input.state.moveDown, false);
                assert.equal(input.state.boost, false);
            }
        }
        const composing = {
            code: 'KeyW', isComposing: true, target: { closest: () => null },
            preventDefault() { throw Error('IME composition interrupted'); },
        };
        listeners.get('keydown')(composing);
        assert.equal(input.state.moveUp, false);
        const editable = {
            code: 'Space', target: { isContentEditable: true, closest: () => null },
            preventDefault() { throw Error('contenteditable interrupted'); },
        };
        listeners.get('keydown')(editable);
        assert.equal(input.state.boost, false);

        // Gameplay input must still work when the canvas receives keyboard input.
        let prevented = false;
        listeners.get('keydown')({
            code: 'KeyW', target: { closest: () => null },
            preventDefault() { prevented = true; },
        });
        assert.equal(prevented, true);
        assert.equal(input.state.moveUp, true);
        listeners.get('keyup')({
            code: 'KeyW', target: { closest: () => null },
            preventDefault() {},
        });
        assert.equal(input.state.moveUp, false);
    } finally {
        input?.destroy();
        if (previousWindow === undefined) delete globalThis.window;
        else globalThis.window = previousWindow;
    }
});
