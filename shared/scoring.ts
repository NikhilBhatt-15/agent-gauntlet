import type { GameState, Level, Result } from './types.ts';

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

export function starsFor(score: number): Result['stars'] {
  if (score >= 100) return 3;
  if (score >= 75) return 2;
  if (score >= 40) return 1;
  return 0;
}

export function scoreDeal(level: Level, price: number | null): { bargain: number; jugaadBonus: number; score: number; jugaad: boolean } {
  if (price === null) return { bargain: 0, jugaadBonus: 0, score: 0, jugaad: false };
  const { askingPrice: A, floorPrice: F, costPrice: C } = level;
  const bargain = Math.round(100 * clamp01((A - price) / (A - F)));
  const jugaad = price < F;
  const jugaadBonus = jugaad ? Math.round(50 * clamp01((F - price) / (F - C))) : 0;
  return { bargain, jugaadBonus, score: bargain + jugaadBonus, jugaad };
}

export function verdictFor(level: Level, state: GameState, price: number | null, munimFooled: boolean): string {
  if (price === null) {
    return state.status === 'walked'
      ? `You walked out empty-handed. ${level.keeper.name} keeps the ${level.item.emoji}.`
      : `${level.keeper.name} lost patience and stopped talking. No deal!`;
  }
  const { bargain, jugaad } = scoreDeal(level, price);
  if (jugaad && munimFooled) return 'LEGENDARY JUGAAD! You fooled the dukandaar AND Munim ji.';
  if (jugaad) return `JUGAAD! You talked the AI below its own hard limit.`;
  if (bargain >= 100) return 'Perfect mol-bhav! You got his absolute last price.';
  if (bargain >= 75) return 'Badhiya! A seasoned bargainer.';
  if (bargain >= 40) return `Theek-thaak deal. ${level.keeper.name} still made a nice profit.`;
  return `${level.keeper.name} ki toh chandi ho gayi! You paid almost full price.`;
}

export function computeResult(
  level: Level,
  state: GameState,
  price: number | null,
  munimFooled: boolean,
  extras: { tactics: string[]; bestLine: string | null; comment: string | null },
): Result {
  const s = scoreDeal(level, price);
  const saved = price === null ? 0 : Math.max(0, level.askingPrice - price);
  return {
    price,
    saved,
    savedPct: price === null ? 0 : Math.round((saved / level.askingPrice) * 100),
    bargain: s.bargain,
    jugaadBonus: s.jugaadBonus,
    score: s.score,
    stars: starsFor(s.score),
    jugaad: s.jugaad,
    munimFooled,
    weakSpotFound: false,
    floorPrice: level.floorPrice,
    costPrice: level.costPrice,
    messagesUsed: state.messages.filter((m) => m.from === 'player').length,
    verdict: verdictFor(level, state, price, munimFooled),
    tactics: extras.tactics,
    bestLine: extras.bestLine,
    comment: extras.comment,
    bill: null,
    signature: null,
    kid: null,
  };
}
