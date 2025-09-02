import { useRef, useCallback } from 'react';

type BeepOptions = {
  freq?: number;
  durationMs?: number;
  volume?: number; // 0..1
  type?: OscillatorType;
};

export function useSound() {
  const ctxRef = useRef<AudioContext | null>(null);

  const ensureContext = useCallback(async () => {
    if (!ctxRef.current) {
      const AC = (window as typeof window & { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      ctxRef.current = new AC();
    }
    if (ctxRef.current.state === 'suspended') {
      try { await ctxRef.current.resume(); } catch {
        // Ignore resume errors
      }
    }
    return ctxRef.current;
  }, []);

  const resume = useCallback(async () => {
    return ensureContext();
  }, [ensureContext]);

  const beep = useCallback(async (opts: BeepOptions = {}) => {
    const ctx = await ensureContext();
    if (!ctx) return;

    const { freq = 880, durationMs = 150, volume = 0.03, type = 'sine' } = opts;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.value = volume;
    osc.connect(gain).connect(ctx.destination);
    osc.start();

    // quick decay tail to avoid click
    const stopAt = ctx.currentTime + durationMs / 1000;
    try {
      gain.gain.setTargetAtTime(0.0001, stopAt - 0.1, 0.05);
    } catch {
      // Ignore setTargetAtTime errors
    }
    osc.stop(stopAt);
  }, [ensureContext]);

  return { beep, resume };
}

