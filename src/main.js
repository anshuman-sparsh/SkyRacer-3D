import * as THREE from 'three';
import { inject } from '@vercel/analytics';
import { CameraDynamics, createCamera } from './core/Camera.js';
import { createRenderer, resizeRenderer } from './core/Renderer.js';
import { createScene } from './core/Scene.js';
import { disposeEnergyRingResources } from './entities/EnergyRing.js';
import { disposeGroundAnchorResources } from './entities/GroundAnchor.js';
import { HoverCraft } from './entities/HoverCraft.js';
import { disposeObstacleResources } from './entities/Obstacle.js';
import { SpeedParticles } from './entities/SpeedParticles.js';
import { disposeTrackSegmentResources } from './entities/TrackSegment.js';
import { InputManager } from './managers/InputManager.js';
import { ScoreManager } from './managers/ScoreManager.js';
import { TrackManager } from './managers/TrackManager.js';
import { AudioEngine } from './utils/AudioEngine.js';
import { disposeObject3D } from './utils/Memory.js';

inject();

const TRACK_WIDTH = 32;
const SPEED_LINE_THRESHOLD = 0.62;
const SPEEDOMETER_MAX_KMH = 180;
const HUD_UPDATE_INTERVAL = 1 / 20;

const container = document.querySelector('#app');
const renderer = createRenderer(container);
const { scene, starField } = createScene();
const camera = createCamera(container.clientWidth / container.clientHeight);
const cameraDynamics = new CameraDynamics(camera);
const clock = new THREE.Clock();
const hovercraft = new HoverCraft({ trackWidth: TRACK_WIDTH });
const trackManager = new TrackManager(scene, {
    trackWidth: TRACK_WIDTH,
    craftBounds: hovercraft.bounds,
});
const scoreManager = new ScoreManager();
const speedParticles = new SpeedParticles();
const audioEngine = new AudioEngine();
scene.add(hovercraft);
scene.add(speedParticles);
cameraDynamics.snapTo(hovercraft);

const scoreElement = document.querySelector('[data-score]');
const ringsElement = document.querySelector('[data-rings]');
const speedElement = document.querySelector('[data-speed]');
const speedArcElement = document.querySelector('[data-speed-arc]');
const boostElement = document.querySelector('[data-boost]');
const boostFillElement = document.querySelector('[data-boost-fill]');
const speedLinesElement = document.querySelector('[data-speed-lines]');
const stateOverlay = document.querySelector('[data-state-overlay]');
const stateTitle = document.querySelector('[data-state-title]');
const stateMessage = document.querySelector('[data-state-message]');
const stateStats = document.querySelector('[data-state-stats]');
const finalScoreElement = document.querySelector('[data-final-score]');
const finalRingsElement = document.querySelector('[data-final-rings]');
const bestBadgeElement = document.querySelector('[data-best-badge]');
const bestElement = document.querySelector('[data-best]');
const overlayBestElement = document.querySelector('[data-overlay-best]');
const overlayBestValueElement = document.querySelector('[data-overlay-best-value]');
const restartButton = document.querySelector('[data-restart]');
const audioButton = document.querySelector('[data-audio-toggle]');
const pauseButton = document.querySelector('[data-pause-toggle]');
const pauseLabel = document.querySelector('[data-pause-label]');
const touchBoostButton = document.querySelector('[data-touch-boost]');
const touchIndicator = document.querySelector('[data-touch-indicator]');
const touchIndicatorThumb = document.querySelector('[data-touch-indicator-thumb]');

const inputManager = new InputManager(window, {
    touchSurface: renderer.domElement,
    boostButton: touchBoostButton,
    touchIndicator,
    touchIndicatorThumb,
});

let animationFrameId = 0;
let gameState = 'start';
let wasBoosting = false;
let resizeFrameId = 0;
let hudElapsed = HUD_UPDATE_INTERVAL;
let lastScoreText = '';
let lastRingsText = '';
let lastSpeedText = '';
let lastSpeedOffset = '';
let lastBoostWidth = '';
let lastBoostValue = '';
let lastSpeedLineOpacity = '';
let lastSpeedLineActive = false;
let lastBestText = '';
let lastBestRecord = false;

