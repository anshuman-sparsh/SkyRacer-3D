export async function readDailyLeaderboard(db, playerId, date, courseVersion) {
    const { data, error } = await db.rpc('daily_leaderboard_snapshot', {
        p_user_id: playerId, p_date: date, p_course_version: courseVersion,
    });
    if (error || !data || !Array.isArray(data.entries)) throw new Error('Daily rankings are temporarily unavailable.');
    return data;
}
