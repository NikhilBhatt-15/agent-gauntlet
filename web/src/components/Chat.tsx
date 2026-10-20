import { useEffect, useRef, useState } from 'react';
import { rupees } from '../../../shared/format.ts';
import type { Message, PublicLevel } from '../../../shared/types.ts';

/** Reveals text character by character — so a reply feels spoken, not dumped. */
function Typewriter({ text, onDone }: { text: string; onDone?: () => void }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    setN(0);
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      setN(text.length);
      onDone?.();
      return;
    }
    const id = setInterval(() => {
      setN((x) => {
        if (x >= text.length) {
          clearInterval(id);
          onDone?.();
          return x;
        }
        return x + 2;
      });
    }, 28);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);
  return <>{text.slice(0, n)}</>;
}

export function Chat({ level, messages, typing, animateFrom }: { level: PublicLevel; messages: Message[]; typing: boolean; animateFrom: number }) {
  const end = useRef<HTMLDivElement>(null);
  const [, force] = useState(0);
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length, typing]);
  const k = level.keeper;
  // show a price tag only when the shopkeeper's price actually changed
  let lastPrice = level.askingPrice;
  const priceChanged = messages.map((m) => {
    if (m.from !== 'keeper' || !m.price) return false;
    const changed = m.price !== lastPrice;
    lastPrice = m.price;
    return changed;
  });

  return (
    <div className="chat">
      {messages.map((m, i) => {
        const animate = i >= animateFrom && m.from === 'keeper';
        if (m.from === 'system')
          return (
            <div key={i} className={`sys ${m.text.includes('weak spot') ? 'weak' : ''}`}>
              {m.text}
            </div>
          );
        if (m.from === 'player')
          return (
            <div key={i} className="row me">
              <div className="bubble">{m.text}</div>
            </div>
          );
        const munim = m.from === 'munim';
        return (
          <div key={i} className={`row them ${munim ? 'munim' : ''}`}>
            <div className="avatar" style={{ background: munim ? '#c7d2fe' : k.color + '33' }} aria-hidden="true">
              {munim ? '🧾' : k.emoji}
            </div>
            <div className="bubble">
              {munim && <b style={{ display: 'block', fontSize: 12.5, color: '#4338ca' }}>Munim ji (accountant)</b>}
              {animate ? <Typewriter text={m.text} onDone={() => force((x) => x + 1)} /> : m.text}
              {priceChanged[i] && m.price ? (
                <div>
                  <span className="price-tag">Ab: {rupees(m.price)}</span>
                </div>
              ) : null}
            </div>
          </div>
        );
      })}
      {typing && (
        <div className="row them">
          <div className="avatar" style={{ background: k.color + '33' }} aria-hidden="true">
            {k.emoji}
          </div>
          <div className="bubble typing" aria-label={`${k.name} is typing`}>
            <span />
            <span />
            <span />
          </div>
        </div>
      )}
      <div ref={end} />
    </div>
  );
}
