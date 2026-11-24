/** One RPC supplies the list, profile and own rank from one database snapshot. */
export async function readLeaderboard(db, playerId, allTime = false) {
    const snapshot = allTime ? 'all_time_leaderboard_snapshot' : 'classic_leaderboard_snapshot';
    const { data, error } = await db.rpc(snapshot, { p_user_id: playerId });
    if (error || !data || !Array.isArray(data.entries)) {
        throw new Error('Leaderboard is temporarily unavailable.');
    }
    return data;
}
