import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const sql=readFileSync(new URL('../supabase/migrations/20261030045020_friend_classic_independent_increasing_scores.sql',import.meta.url),'utf8');
test('independent friend scores',()=>{assert.match(sql,/CREATE TABLE public.friend_classic_results/);assert.match(sql,/submit_friend_classic_result/);});
test('increasing challenges',()=>{assert.match(sql,/FRIEND_SCORE_NOT_HIGHER/);assert.match(sql,/FRIEND_NEEDS_NEW_RUN/);assert.match(sql,/accepted_score<=previous.target_score/);});
