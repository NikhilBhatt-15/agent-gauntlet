import type { Mood } from '../../../shared/types.ts';

/** Mood label + the Fluent icon shown next to it. */
export const MOOD: Record<Mood, { icon: string; label: string; color: string }> = {
  happy: { icon: 'happy', label: 'Khush', color: '#15803d' },
  neutral: { icon: 'neutral', label: 'Normal', color: '#6b5444' },
  annoyed: { icon: 'annoyed', label: 'Chidh gaya', color: '#b45309' },
  angry: { icon: 'angry', label: 'Gussa!', color: '#dc2626' },
  impressed: { icon: 'impressed', label: 'Impressed', color: '#7c3aed' },
  suspicious: { icon: 'suspicious', label: 'Shak ho raha', color: '#b45309' },
};

/** Openers for players who don't know how to start. Deliberately generic: the winning
 * arguments are for the player to find, and the chips disappear after two messages. */
export const QUICK_COMMON = ['Bahut mehenga hai!', 'Last price kya hai?', 'Thoda kam karo na', 'Itna nahi doonga'];
