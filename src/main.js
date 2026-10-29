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
import { DailyChallengeService } from './services/DailyChallengeService.js';
import { DailyChallengePanel } from './ui/DailyChallengePanel.js';
import { ThemeController } from './ui/ThemeController.js';
import { QuickMenu } from './ui/QuickMenu.js';
import { createDailyRandom } from './utils/DailyChallenge.js';
import { GameplayAnalyticsService } from './services/GameplayAnalyticsService.js';
import { formatLeaderboardName } from './utils/LeaderboardDisplay.js';
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
const classicScoreManager = new ScoreManager();
const dailyScoreManager = new ScoreManager({ recordsEnabled: false });
let scoreManager = classicScoreManager;
const ringCollectionDeadline = new RingCollectionDeadline();
const leaderboard = new LeaderboardService();
const dailyService = new DailyChallengeService(leaderboard);
const analytics = new GameplayAnalyticsService({
    submitEvent: leaderboard.enabled ? (event) => leaderboard.sendGameplayEvent(event) : null,
});
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
const overlayHero = document.querySelector('[data-overlay-hero]');
const startFlightButton = document.querySelector('[data-start-flight]');
const stateTitle = document.querySelector('[data-state-title]');
const stateMessage = document.querySelector('[data-state-message]');
const stateStats = document.querySelector('[data-state-stats]');
const finalScoreElement = document.querySelector('[data-final-score]');
const finalRingsElement = document.querySelector('[data-final-rings]');
const finalDistanceElement = document.querySelector('[data-final-distance]');
const bestBadgeElement = document.querySelector('[data-best-badge]');
const bestElement = document.querySelector('[data-best]');
const bestRingsBadgeElement = document.querySelector('[data-best-rings-badge]');
const bestRingsElement = document.querySelector('[data-best-rings]');
const overlayBestElement = document.querySelector('[data-overlay-best]');
const overlayBestValueElement = document.querySelector('[data-overlay-best-value]');
const overlayBestRingsElement = document.querySelector('[data-overlay-best-rings]');
const overlayBestRingsValueElement = document.querySelector('[data-overlay-best-rings-value]');
const restartButton = document.querySelector('[data-restart]');
const exitMenuButton = document.querySelector('[data-exit-menu]');
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
const leaderboardNicknameLabel = document.querySelector('[data-leaderboard-nickname-label]');
const leaderboardSendButton = document.querySelector('[data-leaderboard-send]');
const scoreSubmitButton = document.querySelector('[data-submit-score]');
const dailySubmitButton = document.querySelector('[data-daily-submit]');
const classicModeButton = document.querySelector('[data-classic-mode]');
const dailyOwnOverlay = document.querySelector('[data-daily-own-overlay]');
const modeLabel = document.querySelector('[data-mode-label]');
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
let gameMode = 'classic';
let activeDailyRun = null;
let dailySubmitting = false;
let dailyPersonalBest = null;
let dailyLastError = '';
let activeRunSeconds = 0;
let startTransitionPending = false;
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
const dailyPanel = new DailyChallengePanel({
    service: dailyService,
    onPlay: launchDailyChallenge,
    onSubmit: submitDailyScore,
    onOpen: () => { if (gameState === 'running') setGameState('paused'); },
    canPlay: () => !startTransitionPending && (gameState === 'start' || gameState === 'terminated'),
    canSubmit: () => gameMode === 'daily' && gameState === 'terminated'
        && scoreManager.currentScore > 0 && Boolean(activeDailyRun) && !activeDailyRun.submitted
        && !dailySubmitting,
});
const themeController = new ThemeController();
const quickMenu = new QuickMenu({
    onOpen: () => {
        if (gameState === 'running') setGameState('paused');
    },
    onHelp: openHelp,
    getAudioEnabled: () => !audioEngine.muted,
    onAudioChange: setAudioEnabled,
    onLeaderboard: () => openLeaderboard({ currentTarget: quickMenu.trigger }),
    onDaily: () => dailyPanel.open({ currentTarget: quickMenu.trigger }),
    canLeaderboard: () => leaderboard.enabled,
    canDaily: () => dailyService.enabled,
});
leaderboardButton.hidden = !leaderboard.enabled;

