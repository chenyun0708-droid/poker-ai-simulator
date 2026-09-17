// Deterministic 6-max cash-session soak. This is deliberately separate from
// `sim.ts`: tournament win rate and an endless cash table answer different questions.
//
//   pnpm sim:cash-soak
//   pnpm sim:cash-soak -- --hands 2000 --seed 42

import { createCashSoakSession, runCashSoak, type CashSoakSnapshot } from './lib/cashSoak'
import { profileForSkill, skillConfigForLevel, type AiSkillLevel } from '@/lib/poker/ai/skill'

function flagNumber(name: string, fallback: number): number {
  const index = process.argv.indexOf(`--${name}`)
  if (index < 0) return fallback
  const value = Number(process.argv[index + 1])
  if (!Number.isSafeInteger(value) || value < 0)
    throw new Error(`--${name} must be a non-negative integer`)
  return value
}

const hands = flagNumber('hands', 1_000)
const seed = flagNumber('seed', 1)
const level = flagNumber('level', 3)
if (level < 1 || level > 5) throw new Error('--level must be from 1 to 5')
const skillLevel = level as AiSkillLevel
const profile = profileForSkill({ tightness: 0.32, aggression: 0.5, bluff: 0.09 }, skillLevel)
const mixed = process.argv.includes('--mixed')
const aiProfiles = mixed
  ? ([1, 2, 3, 4, 5] as const).map((seatLevel) =>
      profileForSkill({ tightness: 0.32, aggression: 0.5, bluff: 0.09 }, seatLevel),
    )
  : undefined
const started = performance.now()
const { snapshot } = runCashSoak(createCashSoakSession({ seed, aiProfiles }), hands, profile)
const runtime = performance.now() - started
const retainedMixedLevels = snapshot.seats
  .slice(1)
  .map((seat) => seat.ai?.skillLevel)
  .join(',')

printSummary(snapshot, runtime)
if (mixed) console.log(`AI levels retained: ${retainedMixedLevels === '1,2,3,4,5' ? 'yes' : 'no'}`)
if (
  snapshot.stats.invariantFailures.length > 0 ||
  snapshot.stats.handsPlayed !== hands ||
  (mixed && retainedMixedLevels !== '1,2,3,4,5')
)
  process.exitCode = 1

function printSummary(session: CashSoakSnapshot, runtimeMs: number): void {
  const stats = session.stats
  console.log('Cash soak complete')
  console.log(`hands played: ${stats.handsPlayed}`)
  console.log(`seed: ${session.seed}`)
  console.log(`level: Lv${skillLevel} ${skillConfigForLevel(skillLevel).label}`)
  if (mixed) console.log('AI seats: Lv1, Lv2, Lv3, Lv4, Lv5')
  console.log(`rebuys: ${stats.rebuys}`)
  console.log(`Hero rebuys: ${stats.heroRebuys}`)
  console.log(`AI rebuys: ${stats.aiRebuys}`)
  console.log(`all-ins: ${stats.allIns}`)
  console.log(`uneven-stack all-ins: ${stats.unevenStackAllIns}`)
  console.log(`side pots: ${stats.sidePots}`)
  console.log(`multiple side pots: ${stats.multipleSidePots}`)
  console.log(`split pots: ${stats.splitPots}`)
  console.log(`heads-up pots: ${stats.headsUpPots}`)
  console.log(`multi-way pots: ${stats.multiWayPots}`)
  console.log(`maximum observed pot: ${stats.maximumObservedPot}`)
  console.log(`VPIP-like rate: ${percentage(stats.voluntaryPreflopEntries, stats.playerHands)}`)
  console.log(`aggressive action rate: ${percentage(stats.bets + stats.raises, stats.actions)}`)
  console.log(`showdown frequency: ${percentage(stats.showdowns, stats.handsPlayed)}`)
  console.log(
    `actions: fold=${stats.folds}, check=${stats.checks}, call=${stats.calls}, bet=${stats.bets}, raise=${stats.raises}`,
  )
  console.log(`final stacks: ${session.seats.map((seat) => `${seat.id}=${seat.stack}`).join(', ')}`)
  console.log(`runtime: ${(runtimeMs / 1000).toFixed(2)}s`)
  console.log(`detected invariant failures: ${stats.invariantFailures.length}`)
  for (const failure of stats.invariantFailures) console.log(`  - ${failure}`)
}

function percentage(numerator: number, denominator: number): string {
  return denominator === 0 ? '0.0%' : `${((numerator / denominator) * 100).toFixed(1)}%`
}
