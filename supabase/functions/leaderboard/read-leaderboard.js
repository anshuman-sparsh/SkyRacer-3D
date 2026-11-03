/** One RPC supplies the list, profile and own rank from one database snapshot. */
export async function readLeaderboard(db, playerId) {
    const { data, error } = await db.rpc('classic_leaderboard_snapshot', { p_user_id: playerId });
    if (error || !data || !Array.isArray(data.entries)) {
        throw new Error('Leaderboard is temporarily unavailable.');
    }
    return data;
}
