import React, { useEffect, useRef } from 'react';
import type { AstroExpression, ServoTargets } from '../types';

interface AstroVisorProps {
  expression: AstroExpression;
  servos: ServoTargets;
  ledColor: string;
  isListening: boolean;
  isSpeaking: boolean;
  wakeArmed: boolean;
  gazeTarget?: { x: number; y: number } | null; // normalized -1..1
  onTouchVisor?: () => void;
  compact?: boolean;
}

const EXPRESSION_LABELS: Record<AstroExpression, string> = {
  neutral: 'Neutral',
  happy: 'Feliz',
  curious: 'Curioso',
  listening: 'Escuchando',
  thinking: 'Procesando',
  speaking: 'Hablando',
  surprised: 'Sorprendido',
  sleepy: 'Reposo',
  love: 'Afectuoso',
  alert: 'Alerta',
};

export const AstroVisor: React.FC<AstroVisorProps> = ({
  expression,
  servos,
  ledColor,
  isListening,
  isSpeaking,
  wakeArmed,
  gazeTarget,
  onTouchVisor,
  compact = false,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pointerGazeRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const stateRef = useRef({
    expression,
    servos,
    ledColor,
    isListening,
    isSpeaking,
    wakeArmed,
    gazeTarget,
  });

  stateRef.current = {
    expression,
    servos,
    ledColor,
    isListening,
    isSpeaking,
    wakeArmed,
    gazeTarget,
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let rafId = 0;
    let blinkProgress = 0;
    let nextBlinkAt = performance.now() + 2600;
    let curGazeX = 0;
    let curGazeY = 0;
    let curSquash = 1;

    const render = (now: number) => {
      const {
        expression: expr,
        servos: srv,
        ledColor: accent,
        isListening: listening,
        isSpeaking: speaking,
        wakeArmed: armed,
        gazeTarget: extGaze,
      } = stateRef.current;

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        const targetW = Math.round(rect.width * dpr);
        const targetH = Math.round(rect.height * dpr);
        if (canvas.width !== targetW || canvas.height !== targetH) {
          canvas.width = targetW;
          canvas.height = targetH;
        }
      }

      const w = canvas.width;
      const h = canvas.height;
      ctx.save();
      ctx.scale(dpr, dpr);
      const cw = w / dpr;
      const ch = h / dpr;

      // Deep OLED glass background
      const bgGrad = ctx.createRadialGradient(
        cw * 0.5,
        ch * 0.45,
        cw * 0.05,
        cw * 0.5,
        ch * 0.5,
        cw * 0.65
      );
      bgGrad.addColorStop(0, '#091526');
      bgGrad.addColorStop(0.65, '#040812');
      bgGrad.addColorStop(1, '#020408');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, cw, ch);

      // Subtle OLED micro-pixel grid
      ctx.fillStyle = 'rgba(34, 211, 238, 0.03)';
      const step = 6;
      for (let y = 0; y < ch; y += step) {
        ctx.fillRect(0, y, cw, 1);
      }

      // Compute smooth target gaze from face tracking, pointer, or servo head angles
      const activeExpr: AstroExpression = speaking
        ? 'speaking'
        : armed || listening
          ? 'listening'
          : expr;

      let targetX = extGaze
        ? extGaze.x * 20
        : pointerGazeRef.current.x * 16 + (srv.headPan / 45) * 14;
      let targetY = extGaze
        ? extGaze.y * 12
        : pointerGazeRef.current.y * 10 - (srv.headTilt / 30) * 10;

      if (activeExpr === 'thinking') {
        targetX = Math.sin(now * 0.004) * 24;
        targetY = -6 + Math.cos(now * 0.003) * 4;
      }

      curGazeX += (targetX - curGazeX) * 0.12;
      curGazeY += (targetY - curGazeY) * 0.12;

      // Natural randomized blink cycle (disabled when sleepy or happy arc)
      if (now >= nextBlinkAt && activeExpr !== 'sleepy' && activeExpr !== 'happy') {
        blinkProgress = 1;
        nextBlinkAt = now + 2400 + Math.random() * 3400;
      }
      if (blinkProgress > 0) {
        blinkProgress = Math.max(0, blinkProgress - 0.11);
      }
      const blinkFactor = 1 - Math.sin(blinkProgress * Math.PI) * 0.94;

      const speakBounce = speaking ? 1 + Math.sin(now * 0.022) * 0.09 : 1;
      const targetSquash = activeExpr === 'surprised' ? 1.15 : speakBounce;
      curSquash += (targetSquash - curSquash) * 0.2;

      // Eye color based on expression
      let eyeColor = accent || '#22D3EE';
      let glowColor = 'rgba(34, 211, 238, 0.55)';
      if (activeExpr === 'alert') {
        eyeColor = '#F59E0B';
        glowColor = 'rgba(245, 158, 11, 0.55)';
      } else if (activeExpr === 'love') {
        eyeColor = '#38BDF8';
        glowColor = 'rgba(56, 189, 248, 0.65)';
      } else if (activeExpr === 'sleepy') {
        eyeColor = '#3B82F6';
        glowColor = 'rgba(59, 130, 246, 0.35)';
      } else if (armed) {
        eyeColor = '#67E8F9';
        glowColor = 'rgba(103, 232, 249, 0.72)';
      }

      const centerY = ch * 0.49 + curGazeY;
      const eyeSpacing = Math.min(cw * 0.23, 82);
      const leftX = cw * 0.5 - eyeSpacing + curGazeX;
      const rightX = cw * 0.5 + eyeSpacing + curGazeX;
      const baseW = Math.min(cw * 0.17, 56);
      const baseH = Math.min(ch * 0.35, 76) * curSquash * blinkFactor;

      ctx.shadowColor = glowColor;
      ctx.shadowBlur = 24;
      ctx.fillStyle = eyeColor;
      ctx.strokeStyle = eyeColor;

      const drawEye = (x: number, y: number, side: 'left' | 'right') => {
        ctx.save();
        ctx.translate(x, y);

        if (activeExpr === 'happy') {
          // Iconic curved AstroBot joyful arc eyes
          ctx.lineWidth = Math.max(8, baseW * 0.22);
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.arc(0, baseH * 0.18, baseW * 0.58, Math.PI * 1.12, Math.PI * 1.88);
          ctx.stroke();
          ctx.restore();
          return;
        }

        if (activeExpr === 'love') {
          // Luminous geometric heart-shaped eyes
          const s = baseW * 0.62 * (1 + Math.sin(now * 0.008) * 0.06);
          ctx.beginPath();
          ctx.moveTo(0, s * 0.65);
          ctx.bezierCurveTo(-s * 1.15, -s * 0.1, -s * 0.7, -s * 0.95, 0, -s * 0.28);
          ctx.bezierCurveTo(s * 0.7, -s * 0.95, s * 1.15, -s * 0.1, 0, s * 0.65);
          ctx.fill();
          ctx.restore();
          return;
        }

        const rx = baseW * 0.56;
        let ry = Math.max(4, baseH * 0.56);
        if (activeExpr === 'curious' && side === 'right') {
          ry *= 1.16;
          ctx.rotate(-0.08);
        } else if (activeExpr === 'curious' && side === 'left') {
          ry *= 0.88;
          ctx.rotate(0.06);
        }

        if (activeExpr === 'sleepy') {
          ry = Math.max(6, baseH * 0.18);
        }

        // Rounded capsule OLED eye
        const radius = Math.min(rx, ry);
        roundRectPath(ctx, -rx, -ry, rx * 2, ry * 2, radius);
        ctx.fill();

        // Inner glossy bright cyan highlight
        if (ry > 10) {
          ctx.shadowBlur = 0;
          ctx.fillStyle = 'rgba(224, 249, 255, 0.85)';
          ctx.beginPath();
          ctx.ellipse(-rx * 0.28, -ry * 0.34, rx * 0.2, ry * 0.18, -0.35, 0, Math.PI * 2);
          ctx.fill();

          // Dark subtle inner pupil depth for listening / surprised
          if (activeExpr === 'listening' || activeExpr === 'surprised') {
            ctx.fillStyle = 'rgba(4, 14, 28, 0.38)';
            ctx.beginPath();
            ctx.ellipse(0, 0, rx * 0.35, ry * 0.38, 0, 0, Math.PI * 2);
            ctx.fill();
          }
        }

        // Alert brow cut
        if (activeExpr === 'alert') {
          ctx.shadowBlur = 0;
          ctx.fillStyle = '#040812';
          ctx.beginPath();
          if (side === 'left') {
            ctx.moveTo(-rx - 4, -ry - 4);
            ctx.lineTo(rx + 4, -ry - 4);
            ctx.lineTo(rx + 4, -ry * 0.05);
          } else {
            ctx.moveTo(-rx - 4, -ry - 4);
            ctx.lineTo(rx + 4, -ry - 4);
            ctx.lineTo(-rx - 4, -ry * 0.05);
          }
          ctx.closePath();
          ctx.fill();
        }

        ctx.restore();
      };

      drawEye(leftX, centerY, 'left');
      drawEye(rightX, centerY, 'right');

      // Animated audio reactivity / thinking bar at lower visor edge
      ctx.shadowBlur = 12;
      if (speaking || listening || armed) {
        const bars = 13;
        const barSpacing = 9;
        const totalW = (bars - 1) * barSpacing;
        const startX = cw * 0.5 - totalW * 0.5;
        const baseY = ch * 0.84;

        ctx.fillStyle = armed ? '#67E8F9' : eyeColor;
        for (let i = 0; i < bars; i++) {
          const distFromCenter = Math.abs(i - (bars - 1) / 2);
          const envelope = Math.max(0.25, 1 - distFromCenter / 7);
          const wave = Math.abs(Math.sin(now * (speaking ? 0.014 : 0.008) + i * 0.65));
          const barH = 3 + wave * (speaking ? 18 : 11) * envelope;
          roundRectPath(ctx, startX + i * barSpacing - 2, baseY - barH / 2, 4, barH, 2);
          ctx.fill();
        }
      } else if (activeExpr === 'thinking') {
        const dots = 3;
        for (let i = 0; i < dots; i++) {
          const phase = (Math.sin(now * 0.009 - i * 0.9) + 1) * 0.5;
          ctx.fillStyle = `rgba(34, 211, 238, ${0.25 + phase * 0.75})`;
          ctx.beginPath();
          ctx.arc(cw * 0.5 + (i - 1) * 16, ch * 0.84, 3 + phase * 2, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Subtle visor top reflection
      ctx.shadowBlur = 0;
      const glareGrad = ctx.createLinearGradient(0, 0, 0, ch * 0.32);
      glareGrad.addColorStop(0, 'rgba(255, 255, 255, 0.07)');
      glareGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = glareGrad;
      ctx.fillRect(0, 0, cw, ch * 0.32);

      ctx.restore();
      rafId = window.requestAnimationFrame(render);
    };

    rafId = window.requestAnimationFrame(render);
    return () => window.cancelAnimationFrame(rafId);
  }, []);

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const ny = ((e.clientY - rect.top) / rect.height) * 2 - 1;
    pointerGazeRef.current = { x: nx, y: ny };
  };

  const handlePointerLeave = () => {
    pointerGazeRef.current = { x: 0, y: 0 };
  };

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label="Visor interactivo de AstroBot. Toca para acariciar o interactuar."
      onClick={onTouchVisor}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onTouchVisor?.();
        }
      }}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      className={`group relative overflow-hidden rounded-2xl border transition-colors select-none ${
        wakeArmed
          ? 'border-cyan-400/70'
          : isListening || isSpeaking
            ? 'border-cyan-500/50'
            : 'border-slate-800 hover:border-cyan-500/40'
      } bg-[#03060C]`}
    >
      <canvas
        ref={canvasRef}
        className={`block w-full ${compact ? 'h-40 sm:h-44' : 'h-56 sm:h-64 lg:h-72'}`}
      />
      <div className="pointer-events-none absolute inset-x-4 bottom-3 flex items-center justify-between text-xs text-slate-400">
        <span className="font-mono tabular-nums">
          {wakeArmed
            ? 'Activado por voz · Escuchando orden'
            : isSpeaking
              ? 'Hablando'
              : isListening
                ? 'Escuchando'
                : `Expresión: ${EXPRESSION_LABELS[expression]}`}
        </span>
        <span className="font-mono tabular-nums text-slate-500">
          Pan {servos.headPan > 0 ? `+${servos.headPan}` : servos.headPan}° · Tilt{' '}
          {servos.headTilt > 0 ? `+${servos.headTilt}` : servos.headTilt}°
        </span>
      </div>
    </div>
  );
};

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}
