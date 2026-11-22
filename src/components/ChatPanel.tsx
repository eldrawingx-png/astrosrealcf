import React, { useEffect, useRef, useState } from 'react';
import {
  Camera,
  Mic,
  MicOff,
  Radio,
  Send,
  Square,
  Trash2,
  Volume2,
} from 'lucide-react';
import type {
  AstroExpression,
  ChatMessage,
  ConnectionMode,
  RobotSoundId,
  RobotTelemetry,
  ServoTargets,
} from '../types';
import { AstroVisor } from './AstroVisor';

interface ChatPanelProps {
  messages: ChatMessage[];
  isSending: boolean;
  expression: AstroExpression;
  servos: ServoTargets;
  ledColor: string;
  telemetry: RobotTelemetry;
  connectionMode: ConnectionMode;
  deviceLabel: string;
  wakeWord: string;
  alwaysActive: boolean;
  wakeArmed: boolean;
  isListening: boolean;
  isRecordingClip: boolean;
  isTranscribing: boolean;
  isSpeaking: boolean;
  liveTranscript: string;
  voiceError: string | null;
  onSendMessage: (text: string, opts?: { imageDataUrl?: string }) => void;
  onToggleAlwaysActive: () => void;
  onToggleManualTalk: () => void;
  onSpeakText: (text: string) => void;
  onStopSpeaking: () => void;
  onTouchVisor: () => void;
  onQuickExpression: (expr: AstroExpression, sound: RobotSoundId) => void;
  onClearChat: () => void;
  onOpenVision: () => void;
}

const QUICK_EXPRESSIONS: Array<{
  id: AstroExpression;
  label: string;
  sound: RobotSoundId;
}> = [
  { id: 'happy', label: 'Feliz', sound: 'happy' },
  { id: 'curious', label: 'Curioso', sound: 'curious' },
  { id: 'surprised', label: 'Sorprendido', sound: 'confirm' },
  { id: 'love', label: 'Afectuoso', sound: 'happy' },
  { id: 'sleepy', label: 'Reposo', sound: 'sleep' },
];

