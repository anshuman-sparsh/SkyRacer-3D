/**
 * M4 friend challenge API. All author IDs, target scores and result decisions
 * originate from the authenticated Supabase backend, never URL parameters.
 */
export class FriendChallengeService {
    constructor(leaderboard) { this.leaderboard = leaderboard; }
    get enabled() { return this.leaderboard.enabled; }
    async resolve(id) {
        return this.leaderboard.requestFriendChallenge('GET', null, id);
    }
    async create({ runId }) {
        if (!runId) throw new Error('Submit your completed Classic run to verify it before sharing.');
        return this.leaderboard.requestFriendChallenge('POST', { action: 'create', runId });
    }
    async start(id) {
        const response = await this.leaderboard.requestFriendChallenge('POST',
            { action: 'start', challengeId: id });
        if (typeof response?.runId !== 'string') throw new Error('Attempt was not registered.');
        return response;
    }
    async finish(runId, { score, rings, distance }) {
        return this.leaderboard.requestFriendChallenge('POST',
            { action: 'finish', runId, score, rings, distance });
    }
}
