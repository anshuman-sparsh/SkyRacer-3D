/**
 * Append verified country codes only. Historical scores (unknown IP country)
 * keep their existing nicknames without guessing a location.
 */
export function formatLeaderboardName(entry) {
    const nickname = String(entry?.nickname ?? 'Pilot');
    const countryCode = entry?.countryCode;
    return typeof countryCode === 'string' && /^[A-Z]{2}$/.test(countryCode)
        ? `${nickname} (${countryCode})`
        : nickname;
}
