const ENGINE_UPDATE_INTERVAL = 1 / 30;

export class AudioEngine {
    constructor() {
        this.context = null;
        this.masterGain = null;
        this.engineOscillator = null;
        this.engineFilter = null;
        this.engineGain = null;
        this.muted = false;
        this.paused = true;
        this.oneShots = new Set();
        this.boostNoiseBuffer = null;
        this.lastEngineUpdateTime = -Infinity;
        this.lastBoostState = false;
    }

    async start() {
        if (this.context) {
            if (this.context.state === 'suspended') await this.context.resume();
            this.paused = false;
            return true;
        }

        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) return false;

        this.context = new AudioContextClass();
        this.masterGain = this.context.createGain();
        this.masterGain.gain.value = this.muted ? 0 : 0.75;
        this.masterGain.connect(this.context.destination);

        this.engineOscillator = this.context.createOscillator();
        this.engineOscillator.type = 'sawtooth';
        this.engineOscillator.frequency.value = 45;
        this.engineFilter = this.context.createBiquadFilter();
        this.engineFilter.type = 'lowpass';
        this.engineFilter.frequency.value = 230;
        this.engineGain = this.context.createGain();
        this.engineGain.gain.value = 0;
        this.engineOscillator.connect(this.engineFilter).connect(this.engineGain).connect(this.masterGain);
        this.engineOscillator.start();
        this.boostNoiseBuffer = this.#createBoostNoiseBuffer();
        this.paused = false;
        return true;
    }

    update(speed, isBoosting) {
        if (!this.context || !this.engineOscillator || !this.engineGain) return;
        const now = this.context.currentTime;
        const boostChanged = isBoosting !== this.lastBoostState;
        if (!boostChanged && now - this.lastEngineUpdateTime < ENGINE_UPDATE_INTERVAL) return;

        this.lastEngineUpdateTime = now;
        this.lastBoostState = isBoosting;
        const normalizedSpeed = Math.min(Math.max(speed / 42, 0), 1);
        this.engineOscillator.frequency.cancelScheduledValues(now);
        this.engineOscillator.frequency.setTargetAtTime(45 + normalizedSpeed * 95, now, 0.08);
        const targetGain = this.paused ? 0 : 0.018 + normalizedSpeed * 0.038 + (isBoosting ? 0.014 : 0);
        this.engineGain.gain.cancelScheduledValues(now);
        this.engineGain.gain.setTargetAtTime(targetGain, now, 0.07);
    }

    playRingChime() {
        if (!this.context || this.muted) return;
        const now = this.context.currentTime;
        for (const [frequency, delay] of [[659.25, 0], [987.77, 0.055]]) {
            const oscillator = this.context.createOscillator();
            const gain = this.context.createGain();
            oscillator.type = 'sine';
            oscillator.frequency.value = frequency;
            gain.gain.setValueAtTime(0.0001, now + delay);
            gain.gain.exponentialRampToValueAtTime(0.12, now + delay + 0.025);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + delay + 0.65);
            oscillator.connect(gain).connect(this.masterGain);
            this.#trackOneShot(oscillator, [gain]);
            oscillator.start(now + delay);
            oscillator.stop(now + delay + 0.68);
        }
    }

    playBoost() {
        if (!this.context || this.muted) return;
        const duration = 0.55;
        const now = this.context.currentTime;

        const source = this.context.createBufferSource();
        const filter = this.context.createBiquadFilter();
        const gain = this.context.createGain();
        source.buffer = this.boostNoiseBuffer;
        filter.type = 'bandpass';
        filter.Q.value = 1.8;
        filter.frequency.setValueAtTime(220, now);
        filter.frequency.exponentialRampToValueAtTime(1800, now + duration);
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(0.12, now + 0.04);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
        source.connect(filter).connect(gain).connect(this.masterGain);
        this.#trackOneShot(source, [filter, gain]);
        source.start(now);
        source.stop(now + duration);
    }

    async toggleMuted() {
        await this.start();
        this.muted = !this.muted;
        if (this.masterGain) {
            this.masterGain.gain.setTargetAtTime(this.muted ? 0 : 0.75, this.context.currentTime, 0.02);
        }
        return this.muted;
    }

    setPaused(paused) {
        this.paused = paused;
        this.update(0, false);
    }

    async dispose() {
        for (const source of this.oneShots) {
            try { source.stop(); } catch { /* One-shot already ended. */ }
            source.disconnect();
        }
        this.oneShots.clear();
        if (this.engineOscillator) {
            this.engineOscillator.stop();
            this.engineOscillator.disconnect();
        }
        if (this.engineFilter) this.engineFilter.disconnect();
        if (this.engineGain) this.engineGain.disconnect();
        if (this.masterGain) this.masterGain.disconnect();
        if (this.context && this.context.state !== 'closed') await this.context.close();
        this.context = null;
        this.boostNoiseBuffer = null;
        this.lastEngineUpdateTime = -Infinity;
    }

    #trackOneShot(source, connectedNodes) {
        this.oneShots.add(source);
        source.onended = () => {
            source.disconnect();
            connectedNodes.forEach((node) => node.disconnect());
            this.oneShots.delete(source);
        };
    }

    #createBoostNoiseBuffer() {
        const duration = 0.55;
        const buffer = this.context.createBuffer(
            1,
            Math.ceil(this.context.sampleRate * duration),
            this.context.sampleRate,
        );
        const samples = buffer.getChannelData(0);
        for (let index = 0; index < samples.length; index += 1) {
            const envelope = 1 - index / samples.length;
            samples[index] = (Math.random() * 2 - 1) * envelope;
        }
        return buffer;
    }
}