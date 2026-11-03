export const MAX_CLASSIC_RUN_MS = 6 * 60 * 60 * 1000;

export async function readRunStatus(db, playerId, runId, now = Date.now()) {
    const { data, error } = await db.from('run_sessions')
        .select('started_at, score_version').eq('run_id', runId)
        .eq('user_id', playerId).maybeSingle();
    if (error) throw new Error('Could not check this run’s expiration.');
    if (!data || data.score_version !== 2) return null;
    return { runId, startedAt: data.started_at,
        expiresAt: new Date(Date.parse(data.started_at) + MAX_CLASSIC_RUN_MS).toISOString(),
        serverNow: new Date(now).toISOString() };
}
