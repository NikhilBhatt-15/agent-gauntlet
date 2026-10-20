import { useEffect, useRef, useState } from 'react';
import { rupees } from '../../../shared/format.ts';
import type { Message, PublicLevel } from '../../../shared/types.ts';
import { Fluent, Portrait } from './Art.tsx';
import { MOOD } from '../lib/ui.ts';

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
            <div key={i} className={`sys ${m.kind === 'weak' ? 'weak' : ''}`}>
              <Fluent name={m.kind === 'weak' ? 'collision' : m.kind === 'munim-check' ? 'receipt' : m.kind === 'patience' ? 'cup' : 'bulb'} size={m.kind === 'weak' ? 22 : 18} />{' '}
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
        const moodClass = !munim && m.mood && m.mood !== 'neutral' && i > 0 ? `mood-${m.mood}` : '';
        return (
          <div key={i} className={`row them ${munim ? 'munim' : ''}`}>
            <Portrait who={munim ? 'munim' : k.avatar} mood={m.mood ?? (munim ? 'angry' : 'neutral')} size={44} color={munim ? '#818cf8' : k.color} />
            <div className={`bubble ${moodClass} ${animate ? 'fresh' : ''}`}>
              {moodClass && m.mood && <Fluent name={MOOD[m.mood].icon} size={26} style={{ position: 'absolute', right: -10, top: -12 }} />}
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
          <Portrait who={k.avatar} mood="neutral" size={44} color={k.color} />
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