// Touch devices have no keyboard, so the prompts must name the gesture that works.
const isTouchPrimary = window.matchMedia('(pointer: coarse)').matches;

const STATE_COPY = {
    start: [
        'READY FOR TAKEOFF',
        isTouchPrimary
            ? 'Drag to steer. Hold BOOST to surge. Collect a ring every 30 seconds.'
            : 'WASD / arrows to steer · Space / Shift to boost · Collect a ring every 30 seconds.',
    ],
    paused: [
        'FLIGHT PAUSED',
        isTouchPrimary ? 'Tap RESUME FLIGHT to continue.' : 'Press P or select RESUME FLIGHT to continue.',
    ],
    terminated: ['FLIGHT ENDED', 'Navigation barrier contact. Ready for another run?'],
    ringTimeout: ['FLIGHT ENDED', 'No ring collected within 30 seconds. Try another route.'],
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
    const wasTerminated = gameState === 'terminated';
    gameState = nextState;
    if (nextState === 'terminated' && !wasTerminated) {
        analytics.trackRunEnd({
            mode: gameMode,
            score: scoreManager.currentScore,
            rings: scoreManager.ringsCollected,
            distance: scoreManager.distance,
            durationSeconds: Math.min(activeRunSeconds, 21600),
            reason: terminationReason === 'ring-timeout' ? 'ring-timeout' : 'collision',
        });
    }
    updateRingDeadlineDisplay();
    const isRunning = nextState === 'running';
    const isTerminated = nextState === 'terminated';
    const isStart = nextState === 'start';
    stateOverlay.dataset.state = nextState;
    overlayHero.hidden = !isStart;
    startFlightButton.hidden = !(isStart || nextState === 'paused');
    startFlightButton.textContent = nextState === 'paused' ? 'RESUME FLIGHT' : 'START FLIGHT';
    if (!isRunning) ringGuidance.hide();

    stateOverlay.hidden = isRunning;
    inputManager.reset();
    audioEngine.setPaused(!isRunning);

    stateStats.hidden = !isTerminated;
    restartButton.hidden = !isTerminated;
    exitMenuButton.hidden = !isTerminated;
    scoreSubmitButton.hidden = gameMode !== 'classic'
        || !isTerminated || !leaderboard.enabled || onlineSubmitted;
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
        finalDistanceElement.textContent = scoreManager.distance.toFixed(1);
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

    updateModeDisplays();
    if (isTerminated && gameMode === 'daily' && activeDailyRun
        && !activeDailyRun.submitted && activeDailyRun.nickname
        && scoreManager.currentScore > 0) {
        // A server-registered nickname allows fully automatic daily submissions.
        // New pilots choose their permanent nickname from the Daily panel.
        void submitDailyScore(activeDailyRun.nickname).catch((error) => {
            dailyLastError = error.message;
            updateModeDisplays();
        });
    }

    if (!isRunning) {
        speedLinesElement.style.opacity = '0';
        speedLinesElement.classList.remove('is-active');
    }
}

/** Daily's local score and course are isolated from the Classic leaderboard. */
function updateModeDisplays() {
    const daily = gameMode === 'daily';
    modeLabel.textContent = daily && activeDailyRun
        ? 'DAILY CHALLENGE // ' + activeDailyRun.date
        : daily ? 'DAILY CHALLENGE' : 'SKYRACER // FLIGHT 01';
    modeLabel.classList.toggle('is-daily', daily);
    bestBadgeElement.hidden = daily;
    bestRingsBadgeElement.hidden = daily;
    overlayBestElement.hidden = daily;
    overlayBestRingsElement.hidden = daily;

    const canShowOptions = gameState === 'start' || gameState === 'terminated';
    const canSubmit = daily && gameState === 'terminated'
        && scoreManager.currentScore > 0 && Boolean(activeDailyRun)
        && !activeDailyRun.submitted && !dailySubmitting;
    dailySubmitButton.hidden = !canSubmit;
    classicModeButton.hidden = !daily || !canShowOptions;
    dailyPanel.openButtons[1].hidden = !dailyService.enabled || daily || !canShowOptions;
    dailyOwnOverlay.hidden = !daily;
    if (daily) {
        dailyOwnOverlay.textContent = dailyLastError
            ? dailyLastError
            : (dailyPersonalBest != null
                ? 'Challenge ' + (activeDailyRun?.date ?? dailyPanel.today?.date ?? 'UTC')
                    + ' best: ' + Number(dailyPersonalBest).toLocaleString()
                : 'Daily best: waiting for your first successful submission');
        if (gameState === 'start') stateTitle.textContent = 'DAILY CHALLENGE — READY';
        if (gameState === 'paused') stateTitle.textContent = 'DAILY CHALLENGE PAUSED';
        if (gameState === 'terminated') stateTitle.textContent = 'DAILY RUN ENDED';
    }
    dailyPanel.updateActions();
}

