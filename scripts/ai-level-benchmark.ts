// Regression benchmark for behaviour shapes, not a poker-strength claim.
// Each level plays homogeneous, independent cash sessions over the same seeds.

import { performance } from 'node:perf_hooks'
import { profileForSkill, skillConfigForLevel, type AiSkillLevel } from '@/lib/poker/ai/skill'
import { createCashSoakSession, runCashSoak, type CashSoakStats } from './lib/cashSoak'

const hands = flagNumber('hands', 150)
const sessions = flagNumber('sessions', 2)
const baseSeed = flagNumber('seed', 41)
const personality = { tightness: 0.32, aggression: 0.5, bluff: 0.09 }

console.log(`AI level benchmark · ${sessions} sessions × ${hands} hands · seed ${baseSeed}`)
console.log('Regression sanity check only; ending chips are not a strength ranking.')

for (const level of [1, 2, 3, 4, 5] as const) {
  const profile = profileForSkill(personality, level)
  const totals = emptyTotals()
  const endingChips: number[] = []
  const started = performance.now()
  for (let session = 0; session < sessions; session++) {
    const seed = baseSeed + session * 1_000_003
    const result = runCashSoak(createCashSoakSession({ seed }), hands, profile).snapshot
    addStats(totals, result.stats)
    endingChips.push(result.seats[0].stack)
  }
  const runtime = performance.now() - started
  printLevel(level, totals, endingChips, runtime)
  if (totals.invariantFailures.length > 0) process.exitCode = 1
}

function printLevel(
  level: AiSkillLevel,
  stats: CashSoakStats,
  endingChips: number[],
  runtimeMs: number,
): void {
  const config = skillConfigForLevel(level)
  const aggressive = stats.bets + stats.raises
  console.log(
    [
      `Lv${level} ${config.label}`,
      `iterations=${config.iterations}`,
      `ending=${endingChips.join('/')}`,
      `rebuys=${stats.rebuys}`,
      `VPIP=${percentage(stats.voluntaryPreflopEntries, stats.playerHands)}`,
      `agg=${percentage(aggressive, stats.actions)}`,
      `showdown=${percentage(stats.showdowns, stats.handsPlayed)}`,
      `F/C/R=${stats.folds}/${stats.calls}/${stats.raises}`,
      `runtime=${(runtimeMs / 1000).toFixed(2)}s`,
      `failures=${stats.invariantFailures.length}`,
    ].join(' · '),
  )
}

function addStats(total: CashSoakStats, part: CashSoakStats): void {
  for (const key of Object.keys(total) as Array<keyof CashSoakStats>) {
    if (key === 'invariantFailures') total[key].push(...part[key])
    else if (key === 'maximumObservedPot') total[key] = Math.max(total[key], part[key])
    else total[key] += part[key]
  }
}

function emptyTotals(): CashSoakStats {
  return {
    handsPlayed: 0,
    rebuys: 0,
    heroRebuys: 0,
    aiRebuys: 0,
    allIns: 0,
    unevenStackAllIns: 0,
    headsUpPots: 0,
    multiWayPots: 0,
    sidePots: 0,
    multipleSidePots: 0,
    splitPots: 0,
    maximumObservedPot: 0,
    actions: 0,
    folds: 0,
    checks: 0,
    calls: 0,
    bets: 0,
    raises: 0,
    voluntaryPreflopEntries: 0,
    playerHands: 0,
    showdowns: 0,
    invariantFailures: [],
  }
}

function flagNumber(name: string, fallback: number): number {
  const index = process.argv.indexOf(`--${name}`)
  if (index < 0) return fallback
  const value = Number(process.argv[index + 1])
  if (!Number.isSafeInteger(value) || value <= 0)
    throw new Error(`--${name} must be a positive integer`)
  return value
}

function percentage(numerator: number, denominator: number): string {
  return denominator === 0 ? '0.0%' : `${((numerator / denominator) * 100).toFixed(1)}%`
}
