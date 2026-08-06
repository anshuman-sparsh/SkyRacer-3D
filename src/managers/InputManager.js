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

const JOYSTICK_RADIUS = 54;
const INPUT_DEAD_ZONE = 0.08;

export class InputManager {
    constructor(eventTarget = window, {
        touchSurface = null,
        boostButton = null,
        touchIndicator = null,
        touchIndicatorThumb = null,
    } = {}) {
        this.eventTarget = eventTarget;
        this.touchSurface = touchSurface;
        this.boostButton = boostButton;
        this.touchIndicator = touchIndicator;
        this.touchIndicatorThumb = touchIndicatorThumb;
        this.state = {
            moveLeft: false,
            moveRight: false,
            moveUp: false,
            moveDown: false,
            boost: false,
            steer: 0,
            pitch: 0,
        };

        this.controlPointerId = null;
        this.boostPointerId = null;
        this.touchOrigin = { x: 0, y: 0 };

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
        this.handleBoostRelease = (event) => this.#onBoostRelease(event);

        if (this.touchSurface) {
            this.touchSurface.addEventListener('pointerdown', this.handlePointerDown);
            this.touchSurface.addEventListener('pointermove', this.handlePointerMove);
            this.touchSurface.addEventListener('pointerup', this.handlePointerEnd);
            this.touchSurface.addEventListener('pointercancel', this.handlePointerEnd);
            this.touchSurface.addEventListener('lostpointercapture', this.handlePointerEnd);
        }

        if (this.boostButton) {
            this.boostButton.addEventListener('pointerdown', this.handleBoostPress);
            this.boostButton.addEventListener('pointerup', this.handleBoostRelease);
            this.boostButton.addEventListener('pointercancel', this.handleBoostRelease);
            this.boostButton.addEventListener('lostpointercapture', this.handleBoostRelease);
        }
    }

    #setKeyState(event, isPressed) {
        const action = KEY_ACTIONS[event.code];
        if (!action) return;

        event.preventDefault();
        this.state[action] = isPressed;
    }

    #onPointerDown(event) {
        if (event.pointerType === 'mouse' || this.controlPointerId !== null) return;

        event.preventDefault();
        this.controlPointerId = event.pointerId;
        this.touchOrigin.x = event.clientX;
        this.touchOrigin.y = event.clientY;
        this.touchSurface.setPointerCapture?.(event.pointerId);
        this.#showTouchIndicator();
        this.#updateTouchAxes(event);
    }

    #onPointerMove(event) {
        if (event.pointerId !== this.controlPointerId) return;
        event.preventDefault();
        this.#updateTouchAxes(event);
    }

    #onPointerEnd(event) {
        if (event.pointerId !== this.controlPointerId) return;

        this.controlPointerId = null;
        this.state.steer = 0;
        this.state.pitch = 0;
        this.#hideTouchIndicator();
    }

    #updateTouchAxes(event) {
        const deltaX = event.clientX - this.touchOrigin.x;
        const deltaY = event.clientY - this.touchOrigin.y;
        const distance = Math.hypot(deltaX, deltaY);
        const scale = distance > JOYSTICK_RADIUS ? JOYSTICK_RADIUS / distance : 1;
        const constrainedX = deltaX * scale;
        const constrainedY = deltaY * scale;

        this.state.steer = this.#applyDeadZone(constrainedX / JOYSTICK_RADIUS);
        this.state.pitch = this.#applyDeadZone(-constrainedY / JOYSTICK_RADIUS);

        if (this.touchIndicatorThumb) {
            this.touchIndicatorThumb.style.transform = `translate3d(${constrainedX}px, ${constrainedY}px, 0)`;
        }
    }

    #applyDeadZone(value) {
        if (Math.abs(value) < INPUT_DEAD_ZONE) return 0;
        return Math.sign(value) * (Math.abs(value) - INPUT_DEAD_ZONE) / (1 - INPUT_DEAD_ZONE);
    }

    #showTouchIndicator() {
        if (!this.touchIndicator) return;
        this.touchIndicator.style.transform = `translate3d(${this.touchOrigin.x}px, ${this.touchOrigin.y}px, 0)`;
        this.touchIndicator.classList.add('is-active');
    }

    #hideTouchIndicator() {
        this.touchIndicator?.classList.remove('is-active');
        if (this.touchIndicatorThumb) this.touchIndicatorThumb.style.transform = 'translate3d(0, 0, 0)';
    }

    #onBoostPress(event) {
        if (event.pointerType === 'mouse' && event.button !== 0) return;
        event.preventDefault();
        if (this.boostPointerId !== null) return;

        this.boostPointerId = event.pointerId;
        this.state.boost = true;
        this.boostButton.setPointerCapture?.(event.pointerId);
        this.boostButton.classList.add('is-active');
    }

    #onBoostRelease(event) {
        if (event.pointerId !== this.boostPointerId) return;
        this.boostPointerId = null;
        this.state.boost = false;
        this.boostButton.classList.remove('is-active');
    }

    reset() {
        if (this.controlPointerId !== null && this.touchSurface?.hasPointerCapture?.(this.controlPointerId)) {
            this.touchSurface.releasePointerCapture(this.controlPointerId);
        }
        if (this.boostPointerId !== null && this.boostButton?.hasPointerCapture?.(this.boostPointerId)) {
            this.boostButton.releasePointerCapture(this.boostPointerId);
        }

        this.state.moveLeft = false;
        this.state.moveRight = false;
        this.state.moveUp = false;
        this.state.moveDown = false;
        this.state.boost = false;
        this.state.steer = 0;
        this.state.pitch = 0;
        this.controlPointerId = null;
        this.boostPointerId = null;
        this.#hideTouchIndicator();
        this.boostButton?.classList.remove('is-active');
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
            this.touchSurface.removeEventListener('lostpointercapture', this.handlePointerEnd);
        }

        if (this.boostButton) {
            this.boostButton.removeEventListener('pointerdown', this.handleBoostPress);
            this.boostButton.removeEventListener('pointerup', this.handleBoostRelease);
            this.boostButton.removeEventListener('pointercancel', this.handleBoostRelease);
            this.boostButton.removeEventListener('lostpointercapture', this.handleBoostRelease);
        }

        this.reset();
    }
}
