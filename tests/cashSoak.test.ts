import test from 'ava'
import {
  CASH_SOAK_BUY_IN,
  CASH_SOAK_PROFILE,
  CASH_SOAK_SEATS,
  createCashSoakSession,
  resumeCashSoak,
  runCashSoak,
  snapshotCashSoak,
} from '../scripts/lib/cashSoak'

// Keep the regression suite quick. The CLI's default 1,000-hand soak uses 40
// equity iterations; determinism and accounting do not depend on sample size.
const FAST_PROFILE = { ...CASH_SOAK_PROFILE, iterations: 4 }

test('a seeded 6-max cash session runs 500 hands with rebuys and valid accounting', (t) => {
  const session = createCashSoakSession({ seed: 11 })
  const { snapshot, lastHand } = runCashSoak(session, 500, FAST_PROFILE)

  t.is(snapshot.stats.handsPlayed, 500)
  t.is(snapshot.seats.length, CASH_SOAK_SEATS)
  t.is(snapshot.buttonIndex, 500 % CASH_SOAK_SEATS)
  t.is(snapshot.stats.invariantFailures.length, 0)
  t.true(snapshot.stats.rebuys > 0, 'the regression seed must exercise cash rebuys')
  t.true(snapshot.stats.heroRebuys > 0, 'the regression seed must exercise a Hero rebuy')
  t.true(snapshot.stats.aiRebuys > 0, 'the regression seed must exercise an AI rebuy')
  t.true(snapshot.stats.allIns > 0)
  t.true(snapshot.stats.sidePots > 0)
  t.true(snapshot.stats.splitPots > 0)
  t.true(snapshot.stats.headsUpPots > 0)
  t.true(snapshot.stats.multiWayPots > 0)
  t.is(lastHand?.street, 'complete')

  const expected = CASH_SOAK_BUY_IN * CASH_SOAK_SEATS + snapshot.totalRebuyAmount
  t.is(
    snapshot.seats.reduce((sum, seat) => sum + seat.stack, 0),
    expected,
  )
})

test('same seed replays the same decks, actions, stacks, and statistics', (t) => {
  const first = runCashSoak(createCashSoakSession({ seed: 73 }), 120, FAST_PROFILE).snapshot
  const second = runCashSoak(createCashSoakSession({ seed: 73 }), 120, FAST_PROFILE).snapshot

  t.deepEqual(second, first)
})

test('a 250-hand snapshot resumes for another 250 hands without changing the sequence', (t) => {
  const uninterrupted = runCashSoak(createCashSoakSession({ seed: 29 }), 500, FAST_PROFILE).snapshot

  const firstHalf = runCashSoak(createCashSoakSession({ seed: 29 }), 250, FAST_PROFILE).snapshot
  const saved = snapshotCashSoak(firstHalf)
  const resumed = resumeCashSoak(saved)

  t.not(resumed, firstHalf)
  t.deepEqual(resumed.seats, firstHalf.seats)
  t.is(resumed.buttonIndex, 250 % CASH_SOAK_SEATS)
  t.is(resumed.smallBlind, 1)
  t.is(resumed.bigBlind, 2)

  const completed = runCashSoak(resumed, 250, FAST_PROFILE).snapshot
  t.deepEqual(completed, uninterrupted)
  t.is(completed.stats.handsPlayed, 500)
  t.is(completed.stats.invariantFailures.length, 0)
})