// Touch devices have no keyboard, so the prompts must name the gesture that works.
const isTouchPrimary = window.matchMedia('(pointer: coarse)').matches;

const STATE_COPY = {
    start: [
        isTouchPrimary ? 'TAP TO START' : 'PRESS ANY KEY TO START',
        'SKYRACER FLIGHT SYSTEM READY',
    ],
    paused: [
        'GAME PAUSED',
        isTouchPrimary ? 'TAP ANYWHERE OR PRESS RESUME' : 'PRESS P OR RESUME TO CONTINUE',
    ],
    terminated: ['FLIGHT TERMINATED', 'NAVIGATION BARRIER CONTACT'],
};

function setGameState(nextState) {
    gameState = nextState;
    const isRunning = nextState === 'running';
    const isTerminated = nextState === 'terminated';

    stateOverlay.hidden = isRunning;
    inputManager.reset();
    audioEngine.setPaused(!isRunning);

    stateStats.hidden = !isTerminated;
    restartButton.hidden = !isTerminated;
    stateTitle.classList.toggle('is-alert', isTerminated);
    stateTitle.classList.toggle('is-pulsing', !isTerminated);

    pauseLabel.textContent = nextState === 'paused' ? 'Resume' : 'Pause';
    pauseButton.setAttribute('aria-pressed', (nextState === 'paused').toString());
    pauseButton.classList.toggle('is-off', nextState === 'paused');
    pauseButton.disabled = isTerminated;

    if (isTerminated) {
        // Flush immediately so a browser close on the results screen keeps the best.
        scoreManager.persistHighScore();
        finalScoreElement.textContent = scoreManager.currentScore.toLocaleString();
        finalRingsElement.textContent = scoreManager.ringsCollected.toString();
        restartButton.focus();
    }

    updateHighScoreDisplays(isTerminated && scoreManager.isNewHighScore);

    const copy = STATE_COPY[nextState];
    if (copy) {
        stateTitle.textContent = copy[0];
        stateMessage.textContent = copy[1];
    }

    if (!isRunning) {
        speedLinesElement.style.opacity = '0';
        speedLinesElement.classList.remove('is-active');
    }
}

async function startRunning() {
    await audioEngine.start();
    setGameState('running');
    clock.getDelta();
}

function togglePause() {
    if (gameState === 'running') {
        setGameState('paused');
    } else if (gameState === 'paused') {
        void startRunning();
    }
}

/** Rebuilds the run in place, keeping every GPU resource and the audio context. */
function restartRun() {
    scoreManager.reset();
    hovercraft.reset();
    trackManager.reset();
    cameraDynamics.snapTo(hovercraft);
    wasBoosting = false;
    updateHud();
    void startRunning();
}

async function handleGameKey(event) {
    if (event.repeat) return;

    if (gameState === 'start') {
        await startRunning();
        return;
    }

    if (gameState === 'terminated') {
        if (event.code === 'Enter' || event.code === 'Space') restartRun();
        return;
    }

    if (event.code === 'Escape' || event.code === 'KeyP') togglePause();
}

/**
 * Starts or resumes from a tap, which is the only way in on touch devices.
 * The terminated screen is excluded so a stray tap cannot skip the results.
 */
function handleOverlayPointerDown(event) {
    if (event.target.closest('button')) return;

    if (gameState === 'start') {
        void startRunning();
    } else if (gameState === 'paused') {
        togglePause();
    }
}

async function handleAudioToggle() {
    const isMuted = await audioEngine.toggleMuted();
    audioButton.classList.toggle('is-off', isMuted);
    audioButton.setAttribute('aria-pressed', isMuted.toString());
    audioButton.querySelector('[data-audio-label]').textContent = isMuted ? 'Audio Off' : 'Audio On';
}

