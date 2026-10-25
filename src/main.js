import * as THREE from 'three';
import { inject } from '@vercel/analytics';
import { CameraDynamics, createCamera } from './core/Camera.js';
import { createRenderer, resizeRenderer } from './core/Renderer.js';
import { createScene } from './core/Scene.js';
import { disposeEnergyRingResources } from './entities/EnergyRing.js';
import { disposeGroundAnchorResources } from './entities/GroundAnchor.js';
import { HoverCraft } from './entities/HoverCraft.js';
import { RingGuidance } from './entities/RingGuidance.js';
import { disposeObstacleResources } from './entities/Obstacle.js';
import { SpeedParticles } from './entities/SpeedParticles.js';
import {
    disposeTrackSegmentResources,
    updateTrackLightResponse,
} from './entities/TrackSegment.js';
import { InputManager } from './managers/InputManager.js';
import { ScoreManager } from './managers/ScoreManager.js';
import { RingCollectionDeadline } from './managers/RingCollectionDeadline.js';
import { LeaderboardService } from './services/LeaderboardService.js';
import { TrackManager } from './managers/TrackManager.js';
import { AudioEngine } from './utils/AudioEngine.js';
import { disposeObject3D } from './utils/Memory.js';
import { CollisionDebug } from './utils/CollisionDebug.js';

inject();

const TRACK_WIDTH = 32;
const SPEED_LINE_THRESHOLD = 0.62;
const SPEEDOMETER_MAX_KMH = 180;
const HUD_UPDATE_INTERVAL = 1 / 20;
// Preserve the full skyline on desktop while reducing decorative work on touch
// devices and narrow viewports; gameplay objects are never affected.
const reducedScenery = window.matchMedia('(pointer: coarse)').matches
    || Math.min(window.innerWidth, window.innerHeight) < 600;

const container = document.querySelector('#app');
const renderer = createRenderer(container);
const { scene, starField } = createScene({ reducedScenery });
const camera = createCamera(container.clientWidth / container.clientHeight);
const cameraDynamics = new CameraDynamics(camera);
const clock = new THREE.Clock();
const hovercraft = new HoverCraft({ trackWidth: TRACK_WIDTH });
const trackManager = new TrackManager(scene, {
    trackWidth: TRACK_WIDTH,
    craftBounds: hovercraft.bounds,
    reducedScenery,
});
const ringGuidance = new RingGuidance();
// Opt-in diagnostic only: append ?debugHitboxes=1 to a local game URL.
const collisionDebug = new URLSearchParams(window.location.search).get('debugHitboxes') === '1'
    ? new CollisionDebug(scene, hovercraft, trackManager)
    : null;
const scoreManager = new ScoreManager();
const ringCollectionDeadline = new RingCollectionDeadline();
const leaderboard = new LeaderboardService();
const speedParticles = new SpeedParticles();
const audioEngine = new AudioEngine();
scene.add(hovercraft);
scene.add(ringGuidance);
hovercraft.groundAnchor.visible = true;
scene.add(speedParticles);
cameraDynamics.snapTo(hovercraft);

