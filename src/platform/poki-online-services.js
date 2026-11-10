import { LeaderboardService as OnlineLeaderboard } from '../services/LeaderboardService.js';
import { storage } from './poki-storage.js';
export { DailyChallengeService } from '../services/DailyChallengeService.js';
// Friend sharing needs a separate Poki shareable-URL integration/approval milestone.
export { FriendChallengeService } from './unavailable-friend.js';
export { ClassicAutoSubmit } from '../services/ClassicAutoSubmit.js';
export { inject, GameplayAnalyticsService } from './NoTelemetry.js';
export const localProgress = null;
export class LeaderboardService extends OnlineLeaderboard {
    constructor() { super({ storage, countryEnabled: false }); }
}
