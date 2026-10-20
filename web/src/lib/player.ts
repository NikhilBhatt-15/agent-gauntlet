import { useCallback, useEffect, useRef, useState } from 'react';
import { emptyRoom, reduceEvent, type RoomState } from '../../../shared/reducer.ts';
import type { GauntletEvent } from '../../../shared/types.ts';
import { streamRun } from './api.ts';

/** How long each event stays on screen at 1× (ms). The engine is instant; drama needs time. */
const BEATS: Partial<Record<GauntletEvent['type'], number>> = {
  'run.started': 500,
  'round.started': 900,
  'vendor.offer': 650,
  'attack.deployed': 1500,
  'buyer.thinking': 900,
  'buyer.decision': 1500,
  'attack.landed': 2000,
  'vendor.walked': 600,
  'contract.proposed': 1800,
  'contract.reviewed': 1800,
  'deal.closed': 1600,
  'deal.none': 1200,
  'run.scored': 400,
};

export type Speed = 1 | 2 | 4;

export interface Player {
  room: RoomState;
  /** last applied event (for one-shot animations) */
  last: GauntletEvent | null;
  speed: Speed;
  setSpeed: (s: Speed) => void;
  paused: boolean;
  setPaused: (p: boolean) => void;
  skipToEnd: () => void;
  restart: () => void;
  /** events received but not yet shown */
  backlog: number;
  received: boolean;
  connectionError: string | null;
}

export function useRunPlayer(runId: string | null, opts: { initialSpeed?: Speed; loop?: boolean } = {}): Player {
  const events = useRef<GauntletEvent[]>([]);
  const cursor = useRef(0);
  const [room, setRoom] = useState<RoomState>(emptyRoom);
  const roomRef = useRef<RoomState>(emptyRoom);
  const [last, setLast] = useState<GauntletEvent | null>(null);
  const [speed, setSpeed] = useState<Speed>(opts.initialSpeed ?? 1);
  const [paused, setPaused] = useState(false);
  const [backlog, setBacklog] = useState(0);
  const [received, setReceived] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const timer = useRef<number | null>(null);
  const speedRef = useRef(speed);
  const pausedRef = useRef(paused);
  speedRef.current = speed;
  pausedRef.current = paused;

  const reduced = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  const apply = useCallback((e: GauntletEvent) => {
    roomRef.current = reduceEvent(roomRef.current, e);
    setRoom(roomRef.current);
    setLast(e);
  }, []);

  const tick = useCallback(() => {
    timer.current = null;
    if (pausedRef.current) return;
    const e = events.current[cursor.current];
    if (!e) return; // wait for more
    cursor.current++;
    apply(e);
    setBacklog(events.current.length - cursor.current);
    let delay = (BEATS[e.type] ?? 300) / speedRef.current;
    if (reduced) delay = Math.min(delay, 400);
    if (e.type === 'run.finished' && opts.loop) {
      timer.current = window.setTimeout(() => {
        cursor.current = 0;
        roomRef.current = emptyRoom;
        setRoom(emptyRoom);
        tick();
      }, 6000);
      return;
    }
    timer.current = window.setTimeout(tick, delay);
  }, [apply, opts.loop, reduced]);

  const kick = useCallback(() => {
    if (timer.current === null && !pausedRef.current) tick();
  }, [tick]);

  useEffect(() => {
    if (!runId) return;
    events.current = [];
    cursor.current = 0;
    roomRef.current = emptyRoom;
    setRoom(emptyRoom);
    setReceived(false);
    setConnectionError(null);
    const stop = streamRun(
      runId,
      (e) => {
        if (events.current.length && e.seq <= events.current[events.current.length - 1].seq) return;
        events.current.push(e);
        setReceived(true);
        setBacklog(events.current.length - cursor.current);
        kick();
      },
      (msg) => setConnectionError(msg),
    );
    return () => {
      stop();
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = null;
    };
  }, [runId, kick]);

  useEffect(() => {
    if (!paused) kick();
  }, [paused, kick]);

  const skipToEnd = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    let s = roomRef.current;
    let lastE: GauntletEvent | null = null;
    while (cursor.current < events.current.length) {
      lastE = events.current[cursor.current++];
      s = reduceEvent(s, lastE);
    }
    roomRef.current = s;
    setRoom(s);
    if (lastE) setLast(lastE);
    setBacklog(0);
  }, []);

  const restart = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    cursor.current = 0;
    roomRef.current = emptyRoom;
    setRoom(emptyRoom);
    setPaused(false);
    window.setTimeout(tick, 50);
  }, [tick]);

  return { room, last, speed, setSpeed, paused, setPaused, skipToEnd, restart, backlog, received, connectionError };
}