const scoreElement = document.querySelector('[data-score]');
const ringsElement = document.querySelector('[data-rings]');
const ringDeadlineElement = document.querySelector('[data-ring-deadline]');
const ringDeadlineSecondsElement = document.querySelector('[data-ring-deadline-seconds]');
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
const bestRingsBadgeElement = document.querySelector('[data-best-rings-badge]');
const bestRingsElement = document.querySelector('[data-best-rings]');
const overlayBestElement = document.querySelector('[data-overlay-best]');
const overlayBestValueElement = document.querySelector('[data-overlay-best-value]');
const overlayBestRingsElement = document.querySelector('[data-overlay-best-rings]');
const overlayBestRingsValueElement = document.querySelector('[data-overlay-best-rings-value]');
const restartButton = document.querySelector('[data-restart]');
const audioButton = document.querySelector('[data-audio-toggle]');
const pauseButton = document.querySelector('[data-pause-toggle]');
const pauseLabel = document.querySelector('[data-pause-label]');
const touchBoostButton = document.querySelector('[data-touch-boost]');
const helpButton = document.querySelector('[data-help-open]');
const helpDialog = document.querySelector('[data-help-dialog]');
const helpCloseButton = document.querySelector('[data-help-close]');
const leaderboardButton = document.querySelector('[data-leaderboard-open]');
const leaderboardDialog = document.querySelector('[data-leaderboard-dialog]');
const leaderboardCloseButton = document.querySelector('[data-leaderboard-close]');
const leaderboardRefreshButton = document.querySelector('[data-leaderboard-refresh]');
const leaderboardStatus = document.querySelector('[data-leaderboard-status]');
const leaderboardOwn = document.querySelector('[data-leaderboard-own]');
const leaderboardList = document.querySelector('[data-leaderboard-list]');
const leaderboardForm = document.querySelector('[data-leaderboard-form]');
const leaderboardNickname = document.querySelector('[data-leaderboard-nickname]');
const leaderboardSendButton = document.querySelector('[data-leaderboard-send]');
const scoreSubmitButton = document.querySelector('[data-submit-score]');
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
let lastRingDeadlineSeconds = null;
let lastSpeedText = '';
let lastSpeedOffset = '';
let lastBoostWidth = '';
let lastBoostValue = '';
let lastSpeedLineOpacity = '';
let lastSpeedLineActive = false;
let lastBestText = '';
let lastBestRecord = false;
let lastBestRingsText = '';
let lastBestRingsRecord = false;

// Server-issued run IDs are never generated by the browser. A failed network
// request simply means this run cannot be added to the online leaderboard.
let onlineRunPromise = null;
let onlineSubmitted = false;
let leaderboardReturnFocus = leaderboardButton;
leaderboardButton.hidden = !leaderboard.enabled;

// Touch devices have no keyboard, so the prompts must name the gesture that works.
const isTouchPrimary = window.matchMedia('(pointer: coarse)').matches;

const STATE_COPY = {
    start: [
        isTouchPrimary ? 'TAP TO START' : 'PRESS ANY KEY TO START',
        'COLLECT A RING EVERY 30 SECONDS • GREEN MARKER = ALIGNED',
    ],
    paused: [
        'GAME PAUSED',
        isTouchPrimary ? 'TAP ANYWHERE OR PRESS RESUME' : 'PRESS P OR RESUME TO CONTINUE',
    ],
    terminated: ['FLIGHT TERMINATED', 'NAVIGATION BARRIER CONTACT'],
    ringTimeout: ['FLIGHT TERMINATED', 'NO RING COLLECTED FOR 30 SECONDS'],
};

function updateRingDeadlineDisplay() {
    const remaining = gameState === 'running' ? ringCollectionDeadline.countdownSeconds : null;
    ringDeadlineElement.hidden = remaining === null;
    if (remaining === null) {
        lastRingDeadlineSeconds = null;
        ringDeadlineElement.classList.remove('is-critical');
        return;
    }

    // Update the DOM only when the visible countdown changes whole seconds.
    if (remaining !== lastRingDeadlineSeconds) {
        ringDeadlineSecondsElement.textContent = String(remaining);
        lastRingDeadlineSeconds = remaining;
    }
    ringDeadlineElement.classList.toggle('is-critical', remaining <= 3);
}

function setGameState(nextState, terminationReason = 'collision') {
    gameState = nextState;
    updateRingDeadlineDisplay();
    const isRunning = nextState === 'running';
    const isTerminated = nextState === 'terminated';
    if (!isRunning) ringGuidance.hide();

    stateOverlay.hidden = isRunning;
    inputManager.reset();
    audioEngine.setPaused(!isRunning);

    stateStats.hidden = !isTerminated;
    restartButton.hidden = !isTerminated;
    scoreSubmitButton.hidden = !isTerminated || !leaderboard.enabled || onlineSubmitted;
    stateTitle.classList.toggle('is-alert', isTerminated);
    stateTitle.classList.toggle('is-pulsing', !isTerminated);

    pauseLabel.textContent = nextState === 'paused' ? 'Resume' : 'Pause';
    pauseButton.setAttribute('aria-pressed', (nextState === 'paused').toString());
    pauseButton.classList.toggle('is-off', nextState === 'paused');
    pauseButton.disabled = isTerminated;

    if (isTerminated) {
        // Flush immediately so a browser close on the results screen keeps both records.
        scoreManager.persistRecords();
        finalScoreElement.textContent = scoreManager.currentScore.toLocaleString();
        finalRingsElement.textContent = scoreManager.ringsCollected.toString();
        restartButton.focus();
    }

    updateRecordDisplays(
        isTerminated && scoreManager.isNewHighScore,
        isTerminated && scoreManager.isNewBestRings,
    );

    const copy = nextState === 'terminated' && terminationReason === 'ring-timeout'
        ? STATE_COPY.ringTimeout
        : STATE_COPY[nextState];
    if (copy) {
        stateTitle.textContent = copy[0];
        stateMessage.textContent = copy[1];
    }

    if (!isRunning) {
        speedLinesElement.style.opacity = '0';
        speedLinesElement.classList.remove('is-active');
    }
}

