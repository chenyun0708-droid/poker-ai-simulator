import { characterById, draftCast, profileFor, type Character } from '@/config/cast'
import type { Venue } from '@/config/venues'
import type { AiProfile } from '@/lib/poker/ai/policy'
import { profileForSkill, skillConfigForLevel, type AiSkillLevel } from '@/lib/poker/ai/skill'

export const CASH_PRACTICE_AI_COUNT = 5
export const DEFAULT_CASH_AI_LEVELS: readonly AiSkillLevel[] = [2, 3, 3, 4, 3]
const CASH_SETUP_KEY = 'pip.cash-setup'

export interface CashSessionSetup {
  venueId: string
  characterIds: string[]
  levels: AiSkillLevel[]
}

export interface ResolvedCashOpponent {
  character: Character
  level: AiSkillLevel
  ai: AiProfile
}

/** A Rail sit-down is the explicit six-max practice mode; other venue configs stay untouched. */
export function cashPracticeVenue(venue: Venue): Venue {
  const stack = venue.bigBlind * 100
  if (venue.buyIn !== stack) throw new Error(`${venue.id} is not a 100BB cash table`)
  return {
    ...venue,
    seats: CASH_PRACTICE_AI_COUNT + 1,
    startingStack: stack,
    escalation: false,
    cash: true,
  }
}

export function createCashSessionSetup(
  venue: Venue,
  characters: readonly Character[] = draftCast(venue, CASH_PRACTICE_AI_COUNT),
): CashSessionSetup {
  if (characters.length !== CASH_PRACTICE_AI_COUNT) {
    throw new Error(`Cash practice needs ${CASH_PRACTICE_AI_COUNT} opponents`)
  }
  return {
    venueId: venue.id,
    characterIds: characters.map((character) => character.id),
    levels: [...DEFAULT_CASH_AI_LEVELS],
  }
}

/** Combine cast personality with the selected skill bundle in the domain layer. */
export function profileForCashSeat(
  venue: Venue,
  character: Character,
  level: AiSkillLevel,
): AiProfile {
  const personality = profileFor(venue, character)
  return profileForSkill(
    {
      tightness: personality.tightness,
      aggression: personality.aggression,
      bluff: personality.bluff,
    },
    level,
  )
}

export function resolveCashOpponents(
  venue: Venue,
  setup: CashSessionSetup,
): ResolvedCashOpponent[] {
  if (!validCashSessionSetup(setup, venue.id)) throw new Error('Invalid cash-session setup')
  return setup.characterIds.map((id, index) => {
    const character = characterById(id)
    if (!character) throw new Error(`Unknown cash opponent ${id}`)
    const level = setup.levels[index]
    return { character, level, ai: profileForCashSeat(venue, character, level) }
  })
}

export function skillLevelLabel(level: AiSkillLevel): string {
  return `Lv${level} ${skillConfigForLevel(level).label}`
}

export function saveCashSessionSetup(setup: CashSessionSetup): void {
  try {
    sessionStorage.setItem(CASH_SETUP_KEY, JSON.stringify(setup))
  } catch {
    // A direct route still starts the legacy table if session storage is unavailable.
  }
}

export function takeCashSessionSetup(venueId: string): CashSessionSetup | null {
  try {
    const raw = sessionStorage.getItem(CASH_SETUP_KEY)
    sessionStorage.removeItem(CASH_SETUP_KEY)
    if (!raw) return null
    const setup = JSON.parse(raw) as CashSessionSetup
    return validCashSessionSetup(setup, venueId) ? setup : null
  } catch {
    return null
  }
}

export function rebuyCashAiSeats<T extends { isHuman: boolean; stack: number }>(
  seats: readonly T[],
  tableStack: number,
): T[] {
  return seats.map((seat) =>
    !seat.isHuman && seat.stack <= 0 ? { ...seat, stack: tableStack } : { ...seat },
  )
}

export function validCashSessionSetup(value: unknown, venueId: string): value is CashSessionSetup {
  if (!value || typeof value !== 'object') return false
  const setup = value as Partial<CashSessionSetup>
  return (
    setup.venueId === venueId &&
    Array.isArray(setup.characterIds) &&
    setup.characterIds.length === CASH_PRACTICE_AI_COUNT &&
    new Set(setup.characterIds).size === CASH_PRACTICE_AI_COUNT &&
    setup.characterIds.every((id) => typeof id === 'string' && characterById(id) !== undefined) &&
    Array.isArray(setup.levels) &&
    setup.levels.length === CASH_PRACTICE_AI_COUNT &&
    setup.levels.every((level) => Number.isInteger(level) && level >= 1 && level <= 5)
  )
}
