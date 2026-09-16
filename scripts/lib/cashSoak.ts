import { mulberry32 } from '@/lib/poker/cards'
import {
  applyAction,
  isHandComplete,
  legalActions,
  potSize,
  startHand,
  type Action,
  type HandState,
  type LegalActions,
} from '@/lib/poker/engine'
import { decideAction, type AiProfile } from '@/lib/poker/ai/policy'

export const CASH_SOAK_SEATS = 6
export const CASH_SOAK_BIG_BLIND = 2
export const CASH_SOAK_BUY_IN = CASH_SOAK_BIG_BLIND * 100
const HERO_ID = 'hero'
const MAX_ACTIONS_PER_HAND = 500

/** Fast enough for a long soak, while still exercising the production AI policy. */
export const CASH_SOAK_PROFILE: AiProfile = {
  tightness: 0.32,
  aggression: 0.5,
  bluff: 0.09,
  iterations: 40,
  skill: 0.75,
}

export interface CashSoakSeat {
  id: string
  name: string
  stack: number
}

export interface CashSoakStats {
  handsPlayed: number
  rebuys: number
  heroRebuys: number
  aiRebuys: number
  allIns: number
  unevenStackAllIns: number
  headsUpPots: number
  multiWayPots: number
  sidePots: number
  multipleSidePots: number
  splitPots: number
  maximumObservedPot: number
  actions: number
  folds: number
  checks: number
  calls: number
  bets: number
  raises: number
  voluntaryPreflopEntries: number
  playerHands: number
  showdowns: number
  invariantFailures: string[]
}

/**
 * Serializable at a hand boundary. RNG state is the seed + next hand number:
 * every hand owns a derived stream, so restoring never repeats or skips a deck.
 */
export interface CashSoakSnapshot {
  version: 1
  seed: number
  smallBlind: number
  bigBlind: number
  buyIn: number
  nextHand: number
  buttonIndex: number
  seats: CashSoakSeat[]
  totalRebuyAmount: number
  chipsRemoved: number
  stats: CashSoakStats
}

export interface CashSoakOptions {
  seed?: number
  smallBlind?: number
  bigBlind?: number
  buyIn?: number
}

export interface CashSoakRun {
  snapshot: CashSoakSnapshot
  lastHand: HandState | null
}

export function createCashSoakSession(options: CashSoakOptions = {}): CashSoakSnapshot {
  const bigBlind = options.bigBlind ?? CASH_SOAK_BIG_BLIND
  const buyIn = options.buyIn ?? bigBlind * 100
  const seats = Array.from({ length: CASH_SOAK_SEATS }, (_, i) => ({
    id: i === 0 ? HERO_ID : `ai${i}`,
    name: i === 0 ? 'Hero' : `AI ${i}`,
    stack: buyIn,
  }))
  return {
    version: 1,
    seed: options.seed ?? 1,
    smallBlind: options.smallBlind ?? Math.max(1, Math.floor(bigBlind / 2)),
    bigBlind,
    buyIn,
    nextHand: 0,
    buttonIndex: 0,
    seats,
    totalRebuyAmount: 0,
    // The current cash model never removes chips between hands. This field makes
    // that assumption explicit in the accounting equation and leaves the harness
    // ready for a future stand-up/top-up test without pretending rebuys conserve.
    chipsRemoved: 0,
    stats: emptyStats(),
  }
}

export function snapshotCashSoak(session: CashSoakSnapshot): CashSoakSnapshot {
  return JSON.parse(JSON.stringify(session)) as CashSoakSnapshot
}

export function resumeCashSoak(snapshot: CashSoakSnapshot): CashSoakSnapshot {
  const resumed = snapshotCashSoak(snapshot)
  assertSessionShape(resumed)
  assertAccounting(resumed)
  return resumed
}

/** Run `hands` more hands, mutating and returning the supplied session. */
export function runCashSoak(
  session: CashSoakSnapshot,
  hands: number,
  profile: AiProfile = CASH_SOAK_PROFILE,
): CashSoakRun {
  let lastHand: HandState | null = null
  for (let i = 0; i < hands; i++) {
    try {
      lastHand = playHand(session, profile)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      session.stats.invariantFailures.push(`hand ${session.nextHand}: ${message}`)
      break
    }
  }
  return { snapshot: session, lastHand }
}