function beginOnlineRun() {
    onlineSubmitted = false;

    onlineRunPromise = leaderboard.enabled
        ? leaderboard.beginRun().catch((error) => {
            console.error('[SkyRacer] Online run registration failed:', error);
            return null;
        })
        : null;
}

async function startRunning() {
    if (gameState === 'start') beginOnlineRun();
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
    ringGuidance.hide();
    scoreManager.reset();
    ringCollectionDeadline.reset();
    updateRingDeadlineDisplay();
    hovercraft.reset();
    trackManager.reset();
    cameraDynamics.snapTo(hovercraft);
    wasBoosting = false;
    beginOnlineRun();
    updateHud();
    void startRunning();
}

async function handleGameKey(event) {
    // Help is a native modal. Opening it with Enter must not start the game,
    // and keys pressed while reading the guide must not resume gameplay.
    if (helpDialog.open || leaderboardDialog.open) return;
    // Enter/Space should activate focused UI controls, not start a run.
    // Other gameplay keys must still work after the player closes Help.
    if ((event.code === 'Enter' || event.code === 'Space')
        && event.target?.closest?.('[data-help-open], [data-leaderboard-open], [data-submit-score]')) return;
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

function openHelp() {
    if (helpDialog.open) return;
    // Never let the aircraft keep moving behind instructional content.
    // Closing the guide leaves the run paused until the player resumes.
    if (gameState === 'running') setGameState('paused');
    helpDialog.showModal();
    helpCloseButton.focus();
}

function closeHelp() {
    if (helpDialog.open) helpDialog.close();
}

function restoreHelpFocus() {
    helpButton.focus({ preventScroll: true });
}

function openLeaderboard(event) {
    if (!leaderboard.enabled || leaderboardDialog.open) return;
    leaderboardReturnFocus = event?.currentTarget ?? leaderboardButton;
    if (gameState === 'running') setGameState('paused');
    leaderboardForm.hidden = gameState !== 'terminated' || onlineSubmitted;
    leaderboardNickname.value = leaderboard.getNickname();
    leaderboardDialog.showModal();
    leaderboardCloseButton.focus();
    void refreshLeaderboard();
}

function closeLeaderboard() {
    if (leaderboardDialog.open) leaderboardDialog.close();
}

function restoreLeaderboardFocus() {
    const target = leaderboardReturnFocus?.hidden ? leaderboardButton : leaderboardReturnFocus;
    target?.focus?.({ preventScroll: true });
}

async function refreshLeaderboard() {
    if (!leaderboard.enabled || !leaderboardDialog.open) return;
    leaderboardRefreshButton.disabled = true;
    leaderboardStatus.textContent = 'Loading global rankings…';
    try {
        const response = await leaderboard.getLeaderboard();
        const entries = Array.isArray(response?.entries) ? response.entries : [];
        const rows = document.createDocumentFragment();
        for (const entry of entries) {
            const row = document.createElement('li');
            row.className = 'leaderboard-list__row';
            const rank = document.createElement('span');
            rank.className = 'leaderboard-list__rank';
            rank.textContent = `#${Number(entry.rank)}`;
            const name = document.createElement('span');
            name.className = 'leaderboard-list__name';
            name.textContent = String(entry.nickname ?? 'Pilot');
            const points = document.createElement('strong');
            points.className = 'leaderboard-list__score';
            points.textContent = Number(entry.score).toLocaleString();
            row.append(rank, name, points);
            rows.append(row);
        }
        leaderboardList.replaceChildren(rows);
        leaderboardOwn.textContent = response?.me
            ? `Your rank: #${response.me.rank} · Best: ${Number(response.me.score).toLocaleString()}`
            : 'Play a run to earn your first global ranking.';
        leaderboardStatus.textContent = entries.length
            ? 'All-time global scores (50 points per ring).'
            : 'No global scores yet. Be the first!';
    } catch (error) {
        leaderboardStatus.textContent = `Could not load rankings: ${error.message}`;
    } finally {
        leaderboardRefreshButton.disabled = false;
    }
}

async function submitOnlineScore() {
    if (gameState !== 'terminated' || onlineSubmitted || !leaderboard.enabled) return;
    const nickname = leaderboardNickname.value.trim();
    if (!/^[A-Za-z0-9_]{3,16}$/.test(nickname)) {
        leaderboardStatus.textContent = 'Enter 3–16 letters, numbers, or underscores for your nickname.';
        leaderboardNickname.focus();
        return;
    }
    leaderboardSendButton.disabled = true;
    leaderboardStatus.textContent = 'Checking and submitting your run…';
    const runRegistration = onlineRunPromise;
    try {
        const runId = await runRegistration;
        if (!runId || runRegistration !== onlineRunPromise) {
            throw new Error('This run was not registered online. Please play another run while connected.');
        }
        const result = await leaderboard.finishRun({
            runId,
            nickname,
            score: scoreManager.currentScore,
            rings: scoreManager.ringsCollected,
            distance: scoreManager.distance,
        });
        if (!result?.accepted) throw new Error('The score was not accepted.');
        onlineSubmitted = true;
        leaderboardForm.hidden = true;
        scoreSubmitButton.hidden = true;
        await refreshLeaderboard();
        leaderboardStatus.textContent = result.isNewPersonalBest
            ? 'New global personal best! Your score is on the leaderboard.'
            : 'Score submitted! Your previous higher record is still your best.';
    } catch (error) {
        leaderboardStatus.textContent = `Could not submit: ${error.message}`;
    } finally {
        leaderboardSendButton.disabled = false;
    }
}

async function handleAudioToggle() {
    const isMuted = await audioEngine.toggleMuted();
    audioButton.classList.toggle('is-off', isMuted);
    audioButton.setAttribute('aria-pressed', isMuted.toString());
    audioButton.querySelector('[data-audio-label]').textContent = isMuted ? 'Audio Off' : 'Audio On';
}

/** Mirrors the all-time score and ring records into the HUD and overlay. */
function updateRecordDisplays(isScoreRecord = false, isRingsRecord = false) {
    const best = scoreManager.getHighScore().toLocaleString();
    if (best !== lastBestText) {
        bestElement.textContent = best;
        overlayBestValueElement.textContent = best;
        lastBestText = best;
    }
    if (isScoreRecord !== lastBestRecord) {
        bestBadgeElement.classList.toggle('is-record', isScoreRecord);
        overlayBestElement.classList.toggle('is-record', isScoreRecord);
        lastBestRecord = isScoreRecord;
    }

    const bestRings = scoreManager.getBestRings().toLocaleString();
    if (bestRings !== lastBestRingsText) {
        bestRingsElement.textContent = bestRings;
        overlayBestRingsValueElement.textContent = bestRings;
        lastBestRingsText = bestRings;
    }
    if (isRingsRecord !== lastBestRingsRecord) {
        bestRingsBadgeElement.classList.toggle('is-record', isRingsRecord);
        overlayBestRingsElement.classList.toggle('is-record', isRingsRecord);
        lastBestRingsRecord = isRingsRecord;
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
    updateRecordDisplays(scoreManager.isNewHighScore, scoreManager.isNewBestRings);
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

        // The countdown uses active-game delta, not wall-clock time. A ring
        // picked up on the expiration frame resets the deadline first.
        const ringDeadlineExpired = ringCollectionDeadline.advance(delta, collectedRings);
        updateRingDeadlineDisplay();

        // Commit ring rewards even when a barrier impact occurs in the same
        // frame. Ring removal has already happened inside TrackManager, so
        // discarding these counts would silently lose a legitimate collection.
        if (collectedRings > 0) {
            if (collectedEnergyRings > 0) hovercraft.activateEnergyBoost();
            const earnedSpeedLevels = scoreManager.collectRings(collectedRings);
            if (earnedSpeedLevels > 0) {
                hovercraft.setSpeedProgressionLevel(scoreManager.speedProgressionLevel);
            }
            if (collectedSurgeRings > 0) {
                hovercraft.activateSpeedSurge(collectedSurgeRings);
            }
            if (!collided) {
                cameraDynamics.addRingImpulse();
                audioEngine.playRingChime();
            }
            updateHud();
            ringsElement.classList.remove('is-collected');
            // Restart the short cue if two rings arrive close together.
            void ringsElement.offsetWidth;
            ringsElement.classList.add('is-collected');
        }

        // Either a barrier impact or 30 seconds without collecting a ring
        // ends the run. Use the established spin-out to stop aircraft motion.
        if (collided || ringDeadlineExpired) {
            if (!collided) scoreManager.update(delta, hovercraft.velocity);
            hovercraft.spinOut();
            cameraDynamics.addShake(collided ? 1.1 : 0.45);
            setGameState('terminated', collided ? 'collision' : 'ring-timeout');
            cameraDynamics.update(delta, hovercraft, false);
            audioEngine.update(0, false);
            hudElapsed = HUD_UPDATE_INTERVAL;
            updateHud();
        } else {
            scoreManager.update(delta, hovercraft.velocity);

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
            ringGuidance.update(trackManager.energyRings, hovercraft);
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

    // Smooth shared-material accents only; physics, rings and speed particles
    // retain their existing behavior and visibility.
    updateTrackLightResponse(delta, gameState === 'running' && (
        inputManager.state.boost
        || hovercraft.energyBoostTimeRemaining > 0
        || hovercraft.isSpeedSurging
    ));
    collisionDebug?.update();
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
    scoreManager.persistRecords();
    cancelAnimationFrame(animationFrameId);
    cancelAnimationFrame(resizeFrameId);
    window.removeEventListener('resize', handleResize);
    window.removeEventListener('orientationchange', handleResize);
    window.visualViewport?.removeEventListener('resize', handleResize);
    window.removeEventListener('keydown', handleGameKey);
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    stateOverlay.removeEventListener('pointerdown', handleOverlayPointerDown);
    audioButton.removeEventListener('click', handleAudioToggle);
    helpButton.removeEventListener('click', openHelp);
    helpCloseButton.removeEventListener('click', closeHelp);
    helpDialog.removeEventListener('close', restoreHelpFocus);
    leaderboardButton.removeEventListener('click', openLeaderboard);
    scoreSubmitButton.removeEventListener('click', openLeaderboard);
    leaderboardCloseButton.removeEventListener('click', closeLeaderboard);
    leaderboardDialog.removeEventListener('close', restoreLeaderboardFocus);
    leaderboardRefreshButton.removeEventListener('click', refreshLeaderboard);
    leaderboardSendButton.removeEventListener('click', submitOnlineScore);
    pauseButton.removeEventListener('click', togglePause);
    restartButton.removeEventListener('click', restartRun);
    inputManager.destroy();
    collisionDebug?.dispose();
    ringGuidance.dispose();
    scene.remove(ringGuidance);
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
helpButton.addEventListener('click', openHelp);
helpCloseButton.addEventListener('click', closeHelp);
helpDialog.addEventListener('close', restoreHelpFocus);
leaderboardButton.addEventListener('click', openLeaderboard);
scoreSubmitButton.addEventListener('click', openLeaderboard);
leaderboardCloseButton.addEventListener('click', closeLeaderboard);
leaderboardDialog.addEventListener('close', restoreLeaderboardFocus);
leaderboardRefreshButton.addEventListener('click', refreshLeaderboard);
leaderboardSendButton.addEventListener('click', submitOnlineScore);
pauseButton.addEventListener('click', togglePause);
restartButton.addEventListener('click', restartRun);
window.addEventListener('pagehide', disposeApp, { once: true });
setGameState('start');
updateHud();
resizeViewport();
animate();