function resetForNewMode() {
    scoreManager.reset();
    ringCollectionDeadline.reset();
    hovercraft.reset();
    trackManager.reset({ random: Math.random });
    cameraDynamics.snapTo(hovercraft);
    wasBoosting = false;
    activeRunSeconds = 0;
    onlineRunPromise = null;
    onlineSubmitted = false;
    lastBestText = '';
    lastBestRingsText = '';
    lastBestRecord = false;
    lastBestRingsRecord = false;
    updateHud();
    setGameState('start');
}

function backToMainMenu() {
    if (startTransitionPending || gameState !== 'terminated') return;
    if (gameMode === 'daily') {
        returnToClassic();
    } else {
        resetForNewMode();
    }
}

function returnToClassic() {
    if (startTransitionPending || gameMode !== 'daily'
        || (gameState !== 'start' && gameState !== 'terminated')) return;
    activeDailyRun = null;
    dailySubmitting = false;
    dailyLastError = '';
    gameMode = 'classic';
    scoreManager = classicScoreManager;
    resetForNewMode();
}

/** Only the server chooses the UTC date and course version. */
async function launchDailyChallenge() {
    if (startTransitionPending || (gameState !== 'start' && gameState !== 'terminated')) return false;
    if (gameMode !== 'daily') {
        gameMode = 'daily';
        scoreManager = dailyScoreManager;
    }
    activeDailyRun = null;
    dailyPersonalBest = dailyPanel.today?.me?.score ?? null;
    dailyLastError = '';
    resetForNewMode();
    return startRunning();
}

