const count = value => Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;

export function scoreComparison(score, previousBest, mode = 'classic', local = false) {
    score = count(score);
    if (mode === 'friend') return 'Friend Challenge result is shown separately.';
    const label = mode === 'classic' ? 'local best' : local ? 'local Daily best' : 'known Daily best';
    if (previousBest == null) return mode === 'classic'
        ? 'Finish another flight to build your local record.' : 'Daily best comparison appears after your first saved result.';
    const best = count(previousBest);
    if (!best) return score > 0 ? 'FIRST RECORD · ' + score.toLocaleString() + ' points'
        : 'Your first points are one flight away.';
    const difference = score - best;
    if (difference > 0) return '+' + difference.toLocaleString() + ' above your previous ' + label;
    if (difference === 0) return 'Matched your ' + label + ' · ' + best.toLocaleString();
    return (-difference).toLocaleString() + ' from your ' + label + ' of ' + best.toLocaleString();
}

const GOALS = [
    ['silver-arrow', 'Silver Arrow', [['totalRings',100,'rings']]],
    ['voidrunner', 'Voidrunner', [['totalDistance',10000,'distance'],['totalRings',500,'rings']]],
    ['nova-vortex', 'Nova Vortex', [['totalDistance',25000,'distance'],['totalRings',1500,'rings']]],
    ['apex-overdrive', 'Apex Overdrive', [['friendWins',10,'wins'],['dailyCompletions',10,'Daily days']]],
];

/** Display authoritative totals only; never credit an unverified current run. */
export function nextHangarGoal(progress, local = false) {
    if (!progress || !Array.isArray(progress.unlockedIds)) return {
        text: local ? 'Finish a flight to build your local unlock progress.'
            : 'Open Hangar to check your verified unlock progress.', ratio: null,
    };
    const goal = GOALS.find(([id]) => !(local && id === 'apex-overdrive') && !progress.unlockedIds.includes(id));
    if (!goal) return { text: local ? 'All aircraft available in this local edition unlocked.' : 'All aircraft unlocked.', ratio: null };
    const [,name,requirements] = goal;
    const ratio = Math.min(...requirements.map(([key,target]) => Math.min(1,count(progress[key])/target)));
    return { ratio, text: (local ? 'Local' : 'Verified') + ' · Next: ' + name + ' · '
        + requirements.map(([key,target,label]) => Math.min(target,count(progress[key])).toLocaleString()
            + ' / ' + target.toLocaleString() + ' ' + label).join(' · ')
        + (ratio === 1 ? ' · Awaiting unlock confirmation' : '') };
}
