import { draftCast, profileFor, type Character } from '@/config/cast'
import type { Venue } from '@/config/venues'
import type { AiProfile } from '@/lib/poker/ai/policy'
import { profileForSkill, skillConfigForLevel, type AiSkillLevel } from '@/lib/poker/ai/skill'

export const CASH_AI_SEATS = 5
export const DEFAULT_CASH_SKILL_LEVELS: readonly AiSkillLevel[] = [2, 3, 3, 4, 3]
const CASH_SETUP_KEY = 'pip.cash-setup'

export interface CashAiSeatSetup {
  characterId: string
  level: AiSkillLevel
}

export interface CashGameSetup {
  venueId: string
  aiSeats: CashAiSeatSetup[]
}

export function createCashGameSetup(
  venue: Venue,
  cast = draftCast(venue, CASH_AI_SEATS),
): CashGameSetup {
  if (!venue.cash) throw new Error('AI level setup is only available for cash games')
  if (cast.length !== CASH_AI_SEATS) throw new Error('A cash training table needs five opponents')
  return {
    venueId: venue.id,
    aiSeats: cast.map((character, index) => ({
      characterId: character.id,
      level: DEFAULT_CASH_SKILL_LEVELS[index],
    })),
  }
}

/** Apply ability to a character's existing style without allowing either axis to replace the other. */
export function cashAiProfile(venue: Venue, character: Character, level: AiSkillLevel): AiProfile {
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

export function cashSkillLabel(level: AiSkillLevel): string {
  return `Lv${level} ${skillConfigForLevel(level).label}`
}

export function saveCashGameSetup(setup: CashGameSetup): void {
  try {
    sessionStorage.setItem(CASH_SETUP_KEY, JSON.stringify(setup))
  } catch {}
}

export function takeCashGameSetup(venueId: string): CashGameSetup | null {
  try {
    const raw = sessionStorage.getItem(CASH_SETUP_KEY)
    sessionStorage.removeItem(CASH_SETUP_KEY)
    if (!raw) return null
    const setup = JSON.parse(raw) as CashGameSetup
    if (
      setup.venueId !== venueId ||
      setup.aiSeats.length !== CASH_AI_SEATS ||
      setup.aiSeats.some((seat) => ![1, 2, 3, 4, 5].includes(seat.level))
    )
      return null
    return setup
  } catch {
    return null
  }
}
