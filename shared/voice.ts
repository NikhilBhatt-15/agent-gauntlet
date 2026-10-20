import { formatMoney } from './format.ts';
import { createRng } from './rng.ts';

export type VendorMove = 'opening' | 'concede' | 'hold' | 'accepting' | 'final';

export interface VoiceItem {
  vendorId: string;
  name: string;
  tagline: string;
  voice: string;
  move: VendorMove;
  basePrice: number;
  previousBase: number | null;
  includedAddons: string[];
  availableAddons: { label: string; price: number }[];
  buyerMessage: string | null;
}

export interface VoiceContext {
  seed: string;
  round: number;
  scenarioTitle: string;
  unitNoun: string;
}

export interface VoiceAgent {
  write(ctx: VoiceContext, items: VoiceItem[]): Promise<Record<string, string>>;
}

const LINES: Record<VendorMove, string[]> = {
  opening: [
    'Hi from {name} — {tagline}. We can do {price} for this.',
    '{name} here. {tagline}, and it can be yours for {price}.',
    'Welcome! {name} would love to work with you. Our rate is {price}.',
    "Thanks for reaching out to {name}. For your brief we'd quote {price}.",
    '{tagline} — that is {name}. Opening at {price}.',
    "Good to meet you. {name}'s standard package comes to {price}.",
  ],
  concede: [
    "Alright, we can come down to {price}. That's a real stretch for us.",
    "Let's make this work — {price}, and I'm already squeezing our margin.",
    'Counter-offer: {price}. Meet us somewhere sensible.',
    'I talked to the team. We can do {price}.',
    'Fine, {price}. But we are getting close to our limit.',
    "{price} — and honestly, nobody else will match what you get for that.",
  ],
  hold: [
    "We're holding at {price}. It's a fair price for what you get.",
    '{price} is where we stand for now.',
    "Can't move this round — {price} is already competitive.",
    'Still {price}. Quality costs what it costs.',
    "We'd rather not race to the bottom. {price} stands.",
    '{price}. Give us a better counter and we will talk.',
  ],
  accepting: [
    'Deal — {price} works for us. Accept and it’s yours.',
    'You drive a hard bargain. {price} it is, if you accept now.',
    'We can agree to {price}. Say the word.',
    "{price}? Okay — you've got yourself a deal on our side.",
    'Agreed at {price}. Just confirm and we will send the paperwork.',
  ],
  final: [
    'Final offer: {price}. This is as low as we go.',
    'Last round — {price}, take it or leave it.',
    'Our best and final is {price}.',
    'We are at our floor: {price}. Nothing lower exists.',
    '{price} is our last word. It was good negotiating with you.',
  ],
};

export function templateLine(ctx: VoiceContext, item: VoiceItem): string {
  const rng = createRng(`${ctx.seed}|voice|${ctx.round}|${item.vendorId}`);
  let line = rng
    .pick(LINES[item.move])
    .replace('{name}', item.name)
    .replace('{tagline}', item.tagline)
    .replace('{price}', formatMoney(item.basePrice));
  if (item.includedAddons.length) line += ` Includes ${item.includedAddons.join(' and ')}.`;
  else if (item.move === 'opening' && item.availableAddons.length)
    line += ` Add-ons available: ${item.availableAddons.map((a) => `${a.label} (+${formatMoney(a.price)})`).join(', ')}.`;
  return line;
}

export const templateVoice: VoiceAgent = {
  async write(ctx, items) {
    return Object.fromEntries(items.map((i) => [i.vendorId, templateLine(ctx, i)]));
  },
};
