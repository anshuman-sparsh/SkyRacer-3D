import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { AircraftSelection } from '../src/hangar/AircraftSelection.js';
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const migration = read('../supabase/migrations/20261030073352_hangar_verified_progression.sql');
const dates = read('../supabase/migrations/20261030073702_hangar_daily_distinct_dates.sql');
const fn = read('../supabase/functions/hangar-progress/index.ts');
const service = read('../src/services/LeaderboardService.js');
const main = read('../src/main.js');
const panel = read('../src/ui/HangarPanel.js');

test('unverified reward selections remain locked; verified IDs equip and persist', () => {
 const map = new Map(),storage = {getItem:k=>map.get(k),setItem:(k,v)=>map.set(k,v)};
 const choices=[];
 const selection = new AircraftSelection({storage,theme:'neon',onChange:id=>choices.push(id)});
 assert.equal(selection.choose('silver-arrow'),false);
 assert.equal(selection.activeId,'cyan-striker');
 selection.setUnlocked(['cyan-striker','ember-striker','silver-arrow']);
 assert.equal(selection.choose('silver-arrow'),true);
 assert.equal(selection.activeId,'silver-arrow');
 selection.setTheme('ember');
 assert.equal(selection.activeId,'silver-arrow');
 selection.setUnlocked(['cyan-striker','ember-striker']);
 assert.equal(selection.activeId,'ember-striker');
 assert.equal(selection.choose('silver-arrow'),false);
 assert.equal(selection.choose('match-theme'),true);
 assert.equal(selection.activeId,'ember-striker');
});
test('lifetime progression uses deduplicated verified server submissions', () => {
 assert.match(migration,/PRIMARY KEY \(mode,run_id\)/);
 assert.match(migration,/ON CONFLICT \(mode,run_id\) DO NOTHING/);
 for(const name of ['best_scores','friend_classic_results','daily_run_sessions','friend_runs']){
  assert.ok(migration.includes(name));
 }
 assert.match(migration,/ENABLE ROW LEVEL SECURITY/);
 assert.match(migration,/get_hangar_progress/);
 assert.match(migration,/GRANT EXECUTE ON FUNCTION public.get_hangar_progress\(uuid\) TO service_role/);
 assert.match(migration,/REVOKE ALL ON FUNCTION public.get_hangar_progress\(uuid\) FROM PUBLIC,anon,authenticated/);
});
test('unlock requirements use server totals and 10 distinct Daily challenge dates', () => {
 assert.match(dates,/count\(DISTINCT r.daily_date\)/);
 for(const check of ['v_rings>=100','v_distance>=10000 AND v_rings>=500','v_distance>=25000 AND v_rings>=1500','v_wins>=10 AND v_daily>=10']){
  assert.ok(dates.includes(check));
 }
 assert.match(dates,/NEW.challenge_date/);
});
test('authenticated Hangar service checks progress without trusting local counters', () => {
 assert.match(fn,/withSupabase\(\{ auth: 'user' \}/);
 assert.match(fn,/ctx.userClaims\?\.id/);
 assert.match(fn,/rpc\('get_hangar_progress'/);
 assert.match(service,/getHangarProgress/);
 assert.match(panel,/this.selection.setUnlocked\(data.unlockedIds\)/);
 assert.match(panel,/this.renderProgress\(\)/);
 assert.match(main,/friendService.submitClassic/);
 assert.match(main,/hangarPanel.refreshProgress/);
 assert.match(main,/openNewHangarUnlock/);
});