/** Mirrors the persisted best into the HUD badge and the overlay pill. */
function updateHighScoreDisplays(isRecord = false) {
    const best = scoreManager.getHighScore().toLocaleString();
    if (best !== lastBestText) {
        bestElement.textContent = best;
        overlayBestValueElement.textContent = best;
        lastBestText = best;
    }
    if (isRecord !== lastBestRecord) {
        bestBadgeElement.classList.toggle('is-record', isRecord);
        overlayBestElement.classList.toggle('is-record', isRecord);
        lastBestRecord = isRecord;
    }
}

function updateHud() {
    // Read live craft velocity rather than the score cache so a Surge Ring's
    // instantaneous impulse is visible on this exact frame.
    const speedKmh = Math.round(Math.max(0, -hovercraft.velocity.z) * 3.6);
    const speedRatio = THREE.MathUtils.clamp(speedKmh / SPEEDOMETER_MAX_KMH, 0, 1);
    const boostRatio = hovercraft.boostRatio;

    const scoreText = scoreManager.currentScore.toLocaleString();
    const ringsText = scoreManager.ringsCollected.toString();
    const speedText = speedKmh.toString().padStart(3, '0');
    const speedOffset = (235 * (1 - speedRatio)).toFixed(2);
    const boostWidth = `${(boostRatio * 100).toFixed(1)}%`;
    const boostValue = Math.round(boostRatio * 100).toString();

    if (scoreText !== lastScoreText) {
        scoreElement.textContent = scoreText;
        lastScoreText = scoreText;
    }
    if (ringsText !== lastRingsText) {
        ringsElement.textContent = ringsText;
        lastRingsText = ringsText;
    }
    if (speedText !== lastSpeedText) {
        speedElement.textContent = speedText;
        lastSpeedText = speedText;
    }
    if (speedOffset !== lastSpeedOffset) {
        speedArcElement.style.strokeDashoffset = speedOffset;
        lastSpeedOffset = speedOffset;
    }
    if (boostWidth !== lastBoostWidth) {
        boostFillElement.style.width = boostWidth;
        lastBoostWidth = boostWidth;
    }
    if (boostValue !== lastBoostValue) {
        boostElement.setAttribute('aria-valuenow', boostValue);
        lastBoostValue = boostValue;
    }

    // Edge distortion lines are pure CSS, so high-speed feedback costs no VRAM.
    const isFast = speedRatio > SPEED_LINE_THRESHOLD;
    const speedLineOpacity = isFast
        ? ((speedRatio - SPEED_LINE_THRESHOLD) / (1 - SPEED_LINE_THRESHOLD) * 0.75).toFixed(2)
        : '0';
    if (speedLineOpacity !== lastSpeedLineOpacity) {
        speedLinesElement.style.opacity = speedLineOpacity;
        lastSpeedLineOpacity = speedLineOpacity;
    }
    if (isFast !== lastSpeedLineActive) {
        speedLinesElement.classList.toggle('is-active', isFast);
        lastSpeedLineActive = isFast;
    }

    // Highlights live the moment the run passes the stored best.
    updateHighScoreDisplays(scoreManager.isNewHighScore);
}

