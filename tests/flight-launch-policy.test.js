import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { shouldToggleFlightPause } from '../src/ui/FlightKeyPolicy.js';

test('no key can start a new flight or retry after termination', () => {
    for (const state of ['start', 'terminated']) {
        for (const key of [
            'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
            'KeyW', 'KeyA', 'KeyS', 'KeyD',
            'Space', 'Enter', 'Escape', 'KeyP', 'ShiftLeft',
        ]) {
            assert.equal(shouldToggleFlightPause(state, key, false), false,
                state + ' must ignore ' + key);
        }
    }
});

test('P and Escape retain pause/resume behavior in active flights only', () => {
    for (const state of ['running', 'paused']) {
        assert.equal(shouldToggleFlightPause(state, 'KeyP'), true);
        assert.equal(shouldToggleFlightPause(state, 'Escape'), true);
        assert.equal(shouldToggleFlightPause(state, 'KeyP', true), false);
        assert.equal(shouldToggleFlightPause(state, 'ArrowUp'), false);
        assert.equal(shouldToggleFlightPause(state, 'Enter'), false);
        assert.equal(shouldToggleFlightPause(state, 'Space'), false);
    }
});

test('only explicit Start Flight and Fly Again buttons are wired to launch/retry', () => {
    const source = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
    const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

    const handler = source.match(/function handleGameKey\(event\)\s*\{([\s\S]*?)\n\}/)?.[1];
    assert.ok(handler, 'Expected the application keyboard handler');
    assert.doesNotMatch(handler, /startRunning|restartRun|beginOnlineRun/);
    assert.match(handler, /shouldToggleFlightPause\(gameState, event\.code, event\.repeat\)/);
    assert.doesNotMatch(source, /stateOverlay\.addEventListener\(['"]pointerdown['"]/);
    assert.doesNotMatch(source, /stateOverlay\.addEventListener\(['"]touchstart['"]/);
    assert.doesNotMatch(source, /function handleOverlayPointerDown/);

    assert.match(source, /startFlightButton\.addEventListener\(['"]click['"]/);
    assert.match(source, /if \(gameState === 'start' \|\| gameState === 'paused'\) void startRunning\(\)/);
    assert.match(source, /restartButton\.addEventListener\(['"]click['"], restartRun\)/);
    assert.match(html, /data-start-flight>START FLIGHT<\/button>/);
    assert.match(html, /data-restart hidden>FLY AGAIN<\/button>/);
});
