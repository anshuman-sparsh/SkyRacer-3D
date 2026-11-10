import { storage } from './poki-storage.js';
import { LocalProgress } from './LocalProgress.js';
export { inject, GameplayAnalyticsService } from './NoTelemetry.js';
export const localProgress = new LocalProgress(storage);
export class LeaderboardService {
    constructor() { this.enabled = false; this.storage = storage; }
    getNickname() { return ''; }
    async getHangarProgress() { return localProgress.snapshot(); }
}
export class DailyChallengeService {
    enabled = true;
    local = true;
    async getToday() { return localProgress.today(); }
    async begin() { return localProgress.beginDaily(); }
    async finish(run, result) { return localProgress.finishDaily(run, result); }
    getKnownNickname() { return ''; }
}
export class FriendChallengeService { enabled = false; getKnownNickname() { return ''; } }
export class ClassicAutoSubmit {
    status = 'idle';
    async completedRun() {} async resume() {} async submitNickname() {}
}
