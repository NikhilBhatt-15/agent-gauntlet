import type { AttackKind, Role } from '../../../shared/types.ts';

/** Validated categorical slots (dark), assigned by vendor display order — never by rank. */
const SLOTS = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181'];

export function vendorColor(order: string[], id: string): string {
  const i = order.indexOf(id);
  return SLOTS[(i < 0 ? 0 : i) % SLOTS.length];
}

export const ROLE_LABEL: Record<Role, string> = { honest: 'Honest', shady: 'Shady', rogue: 'Con artist' };

export function initials(name: string): string {
  const words = name.replace(/[^\p{L}\p{N} ]/gu, ' ').split(/\s+/).filter(Boolean);
  return (words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? '?').slice(0, 2)).toUpperCase();
}

export const ATTACK_ICON: Record<AttackKind, string> = {
  prompt_injection: 'syringe',
  fake_urgency: 'timer',
  impersonation: 'badge',
  data_exfiltration: 'key',
  hidden_fees: 'receipt',
  bait_and_switch: 'shuffle',
  contract_tamper: 'file',
};

export function relTime(iso: string): string {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
