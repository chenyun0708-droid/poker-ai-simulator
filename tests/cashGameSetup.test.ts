import test from 'ava'
import { CAST, profileFor } from '@/config/cast'
import { RING_TABLES, VENUES } from '@/config/venues'
import {
  cashAiProfile,
  CASH_AI_SEATS,
  createCashGameSetup,
  DEFAULT_CASH_SKILL_LEVELS,
} from '@/lib/cashGameSetup'
import { profileForSkill } from '@/lib/poker/ai/skill'
import {
  createCashSoakSession,
  resumeCashSoak,
  runCashSoak,
  snapshotCashSoak,
} from '../scripts/lib/cashSoak'

const cashVenue = RING_TABLES[0]
const cast = CAST.filter((character) => !character.only).slice(0, CASH_AI_SEATS)

test('cash setup creates five independently configurable opponents with the requested defaults', (t) => {
  const setup = createCashGameSetup(cashVenue, cast)
  t.is(setup.aiSeats.length, 5)
  t.deepEqual(
    setup.aiSeats.map((seat) => seat.level),
    DEFAULT_CASH_SKILL_LEVELS,
  )
  setup.aiSeats.forEach((seat, index) => {
    seat.level = (index + 1) as 1 | 2 | 3 | 4 | 5
  })
  t.deepEqual(
    setup.aiSeats.map((seat) => seat.level),
    [1, 2, 3, 4, 5],
  )
})

test('cash profiles receive each seat level without replacing character personality', (t) => {
  const profiles = cast.map((character, index) =>
    cashAiProfile(cashVenue, character, (index + 1) as 1 | 2 | 3 | 4 | 5),
  )
  profiles.forEach((profile, index) => {
    const personality = profileFor(cashVenue, cast[index])
    t.is(profile.skillLevel, (index + 1) as 1 | 2 | 3 | 4 | 5)
    t.is(profile.tightness, personality.tightness)
    t.is(profile.aggression, personality.aggression)
    t.is(profile.bluff, personality.bluff)
  })
})

test('mixed levels survive cash rebuy-style seat copies and snapshot resume', (t) => {
  const profiles = ([1, 2, 3, 4, 5] as const).map((level) =>
    profileForSkill({ tightness: 0.3, aggression: 0.5, bluff: 0.1 }, level),
  )
  const session = createCashSoakSession({ aiProfiles: profiles })
  const rebought = session.seats.map((seat) => ({
    ...seat,
    stack: seat.id === 'ai1' ? 200 : seat.stack,
  }))
  const resumed = resumeCashSoak(snapshotCashSoak({ ...session, seats: rebought }))
  t.deepEqual(
    resumed.seats.slice(1).map((seat) => seat.ai?.skillLevel),
    [1, 2, 3, 4, 5],
  )

  const afterNewHands = runCashSoak(resumed, 20, profiles[2]).snapshot
  t.deepEqual(
    afterNewHands.seats.slice(1).map((seat) => seat.ai?.skillLevel),
    [1, 2, 3, 4, 5],
  )
})

test('tournament configuration remains unchanged and scalar AI profiles remain valid', (t) => {
  t.false(Boolean(VENUES[0].cash))
  t.is(VENUES[0].seats, 3)
  t.is(VENUES[0].ai.skillLevel, undefined)
  t.truthy(VENUES[0].ai.skill)
})
