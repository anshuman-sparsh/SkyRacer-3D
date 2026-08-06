const KEY_ACTIONS = {
    KeyA: 'moveLeft',
    ArrowLeft: 'moveLeft',
    KeyD: 'moveRight',
    ArrowRight: 'moveRight',
    KeyW: 'moveUp',
    ArrowUp: 'moveUp',
    KeyS: 'moveDown',
    ArrowDown: 'moveDown',
    Space: 'boost',
    ShiftLeft: 'boost',
    ShiftRight: 'boost',
};

const DOUBLE_TAP_WINDOW = 320;
const TOUCH_BOOST_DURATION = 900;

export class InputManager {
    constructor(eventTarget = window, { touchSurface = null, boostButton = null } = {}) {
        this.eventTarget = eventTarget;
        this.touchSurface = touchSurface;
        this.boostButton = boostButton;
        this.state = {
            moveLeft: false,
            moveRight: false,
            moveUp: false,
            moveDown: false,
            boost: false,
        };

        // Steering direction is tracked per pointer id so a second finger can never
        // strand the first one's direction in the on state.
        this.activePointers = new Map();
        this.lastTapTime = 0;
        this.touchBoostTimeout = 0;

        this.handleKeyDown = (event) => this.#setKeyState(event, true);
        this.handleKeyUp = (event) => this.#setKeyState(event, false);
        this.handleBlur = () => this.reset();
        this.eventTarget.addEventListener('keydown', this.handleKeyDown);
        this.eventTarget.addEventListener('keyup', this.handleKeyUp);
        window.addEventListener('blur', this.handleBlur);

        this.handlePointerDown = (event) => this.#onPointerDown(event);
        this.handlePointerMove = (event) => this.#onPointerMove(event);
        this.handlePointerEnd = (event) => this.#onPointerEnd(event);
        this.handleBoostPress = (event) => this.#onBoostPress(event);

        if (this.touchSurface) {
            this.touchSurface.addEventListener('pointerdown', this.handlePointerDown);
            this.touchSurface.addEventListener('pointermove', this.handlePointerMove);
            this.touchSurface.addEventListener('pointerup', this.handlePointerEnd);
            this.touchSurface.addEventListener('pointercancel', this.handlePointerEnd);
            this.touchSurface.addEventListener('pointerleave', this.handlePointerEnd);
        }

        if (this.boostButton) {
            this.boostButton.addEventListener('pointerdown', this.handleBoostPress);
        }
    }

    #setKeyState(event, isPressed) {
        const action = KEY_ACTIONS[event.code];
        if (!action) return;

        event.preventDefault();
        this.state[action] = isPressed;
    }

    /** Left half of the surface steers left, right half steers right. */
    #directionFor(event) {
        const bounds = this.touchSurface.getBoundingClientRect();
        if (bounds.width === 0) return null;
        return event.clientX - bounds.left < bounds.width / 2 ? 'moveLeft' : 'moveRight';
    }

    #onPointerDown(event) {
        if (event.pointerType === 'mouse') return;

        const direction = this.#directionFor(event);
        if (!direction) return;

        this.activePointers.set(event.pointerId, direction);
        this.#applyPointerState();

        const now = performance.now();
        if (now - this.lastTapTime < DOUBLE_TAP_WINDOW) {
            this.#triggerTouchBoost();
            this.lastTapTime = 0;
        } else {
            this.lastTapTime = now;
        }
    }

    #onPointerMove(event) {
        if (!this.activePointers.has(event.pointerId)) return;

        const direction = this.#directionFor(event);
        if (!direction) return;

        this.activePointers.set(event.pointerId, direction);
        this.#applyPointerState();
    }

    #onPointerEnd(event) {
        if (!this.activePointers.delete(event.pointerId)) return;
        this.#applyPointerState();
    }

    #applyPointerState() {
        const directions = new Set(this.activePointers.values());
        this.state.moveLeft = directions.has('moveLeft');
        this.state.moveRight = directions.has('moveRight');
    }

    #onBoostPress(event) {
        event.preventDefault();
        this.#triggerTouchBoost();
    }

    /** Touch boost is time-limited since a tap has no natural release event. */
    #triggerTouchBoost() {
        this.state.boost = true;
        window.clearTimeout(this.touchBoostTimeout);
        this.touchBoostTimeout = window.setTimeout(() => {
            this.state.boost = false;
        }, TOUCH_BOOST_DURATION);
    }

    reset() {
        for (const action of Object.keys(this.state)) {
            this.state[action] = false;
        }
        this.activePointers.clear();
        window.clearTimeout(this.touchBoostTimeout);
    }

    destroy() {
        this.eventTarget.removeEventListener('keydown', this.handleKeyDown);
        this.eventTarget.removeEventListener('keyup', this.handleKeyUp);
        window.removeEventListener('blur', this.handleBlur);

        if (this.touchSurface) {
            this.touchSurface.removeEventListener('pointerdown', this.handlePointerDown);
            this.touchSurface.removeEventListener('pointermove', this.handlePointerMove);
            this.touchSurface.removeEventListener('pointerup', this.handlePointerEnd);
            this.touchSurface.removeEventListener('pointercancel', this.handlePointerEnd);
            this.touchSurface.removeEventListener('pointerleave', this.handlePointerEnd);
        }

        if (this.boostButton) {
            this.boostButton.removeEventListener('pointerdown', this.handleBoostPress);
        }

        this.reset();
    }
}