function animate() {
    const delta = Math.min(clock.getDelta(), 0.05);
    inputManager.update(delta);

    if (gameState === 'running' || gameState === 'terminated') {
        hovercraft.update(delta, inputManager.state);
        starField.update(delta, hovercraft.position);
    }

    if (gameState === 'running') {
        const {
            collectedRings,
            collectedEnergyRings,
            collectedSurgeRings,
            nearMisses,
            collided,
        } = trackManager.update(delta, hovercraft);

        // Collision is resolved before rewards, score advancement, or another
        // course-system update can run: one overlap always ends the session.
        if (collided) {
            hovercraft.spinOut();
            cameraDynamics.addShake(1.1);
            setGameState('terminated');
            cameraDynamics.update(delta, hovercraft, false);
            audioEngine.update(0, false);
            hudElapsed = HUD_UPDATE_INTERVAL;
            updateHud();
        } else {
            scoreManager.update(delta, hovercraft.velocity);

            if (collectedRings > 0) {
                if (collectedEnergyRings > 0) hovercraft.activateEnergyBoost();
                const earnedSpeedLevels = scoreManager.collectRings(collectedRings);
                if (earnedSpeedLevels > 0) {
                    hovercraft.setSpeedProgressionLevel(scoreManager.speedProgressionLevel);
                }
                if (collectedSurgeRings > 0) hovercraft.activateSpeedSurge();
                cameraDynamics.addRingImpulse();
                audioEngine.playRingChime();
            }

            if (nearMisses > 0) cameraDynamics.addShake(0.28 * nearMisses);

            const isSurging = hovercraft.isSpeedSurging;
            const isBoosting = inputManager.state.boost
                || hovercraft.energyBoostTimeRemaining > 0;
            const hasSpeedFx = isBoosting || isSurging;
            if (hasSpeedFx && !wasBoosting) {
                audioEngine.playBoost();
                cameraDynamics.addShake(isSurging ? 0.62 : 0.45);
            }
            wasBoosting = hasSpeedFx;

            cameraDynamics.update(delta, hovercraft, isBoosting, isSurging);
            const liveForwardSpeed = Math.max(0, -hovercraft.velocity.z);
            speedParticles.update(delta, camera, liveForwardSpeed, hasSpeedFx);
            audioEngine.update(liveForwardSpeed, hasSpeedFx);
            hudElapsed += delta;
            if (hudElapsed >= HUD_UPDATE_INTERVAL) {
                hudElapsed %= HUD_UPDATE_INTERVAL;
                updateHud();
            }
        }
    } else if (gameState === 'terminated') {
        // Keep the camera and trails animating so the spin-out reads clearly.
        cameraDynamics.update(delta, hovercraft, false);
        audioEngine.update(0, false);
    } else {
        wasBoosting = false;
    }

    renderer.render(scene, camera);
    animationFrameId = requestAnimationFrame(animate);
}

function resizeViewport() {
    resizeFrameId = 0;
    const width = Math.max(container.clientWidth, 1);
    const height = Math.max(container.clientHeight, 1);
    cameraDynamics.resize(width / height, hovercraft);
    resizeRenderer(renderer, container);
}

/** Coalesces mobile URL-bar and orientation resize bursts into one frame. */
function handleResize() {
    if (resizeFrameId) return;
    resizeFrameId = requestAnimationFrame(resizeViewport);
}

function handleVisibilityChange() {
    if (document.hidden && gameState === 'running') setGameState('paused');
}

function disposeApp() {
    scoreManager.persistHighScore();
    cancelAnimationFrame(animationFrameId);
    cancelAnimationFrame(resizeFrameId);
    window.removeEventListener('resize', handleResize);
    window.removeEventListener('orientationchange', handleResize);
    window.visualViewport?.removeEventListener('resize', handleResize);
    window.removeEventListener('keydown', handleGameKey);
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    stateOverlay.removeEventListener('pointerdown', handleOverlayPointerDown);
    audioButton.removeEventListener('click', handleAudioToggle);
    pauseButton.removeEventListener('click', togglePause);
    restartButton.removeEventListener('click', restartRun);
    inputManager.destroy();
    trackManager.destroy();
    disposeTrackSegmentResources();
    disposeEnergyRingResources();
    disposeObstacleResources();
    scene.remove(starField);
    starField.dispose();
    scene.remove(speedParticles);
    speedParticles.dispose();
    disposeObject3D(hovercraft);
    disposeGroundAnchorResources();
    void audioEngine.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
    renderer.domElement.remove();
}

window.addEventListener('resize', handleResize);
window.addEventListener('orientationchange', handleResize);
window.visualViewport?.addEventListener('resize', handleResize);
window.addEventListener('keydown', handleGameKey);
document.addEventListener('visibilitychange', handleVisibilityChange);
stateOverlay.addEventListener('pointerdown', handleOverlayPointerDown);
audioButton.addEventListener('click', handleAudioToggle);
pauseButton.addEventListener('click', togglePause);
restartButton.addEventListener('click', restartRun);
window.addEventListener('pagehide', disposeApp, { once: true });
setGameState('start');
updateHud();
resizeViewport();
animate();
