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

const JOYSTICK_RADIUS = 44;
const TOUCH_SENSITIVITY = 1.25;
const INPUT_DEAD_ZONE = 0.045;
const TOUCH_INPUT_RESPONSE = 24;
const TOUCH_RELEASE_RESPONSE = 30;

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
        this.targetSteer = 0;
        this.targetPitch = 0;
        this.thumbX = 0;
        this.thumbY = 0;
        this.isThumbDirty = false;

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
        // A held BOOST is a game control, not a request to select its label
        // or open the mobile browser's text editing / context menu.
        this.handleBoostSelection = (event) => event.preventDefault();

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
            this.boostButton.addEventListener('contextmenu', this.handleBoostSelection);
            this.boostButton.addEventListener('selectstart', this.handleBoostSelection);
        }
    }

    #setKeyState(event, isPressed) {
        // A keyboard-focused help control must retain native Enter/Space
        // activation. Gameplay input resumes normally after the dialog closes.
        if (event.target?.closest?.('button, input, textarea, select, dialog')) return;
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
        const coalescedEvents = event.getCoalescedEvents?.();
        this.#updateTouchAxes(coalescedEvents?.at(-1) ?? event);
    }

    #onPointerEnd(event) {
        if (event.pointerId !== this.controlPointerId) return;

        this.controlPointerId = null;
        this.targetSteer = 0;
        this.targetPitch = 0;
        this.thumbX = 0;
        this.thumbY = 0;
        this.isThumbDirty = true;
        this.#hideTouchIndicator();
    }

    #updateTouchAxes(event) {
        const deltaX = event.clientX - this.touchOrigin.x;
        const deltaY = event.clientY - this.touchOrigin.y;
        const distance = Math.hypot(deltaX, deltaY);
        const scale = distance > JOYSTICK_RADIUS ? JOYSTICK_RADIUS / distance : 1;
        const constrainedX = deltaX * scale;
        const constrainedY = deltaY * scale;

        // Axes are sampled independently so a diagonal gesture can command full
        // steering and climb together. The visual thumb remains radially bounded.
        this.targetSteer = this.#applyDeadZone(
            Math.max(-1, Math.min(1, deltaX / JOYSTICK_RADIUS * TOUCH_SENSITIVITY)),
        );
        this.targetPitch = this.#applyDeadZone(
            Math.max(-1, Math.min(1, -deltaY / JOYSTICK_RADIUS * TOUCH_SENSITIVITY)),
        );
        this.thumbX = constrainedX;
        this.thumbY = constrainedY;
        this.isThumbDirty = true;
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
    }

    /** Samples gesture targets once per rendered frame instead of exposing the
     * irregular cadence of browser pointer events directly to craft physics. */
    update(delta) {
        const dt = Math.min(Math.max(delta, 0), 0.05);
        const hasTouchTarget = this.controlPointerId !== null;
        const response = hasTouchTarget ? TOUCH_INPUT_RESPONSE : TOUCH_RELEASE_RESPONSE;
        const blend = 1 - Math.exp(-response * dt);
        this.state.steer += (this.targetSteer - this.state.steer) * blend;
        this.state.pitch += (this.targetPitch - this.state.pitch) * blend;

        if (Math.abs(this.state.steer) < 0.001 && this.targetSteer === 0) this.state.steer = 0;
        if (Math.abs(this.state.pitch) < 0.001 && this.targetPitch === 0) this.state.pitch = 0;

        if (this.isThumbDirty && this.touchIndicatorThumb) {
            this.touchIndicatorThumb.style.transform = `translate3d(${this.thumbX}px, ${this.thumbY}px, 0)`;
            this.isThumbDirty = false;
        }
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
        this.targetSteer = 0;
        this.targetPitch = 0;
        this.thumbX = 0;
        this.thumbY = 0;
        this.isThumbDirty = true;
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
            this.boostButton.removeEventListener('contextmenu', this.handleBoostSelection);
            this.boostButton.removeEventListener('selectstart', this.handleBoostSelection);
        }

        this.reset();
    }
}