async function submitDailyScore(nickname) {
    if (dailySubmitting || gameMode !== 'daily' || gameState !== 'terminated'
        || !activeDailyRun || activeDailyRun.submitted
        || scoreManager.currentScore < 1) {
        throw new Error('No completed daily run is available to submit.');
    }
    const run = activeDailyRun;
    dailySubmitting = true;
    updateModeDisplays();
    try {
        const result = await dailyService.finish(run, {
            nickname, score: scoreManager.currentScore,
            rings: scoreManager.ringsCollected, distance: scoreManager.distance,
        });
        dailyPersonalBest = result.personalBest;
        dailyLastError = '';
        if (activeDailyRun === run) {
            updateModeDisplays();
            if (dailyPanel.dialog.open) void dailyPanel.refresh();
        }
        return result;
    } catch (error) {
        dailyLastError = error.message;
        if (activeDailyRun === run) updateModeDisplays();
        throw error;
    } finally {
        dailySubmitting = false;
        if (activeDailyRun === run) updateModeDisplays();
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
    // Ignore duplicate clicks and key presses during async run registration.
    if (startTransitionPending || gameState === 'running') return false;
    startTransitionPending = true;
    const isNewRun = gameState === 'start' || gameState === 'terminated';
    try {
        // Start audio while still handling the user's gesture on mobile.
        const audioPromise = audioEngine.start();
        if (isNewRun && gameMode === 'daily') {
            if (!activeDailyRun || activeDailyRun.submitted) {
                activeDailyRun = await dailyService.begin();
            }
            // An old open leaderboard can straddle midnight; trust the
            // server-issued date, never yesterday's cached personal best.
            if (dailyPanel.today?.date !== activeDailyRun.date) dailyPersonalBest = null;
            trackManager.reset({
                random: createDailyRandom(activeDailyRun.date, activeDailyRun.courseVersion),
            });
            ringCollectionDeadline.reset();
            scoreManager.reset();
            hovercraft.reset();
            cameraDynamics.snapTo(hovercraft);
            dailyLastError = '';
            updateHud();
        } else if (gameState === 'start' && gameMode === 'classic') {
            beginOnlineRun();
        }
        await audioPromise;
        setGameState('running');
        clock.getDelta();
        if (!dailyPanel.dialog.open
            && document.activeElement?.matches?.(
                '[data-daily-open], [data-daily-menu], [data-quick-open], ' +
                '[data-start-flight], [data-restart], [data-pause-toggle]'
            )) {
            renderer.domElement.tabIndex = 0;
            renderer.domElement.focus({ preventScroll: true });
        }
        if (isNewRun) {
            activeRunSeconds = 0;
            analytics.trackRunStart(gameMode);
        }
        return true;
    } catch (error) {
        dailyLastError = error.message;
        updateModeDisplays();
        console.error('[SkyRacer] Could not start the run:', error);
        return false;
    } finally {
        startTransitionPending = false;
    }
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
    if (startTransitionPending || gameState !== 'terminated') return;
    ringGuidance.hide();
    scoreManager.reset();
    ringCollectionDeadline.reset();
    updateRingDeadlineDisplay();
    hovercraft.reset();
    if (gameMode === 'daily') {
        activeDailyRun = null;
        dailyLastError = '';
        trackManager.reset({ random: Math.random }); // Seeded reset occurs once the server registers the retry.
    } else {
        trackManager.reset({ random: Math.random });
        beginOnlineRun();
    }
    cameraDynamics.snapTo(hovercraft);
    wasBoosting = false;
    updateHud();
    void startRunning();
}

async function handleGameKey(event) {
    // Help is a native modal. Opening it with Enter must not start the game,
    // and keys pressed while reading the guide must not resume gameplay.
    if (helpDialog.open || leaderboardDialog.open || dailyPanel.dialog.open || quickMenu.opened) return;
    // Enter/Space should activate focused UI controls, not start a run.
    // Other gameplay keys must still work after the player closes Help.
    if ((event.code === 'Enter' || event.code === 'Space')
        && event.target?.closest?.('button, input, dialog')) return;
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
    quickMenu.trigger.focus({ preventScroll: true });
}

function openLeaderboard(event) {
    if (!leaderboard.enabled || leaderboardDialog.open) return;
    leaderboardReturnFocus = event?.currentTarget ?? leaderboardButton;
    if (gameState === 'running') setGameState('paused');
    leaderboardForm.hidden = gameMode !== 'classic' || gameState !== 'terminated' || onlineSubmitted;
    leaderboardNickname.value = leaderboard.getNickname();
    leaderboardNickname.readOnly = false;
    leaderboardNicknameLabel.textContent = 'Your pilot nickname (3–16 letters, numbers or underscores)';
    leaderboardDialog.showModal();
    leaderboardCloseButton.focus();
    void refreshLeaderboard();
}

function closeLeaderboard() {
    if (leaderboardDialog.open) leaderboardDialog.close();
}

function restoreLeaderboardFocus() {
    quickMenu.trigger.focus({ preventScroll: true });
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
            name.textContent = formatLeaderboardName(entry);
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

        // The server is authoritative: returning players must retain their
        // first registered nickname, and only strictly better runs can submit.
        const registeredName = typeof response?.me?.nickname === 'string'
            ? response.me.nickname : null;
        leaderboardNickname.readOnly = Boolean(registeredName);
        if (registeredName) leaderboardNickname.value = registeredName;
        leaderboardNicknameLabel.textContent = registeredName
            ? 'Your registered nickname (permanent)'
            : 'Your pilot nickname (3–16 letters, numbers or underscores)';

        const previousBest = response?.me ? Number(response.me.score) : null;
        const beatsPreviousBest = previousBest === null
            || scoreManager.currentScore > previousBest;
        const canSubmit = gameMode === 'classic' && gameState === 'terminated' && !onlineSubmitted && beatsPreviousBest;
        leaderboardForm.hidden = !canSubmit;
        scoreSubmitButton.hidden = !canSubmit || !leaderboard.enabled;
        leaderboardStatus.textContent = !beatsPreviousBest && gameState === 'terminated'
            ? `Your score must beat ${previousBest.toLocaleString()} points before you can submit again.`
            : entries.length
                ? 'All-time global scores (50 points per ring).'
                : 'No global scores yet. Be the first!';
    } catch (error) {
        leaderboardStatus.textContent = `Could not load rankings: ${error.message}`;
    } finally {
        leaderboardRefreshButton.disabled = false;
    }
}