function playHand(session: CashSoakSnapshot, profile: AiProfile): HandState {
  assertSessionShape(session)
  assertAccounting(session)

  const handNo = session.nextHand
  const expectedButton = handNo % CASH_SOAK_SEATS
  invariant(
    session.buttonIndex === expectedButton,
    `button ${session.buttonIndex}, expected ${expectedButton}`,
  )

  // A separate deterministic stream per hand makes a hand-boundary snapshot a
  // complete replay point. Deck draws and every AI roll consume this one stream.
  const rng = mulberry32(handSeed(session.seed, handNo))
  let hand = startHand({
    seats: session.seats,
    buttonIndex: session.buttonIndex,
    smallBlind: session.smallBlind,
    bigBlind: session.bigBlind,
    rng,
  })
  const chipsBefore = totalStacks(session.seats)
  let actions = 0
  let sawAllIn = false
  let sawUnevenAllIn = false
  const voluntaryPreflop = new Set<string>()

  while (!isHandComplete(hand)) {
    invariant(++actions <= MAX_ACTIONS_PER_HAND, 'hand did not terminate')
    const legal = legalActions(hand)
    invariant(legal !== null, 'unfinished hand has no legal actor')
    const before = hand
    const action = decideAction(hand, profile, rng)
    assertLegalAction(action, legal)
    const actor = hand.players[hand.toActIndex]
    invariant(actor !== undefined, 'legal action has no actor')
    recordAction(session.stats, action)
    if (
      hand.street === 'preflop' &&
      (action.type === 'call' || action.type === 'bet' || action.type === 'raise')
    ) {
      voluntaryPreflop.add(actor.id)
    }
    if (putsActorAllIn(actor.stack, action, legal)) sawAllIn = true
    hand = applyAction(hand, action)
    if (sawAllIn) {
      const committed = hand.players
        .filter((p) => p.committedThisHand > 0)
        .map((p) => p.committedThisHand)
      if (new Set(committed).size > 1) sawUnevenAllIn = true
    }
    invariant(potSize(hand) >= potSize(before), 'pot shrank before settlement')
  }

  assertCompletedHand(hand, chipsBefore)
  session.stats.actions += actions
  session.stats.voluntaryPreflopEntries += voluntaryPreflop.size
  session.stats.playerHands += CASH_SOAK_SEATS
  if (hand.result?.showdown) session.stats.showdowns++
  session.stats.handsPlayed++
  session.stats.maximumObservedPot = Math.max(session.stats.maximumObservedPot, potSize(hand))
  if (sawAllIn) session.stats.allIns++
  if (sawUnevenAllIn) session.stats.unevenStackAllIns++

  const contenders = hand.players.filter((p) => p.status !== 'folded' && p.status !== 'out').length
  if (contenders === 2) session.stats.headsUpPots++
  if (contenders > 2) session.stats.multiWayPots++
  if (hand.pots.length > 1) session.stats.sidePots++
  if (hand.pots.length > 2) session.stats.multipleSidePots++
  if (hand.result?.potsAwarded.some((pot) => pot.winners.length > 1)) session.stats.splitPots++

  for (const player of hand.players) {
    const seat = session.seats.find((candidate) => candidate.id === player.id)
    invariant(seat !== undefined, `missing seat ${player.id}`)
    seat.stack = player.stack
  }

  // Cash tables keep every chair. A busted player receives one fresh 100BB
  // stack; that amount is new table inventory and is tracked, not conserved away.
  for (const seat of session.seats) {
    if (seat.stack !== 0) continue
    seat.stack = session.buyIn
    session.totalRebuyAmount += session.buyIn
    session.stats.rebuys++
    if (seat.id === HERO_ID) session.stats.heroRebuys++
    else session.stats.aiRebuys++
  }

  session.nextHand++
  session.buttonIndex = (session.buttonIndex + 1) % CASH_SOAK_SEATS
  assertSessionShape(session)
  assertAccounting(session)
  invariant(
    session.buttonIndex === session.nextHand % CASH_SOAK_SEATS,
    'button did not rotate once',
  )
  return hand
}

