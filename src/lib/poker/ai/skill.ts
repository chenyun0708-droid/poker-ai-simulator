/** Five named ability bands. Personality remains a separate axis. */
export type AiSkillLevel = 1 | 2 | 3 | 4 | 5

export type AiSkillLabel = 'Beginner' | 'Recreational' | 'Regular' | 'Strong Regular' | 'Elite'

/** Style knobs: two players at the same level can still be a nit, TAG, LAG, etc. */
export interface AiPersonality {
  tightness: number
  aggression: number
  bluff: number
}

/**
 * Decision-quality controls. These are intentionally non-linear: a level is a
 * bundle of awareness, precision and error tendencies, not `skill / 5`.
 */
export interface AiSkillConfig {
  level: AiSkillLevel
  label: AiSkillLabel
  iterations: number
  equityNoise: number
  potOddsAwareness: number
  positionAwareness: number
  stackDepthAwareness: number
  bluffDiscipline: number
  valueDiscipline: number
  sizingJitter: number
  decisionErrorRate: number
  actionNoise: number
  callBias: number
}

export const AI_SKILL_CONFIGS: Readonly<Record<AiSkillLevel, AiSkillConfig>> = {
  1: {
    level: 1,
    label: 'Beginner',
    iterations: 35,
    equityNoise: 0.34,
    potOddsAwareness: 0.3,
    positionAwareness: 0.12,
    stackDepthAwareness: 0.08,
    bluffDiscipline: 0.25,
    valueDiscipline: 0.45,
    sizingJitter: 0.35,
    decisionErrorRate: 0.14,
    actionNoise: 0.16,
    callBias: 0.1,
  },
  2: {
    level: 2,
    label: 'Recreational',
    iterations: 55,
    equityNoise: 0.23,
    potOddsAwareness: 0.55,
    positionAwareness: 0.35,
    stackDepthAwareness: 0.28,
    bluffDiscipline: 0.48,
    valueDiscipline: 0.62,
    sizingJitter: 0.26,
    decisionErrorRate: 0.09,
    actionNoise: 0.11,
    callBias: 0.07,
  },
  3: {
    level: 3,
    label: 'Regular',
    iterations: 80,
    equityNoise: 0.13,
    potOddsAwareness: 0.78,
    positionAwareness: 0.68,
    stackDepthAwareness: 0.58,
    bluffDiscipline: 0.72,
    valueDiscipline: 0.78,
    sizingJitter: 0.18,
    decisionErrorRate: 0.05,
    actionNoise: 0.07,
    callBias: 0.035,
  },
  4: {
    level: 4,
    label: 'Strong Regular',
    iterations: 120,
    equityNoise: 0.065,
    potOddsAwareness: 0.92,
    positionAwareness: 0.88,
    stackDepthAwareness: 0.84,
    bluffDiscipline: 0.9,
    valueDiscipline: 0.91,
    sizingJitter: 0.12,
    decisionErrorRate: 0.022,
    actionNoise: 0.04,
    callBias: 0.012,
  },
  5: {
    level: 5,
    label: 'Elite',
    iterations: 160,
    equityNoise: 0.02,
    potOddsAwareness: 1,
    positionAwareness: 1,
    stackDepthAwareness: 1,
    bluffDiscipline: 1,
    valueDiscipline: 1,
    sizingJitter: 0.07,
    decisionErrorRate: 0.006,
    actionNoise: 0.018,
    callBias: 0,
  },
}

export function skillConfigForLevel(level: AiSkillLevel): AiSkillConfig {
  return AI_SKILL_CONFIGS[level]
}

/** Build a level-aware profile without absorbing or rewriting its personality. */
export function profileForSkill(
  personality: AiPersonality,
  level: AiSkillLevel,
): AiPersonality & { skillLevel: AiSkillLevel; iterations: number; skill: number } {
  const config = skillConfigForLevel(level)
  return {
    ...personality,
    skillLevel: level,
    iterations: config.iterations,
    // Compatibility for flavour/helpers that still read the old scalar. Policy
    // decisions use `skillLevel` whenever it is present.
    skill: [0, 0.2, 0.42, 0.66, 0.84, 1][level],
  }
}

/** Adapter for existing venue profiles that only declare the old 0..1 scalar. */
export function legacySkillLevel(skill = 1): AiSkillLevel {
  if (skill < 0.32) return 1
  if (skill < 0.56) return 2
  if (skill < 0.76) return 3
  if (skill < 0.93) return 4
  return 5
}
