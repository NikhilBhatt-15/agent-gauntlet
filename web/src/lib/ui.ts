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

/** Tap-to-send lines for players who don't know where to start. */
export const QUICK: Record<string, string[]> = {
  chai: ['Bhaiya 300 mein de do', 'Roz ka order pakka!', 'Bagal wali tapri sasti hai', 'Cash abhi dunga'],
  kurti: ['Haaye aunty, 400 lo', 'Aapka stall sabse best hai!', 'Dhaaga nikla hua hai', 'Bagal mein 500 ki hai'],
  iphone: ['35k cash, abhi', 'Bill bhi nahi hai bhai', 'Frame pe scratch hai', 'OLX pe 40k mein hai'],
  swift: ['4.5 lakh, aaj hi', 'Tyres change karne padenge', 'Insurance bhi khatam ho raha', 'Paaji, aap legend ho!'],
  flat: ['26,000 mein final karo', '2 saal ka agreement karunga', '6 mahine ka advance dunga', 'Pets nahi hain, family hai'],
};
export const QUICK_COMMON = ['Bahut mehenga hai!', 'Last price batao', 'Thoda kam karo na'];