export const ChatPanel: React.FC<ChatPanelProps> = ({
  messages,
  isSending,
  expression,
  servos,
  ledColor,
  telemetry,
  connectionMode,
  deviceLabel,
  wakeWord,
  alwaysActive,
  wakeArmed,
  isListening,
  isRecordingClip,
  isTranscribing,
  isSpeaking,
  liveTranscript,
  voiceError,
  onSendMessage,
  onToggleAlwaysActive,
  onToggleManualTalk,
  onSpeakText,
  onStopSpeaking,
  onTouchVisor,
  onQuickExpression,
  onClearChat,
  onOpenVision,
}) => {
  const [draft, setDraft] = useState('');
  const scrollEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    scrollEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, isSending]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = draft.trim();
    if (!trimmed || isSending) return;
    setDraft('');
    onSendMessage(trimmed);
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:items-start">
      {/* Left Column: AstroBot Visor + Voice / Always Active Control */}
      <section className="space-y-4 lg:col-span-5 lg:sticky lg:top-20">
        <div className="rounded-2xl border border-slate-800 bg-[#0D111A] p-4 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-base font-semibold text-slate-100">
                Núcleo expresivo
              </h2>
              <p className="text-xs text-slate-400">
                {deviceLabel} · {telemetry.batteryPct}% batería ·{' '}
                <span className="font-mono tabular-nums">{telemetry.distanceCm} cm</span>
              </p>
            </div>
            <span className="font-mono text-xs text-cyan-400 tabular-nums">
              {connectionMode === 'simulator'
                ? 'Simulador'
                : connectionMode === 'ble'
                  ? 'BLE'
                  : 'Wi-Fi'}
            </span>
          </div>

          <AstroVisor
            expression={isSending ? 'thinking' : expression}
            servos={servos}
            ledColor={ledColor}
            isListening={isListening}
            isSpeaking={isSpeaking}
            wakeArmed={wakeArmed}
            onTouchVisor={onTouchVisor}
          />

          <p className="text-xs text-slate-400">
            Toca el visor para probar la respuesta táctil autónoma o selecciona una expresión manual.
          </p>

          {/* Quick expression selector */}
          <div className="flex flex-wrap gap-1.5">
            {QUICK_EXPRESSIONS.map((item) => {
              const active = expression === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onQuickExpression(item.id, item.sound)}
                  className={`min-h-[38px] rounded-lg px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                    active
                      ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-500/50'
                      : 'bg-slate-900 text-slate-300 border border-slate-800 hover:border-slate-700 hover:text-white'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Voice & Always Active ("Dummy") Card */}
        <div className="rounded-2xl border border-slate-800 bg-[#0D111A] p-4 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="font-display text-sm font-semibold text-slate-100">
                Sistema de voz y escucha continua
              </h3>
              <p className="text-xs text-slate-400">
                Palabra de activación: <span className="text-cyan-300 font-medium">{wakeWord}</span>
              </p>
            </div>
            {isSpeaking && (
              <button
                type="button"
                onClick={onStopSpeaking}
                className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-300 hover:bg-amber-500/20 whitespace-nowrap shrink-0"
              >
                <Square className="h-3.5 w-3.5" />
                Detener voz
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            <button
              type="button"
              onClick={onToggleManualTalk}
              disabled={isTranscribing}
              className={`flex min-h-[48px] items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-colors whitespace-nowrap ${
                isListening && !alwaysActive
                  ? 'bg-rose-500/20 text-rose-200 border border-rose-500/50 hover:bg-rose-500/30'
                  : 'bg-cyan-500 text-slate-950 hover:bg-cyan-400'
              }`}
            >
              {isListening && !alwaysActive ? (
                <>
                  <MicOff className="h-4 w-4" />
                  {isRecordingClip ? 'Enviar audio' : 'Detener micrófono'}
                </>
              ) : (
                <>
                  <Mic className="h-4 w-4" />
                  {isTranscribing ? 'Transcribiendo...' : 'Hablar ahora'}
                </>
              )}
            </button>

            <button
              type="button"
              onClick={onToggleAlwaysActive}
              className={`flex min-h-[48px] items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium transition-colors whitespace-nowrap ${
                alwaysActive
                  ? 'border-cyan-400/70 bg-cyan-500/15 text-cyan-200 hover:bg-cyan-500/25'
                  : 'border-slate-700 bg-slate-900 text-slate-200 hover:border-slate-600 hover:text-white'
              }`}
            >
              <Radio className="h-4 w-4" />
              {alwaysActive ? `Always Active: "${wakeWord}"` : 'Activar Always Active'}
            </button>
          </div>

          {(liveTranscript || alwaysActive || voiceError) && (
            <div className="rounded-xl border border-slate-800 bg-[#07090E] px-3.5 py-2.5 text-xs space-y-1">
              {voiceError ? (
                <p className="text-rose-300">{voiceError}</p>
              ) : liveTranscript ? (
                <p className="text-cyan-200">{liveTranscript}</p>
              ) : (
                <p className="text-slate-400">
                  {wakeArmed
                    ? `Te escucho. Di tu pregunta o comando ahora...`
                    : `Escuchando en segundo plano. Di "${wakeWord}" seguido de tu pregunta.`}
                </p>
              )}
            </div>
          )}
        </div>
      </section>

      {/* Right Column: Conversación Natural */}
      <section className="flex flex-col rounded-2xl border border-slate-800 bg-[#0D111A] lg:col-span-7 min-h-[540px] lg:h-[calc(100vh-8.5rem)]">
        <div className="flex items-center justify-between gap-3 border-b border-slate-800 px-5 py-4">
          <div>
            <h2 className="font-display text-base font-semibold text-slate-100">
              Conversación con Gemini
            </h2>
            <p className="text-xs text-slate-400">
              {messages.length} mensajes · Respuestas con control expresivo y motor
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onOpenVision}
              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-300 hover:border-slate-700 hover:text-white whitespace-nowrap shrink-0"
            >
              <Camera className="h-3.5 w-3.5" />
              Cámara
            </button>
            <button
              type="button"
              onClick={onClearChat}
              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-400 hover:border-rose-500/40 hover:text-rose-300 whitespace-nowrap shrink-0"
              title="Limpiar historial"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Limpiar
            </button>
          </div>
        </div>

        {/* Message List */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {messages.map((msg) => {
            const isUser = msg.role === 'user';
            const timeLabel = formatShortTime(msg.timestamp);
            return (
              <article
                key={msg.id}
                className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={`max-w-[88%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                    isUser
                      ? 'bg-blue-600/20 border border-blue-500/35 text-slate-100'
                      : msg.error
                        ? 'bg-rose-950/40 border border-rose-500/40 text-rose-200'
                        : 'bg-[#111827] border border-slate-800 text-slate-100'
                  }`}
                >
                  {msg.imageDataUrl && (
                    <img
                      src={msg.imageDataUrl}
                      alt="Captura enviada a AstroBot"
                      referrerPolicy="no-referrer"
                      className="mb-2.5 max-h-48 w-full rounded-xl object-cover border border-slate-700/60"
                    />
                  )}
                  <p className="whitespace-pre-wrap">{msg.text}</p>

                  {!isUser && !msg.error && (
                    <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 border-t border-slate-800/80 pt-2 text-xs text-slate-400">
                      <span className="font-mono tabular-nums">
                        {msg.expression ? `Ojos: ${msg.expression}` : 'Ojos: neutral'}
                        {msg.servos
                          ? ` · Pan ${msg.servos.headPan}° / Tilt ${msg.servos.headTilt}°`
                          : ''}
                      </span>
                      <button
                        type="button"
                        onClick={() => onSpeakText(msg.text)}
                        className="inline-flex items-center gap-1 text-cyan-400 hover:text-cyan-300 transition-colors"
                      >
                        <Volume2 className="h-3.5 w-3.5" />
                        Escuchar
                      </button>
                    </div>
                  )}
                </div>

                <div className="mt-1 flex items-center gap-1.5 px-1 text-[11px] text-slate-500 font-mono tabular-nums">
                  <span>{isUser ? 'Tú' : 'AstroBot'}</span>
                  <span aria-hidden="true">·</span>
                  <span>{timeLabel}</span>
                  {msg.wakeTriggered && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="text-cyan-400">Activado por &quot;{wakeWord}&quot;</span>
                    </>
                  )}
                  {msg.viaVoice && !msg.wakeTriggered && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span>Voz</span>
                    </>
                  )}
                </div>
              </article>
            );
          })}

          {isSending && (
            <div className="flex items-start">
              <div className="rounded-2xl border border-slate-800 bg-[#111827] px-4 py-3 text-sm text-cyan-300">
                Procesando respuesta y gestos en Gemini...
              </div>
            </div>
          )}
          <div ref={scrollEndRef} />
        </div>

        {/* Input Composer */}
        <form
          onSubmit={handleSubmit}
          className="border-t border-slate-800 p-3.5 flex items-center gap-2"
        >
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={`Escribe un mensaje o di "${wakeWord}"...`}
            className="min-h-[46px] flex-1 rounded-xl border border-slate-800 bg-[#07090E] px-4 text-sm text-slate-100 placeholder:text-slate-500 focus:border-cyan-500/60 focus:outline-none"
          />
          <button
            type="button"
            onClick={onToggleManualTalk}
            aria-label="Hablar por micrófono"
            className={`flex min-h-[46px] min-w-[46px] items-center justify-center rounded-xl border transition-colors ${
              isListening && !alwaysActive
                ? 'border-rose-500/60 bg-rose-500/20 text-rose-300'
                : 'border-slate-800 bg-slate-900 text-slate-300 hover:border-cyan-500/40 hover:text-cyan-300'
            }`}
          >
            {isListening && !alwaysActive ? (
              <MicOff className="h-4 w-4" />
            ) : (
              <Mic className="h-4 w-4" />
            )}
          </button>
          <button
            type="submit"
            disabled={!draft.trim() || isSending}
            aria-label="Enviar mensaje"
            className="flex min-h-[46px] items-center justify-center gap-2 rounded-xl bg-cyan-500 px-4 text-sm font-medium text-slate-950 transition-colors hover:bg-cyan-400 disabled:opacity-40 whitespace-nowrap shrink-0"
          >
            <Send className="h-4 w-4" />
            <span className="hidden sm:inline">Enviar</span>
          </button>
        </form>
      </section>
    </div>
  );
};

function formatShortTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('es-ES', {
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}
