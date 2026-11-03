/**
 * Daily ranking API is separate from Classic and shares the existing anonymous
 * Supabase account. The server owns the UTC date and every run identifier.
 */
import { DAILY_COURSE_VERSION } from '../utils/DailyChallenge.js';

export class DailyChallengeService {
    constructor(leaderboard) {
        this.leaderboard = leaderboard;
    }

    get enabled() {
        return this.leaderboard.enabled;
    }

    async getToday() {
        return this.leaderboard.requestDailyChallenge('GET');
    }

    async begin() {
        const response = await this.leaderboard.requestDailyChallenge('POST', {
            action: 'start', courseVersion: DAILY_COURSE_VERSION,
        });
        if (typeof response?.runId !== 'string'
            || typeof response?.date !== 'string'
            || response?.courseVersion !== DAILY_COURSE_VERSION) {
            throw new Error('Daily course registration returned invalid data.');
        }
        return {
            runId: response.runId, date: response.date,
            courseVersion: response.courseVersion,
            nickname: response.nickname ?? null,
            submitted: false,
        };
    }

    async finish(run, { nickname, score, rings, distance }) {
        if (!run?.runId || run.submitted) throw new Error('This daily run is no longer available.');
        const result = await this.leaderboard.requestDailyChallenge('POST', {
            action: 'finish', runId: run.runId, nickname, score, rings, distance,
        });
        if (!result?.accepted) throw new Error('Daily score was not accepted.');
        run.submitted = true;
        this.leaderboard.rememberNickname(nickname);
        return result;
    }

    getKnownNickname() {
        return this.leaderboard.getNickname();
    }
}
