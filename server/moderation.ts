/**
 * Light guard for text that appears on public pages (leaderboard names, Hall of Jugaad lines).
 * Not a full moderation system: it blocks the common abuse cases (links, contact details, spam,
 * obvious profanity) and the line is simply not published — the score still counts.
 */
const LINK = /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|in|net|org|io|xyz|ly|me|co)\b|@[a-z0-9_]{3,}|t\.me\/|wa\.me)/i;
const CONTACT = /(\+?\d[\d\s-]{8,}\d)|([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})/i;
const REPEAT = /(.)\1{7,}/;
// Common English and Hinglish profanity, matched on word starts after normalising.
const BAD = ['fuck', 'shit', 'bitch', 'cunt', 'dick', 'pussy', 'whore', 'slut', 'bastard', 'nigg', 'faggot', 'retard', 'madarchod', 'mc ', 'bhenchod', 'behenchod', 'bc ', 'chutiya', 'chutiye', 'gandu', 'randi', 'bhosdi', 'lavde', 'lauda', 'lodu', 'harami', 'kamina'];

function normalise(s: string): string {
  return (
    ' ' +
    s
      .toLowerCase()
      .replace(/[0@]/g, 'o')
      .replace(/[1!|]/g, 'i')
      .replace(/3/g, 'e')
      .replace(/[$5]/g, 's')
      .replace(/[^a-z ]/g, ' ')
      .replace(/\s+/g, ' ') +
    ' '
  );
}

export function isPublishable(text: string | null | undefined): boolean {
  if (!text) return false;
  if (LINK.test(text) || CONTACT.test(text) || REPEAT.test(text)) return false;
  const n = normalise(text);
  return !BAD.some((w) => n.includes(' ' + w));
}
