import test from 'ava'
import {
  AI_SKILL_CONFIGS,
  legacySkillLevel,
  profileForSkill,
  skillConfigForLevel,
  type AiPersonality,
  type AiSkillLevel,
} from '@/lib/poker/ai/skill'
import { createCashSoakSession, runCashSoak } from '../scripts/lib/cashSoak'

const LEVELS = [1, 2, 3, 4, 5] as const
const BALANCED: AiPersonality = { tightness: 0.32, aggression: 0.5, bluff: 0.09 }
const fastProfile = (level: AiSkillLevel, personality = BALANCED) => ({
  ...profileForSkill(personality, level),
  iterations: 4,
})

test('five named levels are non-linear decision-quality bundles', (t) => {
  t.deepEqual(
    LEVELS.map((level) => skillConfigForLevel(level).label),
    ['Beginner', 'Recreational', 'Regular', 'Strong Regular', 'Elite'],
  )

  const beginner = AI_SKILL_CONFIGS[1]
  const elite = AI_SKILL_CONFIGS[5]
  t.true(elite.iterations > beginner.iterations * 4)
  t.true(beginner.equityNoise > elite.equityNoise * 10)
  t.true(elite.potOddsAwareness > beginner.potOddsAwareness)
  t.true(elite.positionAwareness > beginner.positionAwareness)
  t.true(elite.stackDepthAwareness > beginner.stackDepthAwareness)
  t.true(elite.bluffDiscipline > beginner.bluffDiscipline)
  t.true(elite.valueDiscipline > beginner.valueDiscipline)
  t.true(beginner.sizingJitter > elite.sizingJitter)
  t.true(beginner.decisionErrorRate > elite.decisionErrorRate * 10)
  t.true(beginner.actionNoise > elite.actionNoise * 5)
  t.true(beginner.callBias > elite.callBias)
})

test('all five levels complete legal, continuous 6-max cash hands', (t) => {
  for (const level of LEVELS) {
    const result = runCashSoak(createCashSoakSession({ seed: 900 + level }), 80, fastProfile(level))
    t.is(result.snapshot.stats.handsPlayed, 80, `Lv${level} stopped early`)
    t.is(result.snapshot.stats.invariantFailures.length, 0, `Lv${level} invariant failure`)
    t.is(result.snapshot.seats.length, 6)
    t.is(result.snapshot.buttonIndex, 80 % 6)
    t.is(result.lastHand?.street, 'complete')
  }
})

test('a level-aware policy is deterministic for the same seed', (t) => {
  const run = () => runCashSoak(createCashSoakSession({ seed: 73 }), 100, fastProfile(5)).snapshot
  t.deepEqual(run(), run())
})

test('levels produce systematically different behaviour on the same session seed', (t) => {
  const rows = LEVELS.map((level) => {
    const stats = runCashSoak(createCashSoakSession({ seed: 101 }), 120, fastProfile(level))
      .snapshot.stats
    return `${stats.voluntaryPreflopEntries}/${stats.folds}/${stats.calls}/${stats.raises}`
  })
  t.is(new Set(rows).size, LEVELS.length, rows.join(' · '))
})

test('personality remains independent inside one skill level', (t) => {
  const loose = fastProfile(4, { tightness: 0.1, aggression: 0.65, bluff: 0.15 })
  const nit = fastProfile(4, { tightness: 0.8, aggression: 0.25, bluff: 0.02 })
  const looseStats = runCashSoak(createCashSoakSession({ seed: 55 }), 160, loose).snapshot.stats
  const nitStats = runCashSoak(createCashSoakSession({ seed: 55 }), 160, nit).snapshot.stats

  t.is(loose.skillLevel, nit.skillLevel)
  t.true(looseStats.voluntaryPreflopEntries > nitStats.voluntaryPreflopEntries * 2)
  t.true(looseStats.raises > nitStats.raises * 2)
})

test('legacy scalar profiles map cleanly without becoming persisted state', (t) => {
  t.is(legacySkillLevel(0.2), 1)
  t.is(legacySkillLevel(0.42), 2)
  t.is(legacySkillLevel(0.66), 3)
  t.is(legacySkillLevel(0.84), 4)
  t.is(legacySkillLevel(1), 5)

  const lag = profileForSkill({ tightness: 0.18, aggression: 0.82, bluff: 0.2 }, 4)
  t.like(lag, { tightness: 0.18, aggression: 0.82, bluff: 0.2, skillLevel: 4 })
})
