import test from 'ava'
import { profileFor, rosterFor } from '@/config/cast'
import { RING_TABLES, VENUES } from '@/config/venues'
import {
  CASH_PRACTICE_AI_COUNT,
  DEFAULT_CASH_AI_LEVELS,
  cashPracticeVenue,
  createCashSessionSetup,
  profileForCashSeat,
  rebuyCashAiSeats,
  resolveCashOpponents,
} from '@/lib/cashSetup'
import { profileForSkill, type AiSkillLevel } from '@/lib/poker/ai/skill'
import {
  createCashSoakSession,
  resumeCashSoak,
  runCashSoak,
  snapshotCashSoak,
} from '../scripts/lib/cashSoak'

const room = RING_TABLES[0]
const characters = rosterFor(room).slice(0, CASH_PRACTICE_AI_COUNT)

test('cash setup defaults to five seats at Lv2/Lv3/Lv3/Lv4/Lv3', (t) => {
  const setup = createCashSessionSetup(room, characters)
  t.deepEqual(setup.levels, [2, 3, 3, 4, 3])
  t.deepEqual(setup.levels, DEFAULT_CASH_AI_LEVELS)
  t.is(setup.characterIds.length, 5)
})

test('all five cash opponents can use different levels without losing personality', (t) => {
  const setup = {
    ...createCashSessionSetup(room, characters),
    levels: [1, 2, 3, 4, 5] as AiSkillLevel[],
  }
  const opponents = resolveCashOpponents(cashPracticeVenue(room), setup)

  t.deepEqual(
    opponents.map((opponent) => opponent.ai.skillLevel),
    [1, 2, 3, 4, 5],
  )
  for (const opponent of opponents) {
    const personality = profileFor(room, opponent.character)
    t.is(opponent.ai.tightness, personality.tightness)
    t.is(opponent.ai.aggression, personality.aggression)
    t.is(opponent.ai.bluff, personality.bluff)
  }
})

test('cash practice adapts a room to fixed-blind six-max 100BB without mutating it', (t) => {
  const practice = cashPracticeVenue(room)
  t.is(practice.seats, 6)
  t.is(practice.startingStack, practice.bigBlind * 100)
  t.false(practice.escalation)
  t.true(practice.cash)
  t.is(room.seats, 5, 'the existing Micro Ring remains five-handed outside practice setup')
})

test('AI rebuy keeps each seat profile and selected level', (t) => {
  const levels = [1, 2, 3, 4, 5] as const
  const seats = levels.map((level, index) => ({
    id: `ai${index + 1}`,
    isHuman: false,
    stack: index % 2 === 0 ? 0 : 50,
    ai: profileForCashSeat(room, characters[index], level),
  }))
  const rebought = rebuyCashAiSeats(seats, 200)
  t.deepEqual(
    rebought.map((seat) => seat.ai.skillLevel),
    levels,
  )
  t.deepEqual(
    rebought.map((seat) => seat.stack),
    [200, 50, 200, 50, 200],
  )
})

test('mixed levels survive repeated hands and a JSON snapshot/resume', (t) => {
  const personality = { tightness: 0.32, aggression: 0.5, bluff: 0.09 }
  const levels = [1, 2, 3, 4, 5] as const
  const aiProfiles = levels.map((level) => ({
    ...profileForSkill(personality, level),
    iterations: 4,
  }))
  const hero = { ...profileForSkill(personality, 3), iterations: 4 }
  const first = runCashSoak(createCashSoakSession({ seed: 818, aiProfiles }), 150, hero).snapshot
  const resumed = resumeCashSoak(snapshotCashSoak(first))
  const finished = runCashSoak(resumed, 150, hero).snapshot

  t.is(finished.stats.handsPlayed, 300)
  t.is(finished.stats.invariantFailures.length, 0)
  t.deepEqual(
    finished.seats.slice(1).map((seat) => seat.ai?.skillLevel),
    levels,
  )
  t.is(finished.buttonIndex, 300 % 6)
})

test('legacy tournament profiles remain scalar and unlevelled', (t) => {
  const venue = VENUES[0]
  const character = rosterFor(venue)[0]
  const legacy = profileFor(venue, character)
  t.is(legacy.skillLevel, undefined)
  t.is(legacy.skill, venue.ai.skill)
  t.false(venue.cash === true)
})
