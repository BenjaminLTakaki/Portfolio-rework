import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { simulate, seriesProb, canLock, updateLocks } from './forecaster.js';

const model = JSON.parse(readFileSync(new URL('../../public/forecaster/msi_2026.json', import.meta.url)));

test('series probabilities and tournament totals stay valid', () => {
  assert.equal(seriesProb(0.5), 0.5);
  assert.equal(seriesProb(0), 0);
  assert.equal(seriesProb(1), 1);
  const result = simulate(model, {}, 200);
  assert.ok(Math.abs(result.odds.reduce((sum, row) => sum + row.champion, 0) - 1) < 1e-10);
  assert.ok(Math.abs(result.odds.reduce((sum, row) => sum + row.grandFinal, 0) - 2) < 1e-10);
  for (const slot of Object.values(result.slots)) assert.notEqual(slot.a, slot.b);
});

test('future and impossible winners cannot enter the bracket', () => {
  assert.equal(canLock('UB_SF_M1', {}), false);
  assert.throws(() => simulate(model, { GF_M1: model.seeding[0] }, 1), /earlier rounds/);
  assert.throws(() => simulate(model, { UB_R1_M1: 'Not a participant' }, 1), /not in this matchup/);
  assert.throws(() => simulate(model, {}, 0), /positive integer/);
});

test('changing an upstream result clears affected upper and lower rounds', () => {
  let locks = { UB_R1_M1: model.seeding[0], UB_R1_M2: model.seeding[3], UB_R1_M3: model.seeding[1] };
  assert.equal(canLock('UB_SF_M1', locks), true);
  locks = updateLocks(locks, 'UB_SF_M1', model.seeding[0]);
  locks = updateLocks(locks, 'LB_R1_M1', model.seeding[7]);
  locks = updateLocks(locks, 'UB_R1_M1', model.seeding[7]);
  assert.equal(locks.UB_SF_M1, undefined);
  assert.equal(locks.LB_R1_M1, undefined);
  assert.equal(locks.UB_R1_M3, model.seeding[1]);
  const result = simulate(model, locks, 50);
  assert.equal(result.slots.UB_R1_M1.locked, model.seeding[7]);
  assert.deepEqual(updateLocks({}, 'GF_M1', model.seeding[0]), {});
});