async function submitOnlineScore() {
    if (gameMode !== 'classic' || gameState !== 'terminated' || onlineSubmitted || !leaderboard.enabled) return;
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
        // Recheck the latest server record immediately before submitting.
        // Local high scores are not a reliable proxy for the online account.
        const snapshot = await leaderboard.getLeaderboard();
        const registeredName = typeof snapshot?.me?.nickname === 'string'
            ? snapshot.me.nickname : null;
        if (registeredName && nickname !== registeredName) {
            throw new Error(`Your registered nickname is ${registeredName}. It cannot be changed.`);
        }
        const previousBest = snapshot?.me ? Number(snapshot.me.score) : null;
        if (previousBest !== null && scoreManager.currentScore <= previousBest) {
            throw new Error(`You must beat your personal best of ${previousBest.toLocaleString()} points.`);
        }

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
        leaderboardStatus.textContent = 'New global personal best! Your score is on the leaderboard.';
    } catch (error) {
        leaderboardStatus.textContent = `Could not submit: ${error.message}`;
    } finally {
        leaderboardSendButton.disabled = false;
    }
}

function setAudioEnabled(enabled) {
    // Sound changes must never resume a paused flight or AudioContext.
    const isMuted = audioEngine.setMuted(!enabled);
    audioButton.classList.toggle('is-off', isMuted);
    audioButton.setAttribute('aria-pressed', String(isMuted));
    audioButton.querySelector('[data-audio-label]').textContent = isMuted ? 'Audio Off' : 'Audio On';
    quickMenu.refreshAudio();
}

function handleAudioToggle() {
    setAudioEnabled(audioEngine.muted);
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
    // Physics remains frame-capped, but the ring deadline uses real elapsed
    // active-play seconds so low frame rates cannot extend its 30-second limit.
    const frameDelta = clock.getDelta();
    const delta = Math.min(frameDelta, 0.05);
    inputManager.update(delta);

    if (gameState === 'running' || gameState === 'terminated') {
        hovercraft.update(delta, inputManager.state);
        starField.update(delta, hovercraft.position);
    }

    if (gameState === 'running') {
        // Only active flying contributes to gameplay duration; pause time is excluded.
        if (Number.isFinite(frameDelta) && frameDelta > 0) {
            activeRunSeconds = Math.min(21600, activeRunSeconds + Math.min(frameDelta, 60));
        }
        const {
            collectedRings,
            collectedEnergyRings,
            collectedSurgeRings,
            nearMisses,
            collided,
        } = trackManager.update(delta, hovercraft);

        // The countdown uses active-game delta, not wall-clock time. A ring
        // picked up on the expiration frame resets the deadline first.
        const ringDeadlineExpired = ringCollectionDeadline.advance(frameDelta, collectedRings);
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

function openDailyResults(event) {
    dailyPanel.open(event);
}

function disposeApp() {
    scoreManager.persistRecords();
    analytics.dispose();
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
    exitMenuButton.removeEventListener('click', backToMainMenu);
    classicModeButton.removeEventListener('click', returnToClassic);
    dailySubmitButton.removeEventListener('click', openDailyResults);
    dailyPanel.dispose();
    quickMenu.dispose();
    themeController.dispose();
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
startFlightButton.addEventListener('click', () => {
    if (gameState === 'start' || gameState === 'paused') void startRunning();
});
restartButton.addEventListener('click', restartRun);
exitMenuButton.addEventListener('click', backToMainMenu);
classicModeButton.addEventListener('click', returnToClassic);
dailySubmitButton.addEventListener('click', openDailyResults);
window.addEventListener('pagehide', disposeApp, { once: true });
setGameState('start');
updateHud();
resizeViewport();
animate();
