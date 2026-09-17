'use client'

import { PlayerAvatar } from '@/components/PlayerAvatar'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { Venue } from '@/config/venues'
import { resolveCashOpponents, skillLevelLabel, type CashSessionSetup } from '@/lib/cashSetup'
import { styleFor } from '@/config/opponents'
import type { AiSkillLevel } from '@/lib/poker/ai/skill'

const LEVELS = [1, 2, 3, 4, 5] as const

export function CashGameSetupDialog({
  venue,
  setup,
  onSetupChange,
  onOpenChange,
  onStart,
}: {
  venue: Venue | null
  setup: CashSessionSetup | null
  onSetupChange: (setup: CashSessionSetup) => void
  onOpenChange: (open: boolean) => void
  onStart: (venue: Venue, setup: CashSessionSetup) => void
}) {
  if (!venue || !setup) return <Dialog open={false} onOpenChange={onOpenChange} />
  const opponents = resolveCashOpponents(venue, setup)

  const setLevel = (index: number, level: AiSkillLevel) => {
    const levels = setup.levels.slice()
    levels[index] = level
    onSetupChange({ ...setup, levels })
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-md">
        <DialogHeader className="border-b border-foreground/[0.08] p-4 pr-12">
          <DialogTitle>Choose your opponents</DialogTitle>
          <DialogDescription>
            Six-max cash · 100bb · fixed blinds. Levels lock when you sit down.
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-col gap-2 overflow-y-auto p-4">
          {opponents.map(({ character, ai, level }, index) => (
            <div
              key={character.id}
              className="flex items-center gap-3 rounded-xl border border-foreground/[0.08] bg-foreground/[0.025] p-3"
            >
              <PlayerAvatar spec={character.avatar} size={40} className="shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{character.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  Seat {index + 1} · {styleFor(ai)}
                </p>
              </div>
              <label className="sr-only" htmlFor={`cash-skill-${index}`}>
                {character.name} skill level
              </label>
              <select
                id={`cash-skill-${index}`}
                value={level}
                onChange={(event) => setLevel(index, Number(event.target.value) as AiSkillLevel)}
                className="max-w-44 rounded-lg border border-foreground/10 bg-background px-2.5 py-2 text-sm font-medium text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {LEVELS.map((option) => (
                  <option key={option} value={option}>
                    {skillLevelLabel(option)}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>

        <div className="border-t border-foreground/[0.08] p-4">
          <button
            onClick={() => onStart(venue, setup)}
            className="w-full rounded-2xl bg-primary px-6 py-3 font-semibold text-primary-foreground transition hover:bg-primary/90 active:scale-[0.98]"
          >
            Sit down — 5 opponents
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