function assertCompletedHand(hand: HandState, chipsBefore: number): void {
  invariant(isHandComplete(hand), 'hand is not complete')
  invariant(hand.toActIndex === -1, 'completed hand still has an actor')
  invariant(hand.result !== null, 'completed hand has no result')
  invariant(hand.players.length === CASH_SOAK_SEATS, 'completed hand lost a seat')
  invariant(
    totalStacks(hand.players) === chipsBefore,
    'engine did not conserve chips within the hand',
  )

  const committed = hand.players.reduce((sum, player) => sum + player.committedThisHand, 0)
  const pots = hand.pots.reduce((sum, pot) => sum + pot.amount, 0)
  const payouts = Object.values(hand.result.payouts).reduce((sum, payout) => sum + payout, 0)
  invariant(pots === committed, `pots ${pots} do not settle commitments ${committed}`)
  invariant(payouts === pots, `payouts ${payouts} do not settle pots ${pots}`)

  for (const player of hand.players) {
    assertFiniteNonNegative(player.stack, `${player.id} stack`)
    assertFiniteNonNegative(player.committedThisHand, `${player.id} committed`)
    invariant(player.status !== 'out', `${player.id} was unexpectedly out`)
    // An all-in winner can have chips again after payouts; the status records
    // how they entered showdown, not their post-settlement stack.
    invariant(player.status !== 'active' || player.stack > 0, `${player.id} active with no chips`)
  }
}

function assertSessionShape(session: CashSoakSnapshot): void {
  invariant(session.version === 1, `unsupported snapshot version ${session.version}`)
  invariant(session.seats.length === CASH_SOAK_SEATS, `seat count ${session.seats.length}`)
  invariant(session.buttonIndex >= 0 && session.buttonIndex < CASH_SOAK_SEATS, 'invalid button')
  invariant(session.smallBlind > 0 && session.bigBlind > session.smallBlind, 'invalid fixed blinds')
  invariant(session.buyIn === session.bigBlind * 100, 'buy-in is not 100BB')
  invariant(
    new Set(session.seats.map((seat) => seat.id)).size === CASH_SOAK_SEATS,
    'duplicate seat id',
  )
  for (const seat of session.seats) assertFiniteNonNegative(seat.stack, `${seat.id} stack`)
}

function assertAccounting(session: CashSoakSnapshot): void {
  const initial = session.buyIn * CASH_SOAK_SEATS
  const expected = initial + session.totalRebuyAmount - session.chipsRemoved
  const actual = totalStacks(session.seats)
  invariant(actual === expected, `cash accounting ${actual}, expected ${expected}`)
  invariant(
    session.totalRebuyAmount === session.stats.rebuys * session.buyIn,
    'rebuy amount does not match rebuy count',
  )
  invariant(
    session.stats.rebuys === session.stats.heroRebuys + session.stats.aiRebuys,
    'rebuy counts disagree',
  )
}

function assertLegalAction(action: Action, legal: LegalActions): void {
  if (action.type === 'fold') invariant(legal.canFold, 'AI folded illegally')
  else if (action.type === 'check') invariant(legal.canCheck, 'AI checked illegally')
  else if (action.type === 'call') invariant(legal.canCall, 'AI called illegally')
  else {
    invariant(action.type === 'bet' ? legal.canBet : legal.canRaise, `AI ${action.type} illegally`)
    invariant(Number.isFinite(action.amount), `${action.type} amount is not finite`)
    invariant(action.amount! >= legal.minRaiseTo, `${action.type} below minimum`)
    invariant(action.amount! <= legal.maxRaiseTo, `${action.type} above stack`)
  }
}

function putsActorAllIn(stack: number, action: Action, legal: LegalActions): boolean {
  if (action.type === 'call') return legal.callAmount === stack
  if (action.type === 'bet' || action.type === 'raise') return action.amount === legal.maxRaiseTo
  return false
}

function recordAction(stats: CashSoakStats, action: Action): void {
  if (action.type === 'fold') stats.folds++
  else if (action.type === 'check') stats.checks++
  else if (action.type === 'call') stats.calls++
  else if (action.type === 'bet') stats.bets++
  else stats.raises++
}

function handSeed(seed: number, handNo: number): number {
  let value = (seed ^ Math.imul(handNo + 1, 0x9e3779b1)) >>> 0
  value ^= value >>> 16
  value = Math.imul(value, 0x85ebca6b) >>> 0
  value ^= value >>> 13
  return value >>> 0
}

function totalStacks(seats: readonly { stack: number }[]): number {
  return seats.reduce((sum, seat) => sum + seat.stack, 0)
}

function assertFiniteNonNegative(value: number, label: string): void {
  invariant(Number.isFinite(value), `${label} is not finite`)
  invariant(value >= 0, `${label} is negative`)
}

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function emptyStats(): CashSoakStats {
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
