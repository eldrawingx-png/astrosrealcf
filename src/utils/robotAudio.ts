import type { RobotSoundId } from '../types';

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  if (!audioCtx) {
    audioCtx = new Ctx();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

function scheduleTone(
  ctx: AudioContext,
  freqStart: number,
  freqEnd: number,
  startOffset: number,
  duration: number,
  type: OscillatorType = 'sine',
  gainPeak = 0.12
) {
  const now = ctx.currentTime + startOffset;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freqStart, now);
  osc.frequency.exponentialRampToValueAtTime(Math.max(40, freqEnd), now + duration);

  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.linearRampToValueAtTime(gainPeak, now + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + duration + 0.02);
}

export function playRobotSound(sound: RobotSoundId, enabled = true): void {
  if (!enabled || sound === 'none') return;
  const ctx = getAudioContext();
  if (!ctx) return;

  switch (sound) {
    case 'wake':
      // Iconic bright AstroBot two-step rising chime
      scheduleTone(ctx, 587.33, 880, 0, 0.11, 'sine', 0.14);
      scheduleTone(ctx, 880, 1318.5, 0.1, 0.16, 'triangle', 0.12);
      break;
    case 'confirm':
      scheduleTone(ctx, 660, 880, 0, 0.08, 'sine', 0.1);
      scheduleTone(ctx, 880, 990, 0.08, 0.09, 'sine', 0.08);
      break;
    case 'happy':
      scheduleTone(ctx, 523.25, 659.25, 0, 0.09, 'sine', 0.12);
      scheduleTone(ctx, 659.25, 783.99, 0.09, 0.09, 'sine', 0.12);
      scheduleTone(ctx, 783.99, 1046.5, 0.18, 0.16, 'triangle', 0.12);
      break;
    case 'curious':
      scheduleTone(ctx, 440, 740, 0, 0.18, 'sine', 0.11);
      scheduleTone(ctx, 720, 820, 0.17, 0.08, 'sine', 0.08);
      break;
    case 'alert':
      scheduleTone(ctx, 780, 520, 0, 0.12, 'sawtooth', 0.07);
      scheduleTone(ctx, 780, 520, 0.15, 0.14, 'sawtooth', 0.07);
      break;
    case 'sleep':
      scheduleTone(ctx, 520, 310, 0, 0.28, 'sine', 0.08);
      break;
  }
}
