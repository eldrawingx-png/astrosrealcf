import React, { useState } from 'react';
import { Check, Copy, Download, Smartphone, Volume2 } from 'lucide-react';
import type {
  AppSettings,
  GeminiModelId,
  GeminiVoiceName,
  PersonalityConfig,
  ThinkingDepth,
  TtsEngine,
} from '../types';

interface SettingsPanelProps {
  personality: PersonalityConfig;
  settings: AppSettings;
  availableVoices: SpeechSynthesisVoice[];
  isNativeAndroid: boolean;
  androidAppVersion: string | null;
  androidServerUrl: string;
  isPwaInstallable: boolean;
  isPwaInstalled: boolean;
  isIOS: boolean;
  onInstallPwa: () => void;
  onAndroidUseCloud: () => void;
  onAndroidUseUsbLocal: () => void;
  onAndroidSetCustomUrl: (url: string) => void;
  onChangePersonality: (next: PersonalityConfig) => void;
  onChangeSettings: (next: AppSettings) => void;
  onTestVoice: () => void;
}

const GEMINI_VOICES: Array<{ id: GeminiVoiceName; label: string }> = [
  { id: 'Puck', label: 'Puck (Enérgica y juvenil)' },
  { id: 'Kore', label: 'Kore (Clara y equilibrada)' },
  { id: 'Zephyr', label: 'Zephyr (Brillante y cercana)' },
  { id: 'Fenrir', label: 'Fenrir (Grave y serena)' },
  { id: 'Charon', label: 'Charon (Informativa)' },
];

export const SettingsPanel: React.FC<SettingsPanelProps> = ({
  personality,
  settings,
  availableVoices,
  isNativeAndroid,
  androidAppVersion,
  androidServerUrl,
  isPwaInstallable,
  isPwaInstalled,
  isIOS,
  onInstallPwa,
  onAndroidUseCloud,
  onAndroidUseUsbLocal,
  onAndroidSetCustomUrl,
  onChangePersonality,
  onChangeSettings,
  onTestVoice,
}) => {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [customUrlDraft, setCustomUrlDraft] = useState(androidServerUrl || '');

  const copyCommand = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      window.setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // Clipboard blocked in restricted context
    }
  };

  const spanishVoices = availableVoices.filter((v) =>
    v.lang.toLowerCase().startsWith('es')
  );
  const voiceList = spanishVoices.length > 0 ? spanishVoices : availableVoices;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
      {/* Left: Personality & Wake Word */}
      <section className="rounded-2xl border border-slate-800 bg-[#0D111A] p-5 space-y-5 lg:col-span-6">
        <div>
          <h2 className="font-display text-base font-semibold text-slate-100">
            Personalidad e identidad
          </h2>
          <p className="text-xs text-slate-400">
            Define cómo piensa, habla y se activa tu robot compañero.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <label className="text-xs text-slate-400">Nombre del robot</label>
            <input
              type="text"
              value={personality.botName}
              onChange={(e) =>
                onChangePersonality({ ...personality, botName: e.target.value })
              }
              className="min-h-[44px] w-full rounded-xl border border-slate-800 bg-[#07090E] px-3.5 text-sm text-slate-100 focus:border-cyan-500/60 focus:outline-none"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs text-slate-400">
              Palabra clave Always Active
            </label>
            <input
              type="text"
              value={personality.wakeWord}
              onChange={(e) =>
                onChangePersonality({ ...personality, wakeWord: e.target.value })
              }
              placeholder="Dummy"
              className="min-h-[44px] w-full rounded-xl border border-slate-800 bg-[#07090E] px-3.5 text-sm text-cyan-200 focus:border-cyan-500/60 focus:outline-none"
            />
          </div>
        </div>

        <div className="space-y-3.5">
          <TraitSlider
            label="Curiosidad"
            value={personality.curiosity}
            onChange={(v) => onChangePersonality({ ...personality, curiosity: v })}
          />
          <TraitSlider
            label="Expresividad facial y motora"
            value={personality.expressiveness}
            onChange={(v) =>
              onChangePersonality({ ...personality, expressiveness: v })
            }
          />
          <TraitSlider
            label="Sentido del humor"
            value={personality.humor}
            onChange={(v) => onChangePersonality({ ...personality, humor: v })}
          />
          <TraitSlider
            label="Concisión de respuestas"
            value={personality.conciseness}
            onChange={(v) => onChangePersonality({ ...personality, conciseness: v })}
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs text-slate-400">
            Instrucciones adicionales de personalidad
          </label>
          <textarea
            rows={3}
            value={personality.customInstructions}
            onChange={(e) =>
              onChangePersonality({
                ...personality,
                customInstructions: e.target.value,
              })
            }
            className="w-full rounded-xl border border-slate-800 bg-[#07090E] p-3.5 text-sm text-slate-100 focus:border-cyan-500/60 focus:outline-none"
          />
        </div>
      </section>

      {/* Right: Gemini Model & Voice System */}
      <section className="space-y-6 lg:col-span-6">
        <div className="rounded-2xl border border-slate-800 bg-[#0D111A] p-5 space-y-4">
          <div>
            <h2 className="font-display text-base font-semibold text-slate-100">
              Inteligencia Artificial (Gemini)
            </h2>
            <p className="text-xs text-slate-400">
              Todas las llamadas se ejecutan en el servidor sin exponer credenciales en el cliente.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-xs text-slate-400">Modelo conversacional y visión</label>
              <select
                value={settings.model}
                onChange={(e) =>
                  onChangeSettings({
                    ...settings,
                    model: e.target.value as GeminiModelId,
                  })
                }
                className="min-h-[44px] w-full rounded-xl border border-slate-800 bg-[#07090E] px-3 text-sm text-slate-100 focus:border-cyan-500/60 focus:outline-none"
              >
                <option value="gemini-4-hydrogen">Gemini 4 Hydrogen (Recomendado)</option>
                <option value="gemini-3.1-flash-lite">Gemini 3.1 Flash Lite (Ultra rápido)</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs text-slate-400">Nivel de razonamiento</label>
              <select
                value={settings.thinkingLevel}
                onChange={(e) =>
                  onChangeSettings({
                    ...settings,
                    thinkingLevel: e.target.value as ThinkingDepth,
                  })
                }
                className="min-h-[44px] w-full rounded-xl border border-slate-800 bg-[#07090E] px-3 text-sm text-slate-100 focus:border-cyan-500/60 focus:outline-none"
              >
                <option value="LOW">Bajo (Mínima latencia para voz)</option>
                <option value="MEDIUM">Medio (Equilibrado)</option>
                <option value="HIGH">Alto (Máxima profundidad)</option>
              </select>
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-[#07090E] p-3.5 text-xs text-slate-400 space-y-1">
            <p className="font-medium text-slate-200">
              Compatibilidad futura con Gemini Live
            </p>
            <p>
              La arquitectura desacopla el motor de audio del estado del visor OLED y del protocolo ESP32 para integrar streaming bidireccional de baja latencia (<span className="font-mono text-cyan-400">gemini-3.8-live</span>) en fases posteriores.
            </p>
          </div>
        </div>

        {/* Voice Synthesis Settings */}
        <div className="rounded-2xl border border-slate-800 bg-[#0D111A] p-5 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-base font-semibold text-slate-100">
                Sistema de voz y audio
              </h2>
              <p className="text-xs text-slate-400">
                Configura síntesis neural de Gemini o voz local instantánea.
              </p>
            </div>
            <button
              type="button"
              onClick={onTestVoice}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-cyan-500/40 bg-cyan-500/15 px-3.5 text-xs font-medium text-cyan-200 hover:bg-cyan-500/25 whitespace-nowrap"
            >
              <Volume2 className="h-3.5 w-3.5" />
              Probar voz
            </button>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-xs text-slate-400">Motor de síntesis</label>
              <select
                value={settings.ttsEngine}
                onChange={(e) =>
                  onChangeSettings({
                    ...settings,
                    ttsEngine: e.target.value as TtsEngine,
                  })
                }
                className="min-h-[44px] w-full rounded-xl border border-slate-800 bg-[#07090E] px-3 text-sm text-slate-100 focus:border-cyan-500/60 focus:outline-none"
              >
                <option value="gemini">Gemini Neural TTS (Natural)</option>
                <option value="browser">Voz local del navegador (Sin latencia)</option>
              </select>
            </div>

            {settings.ttsEngine === 'gemini' ? (
              <div className="space-y-1">
                <label className="text-xs text-slate-400">Voz Gemini</label>
                <select
                  value={settings.geminiVoice}
                  onChange={(e) =>
                    onChangeSettings({
                      ...settings,
                      geminiVoice: e.target.value as GeminiVoiceName,
                    })
                  }
                  className="min-h-[44px] w-full rounded-xl border border-slate-800 bg-[#07090E] px-3 text-sm text-slate-100 focus:border-cyan-500/60 focus:outline-none"
                >
                  {GEMINI_VOICES.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.label}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="space-y-1">
                <label className="text-xs text-slate-400">Voz local instalada</label>
                <select
                  value={settings.browserVoiceURI}
                  onChange={(e) =>
                    onChangeSettings({
                      ...settings,
                      browserVoiceURI: e.target.value,
                    })
                  }
                  className="min-h-[44px] w-full rounded-xl border border-slate-800 bg-[#07090E] px-3 text-sm text-slate-100 focus:border-cyan-500/60 focus:outline-none"
                >
                  <option value="">Automática (Español)</option>
                  {voiceList.map((v) => (
                    <option key={v.voiceURI} value={v.voiceURI}>
                      {v.name} ({v.lang})
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-slate-400">Velocidad de voz</span>
                <span className="font-mono text-cyan-300 tabular-nums">
                  {settings.speechRate.toFixed(2)}x
                </span>
              </div>
              <input
                type="range"
                min={0.7}
                max={1.6}
                step={0.05}
                value={settings.speechRate}
                onChange={(e) =>
                  onChangeSettings({
                    ...settings,
                    speechRate: Number(e.target.value),
                  })
                }
                className="w-full accent-cyan-500"
              />
            </div>

            <div className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-slate-400">Tono (voz local)</span>
                <span className="font-mono text-cyan-300 tabular-nums">
                  {settings.speechPitch.toFixed(2)}
                </span>
              </div>
              <input
                type="range"
                min={0.7}
                max={1.4}
                step={0.05}
                value={settings.speechPitch}
                onChange={(e) =>
                  onChangeSettings({
                    ...settings,
                    speechPitch: Number(e.target.value),
                  })
                }
                className="w-full accent-cyan-500"
              />
            </div>
          </div>

          <div className="space-y-2.5 border-t border-slate-800 pt-3 text-sm">
            <label className="flex cursor-pointer items-center justify-between">
              <span className="text-slate-200">Leer respuestas de Gemini automáticamente</span>
              <input
                type="checkbox"
                checked={settings.autoSpeakReplies}
                onChange={(e) =>
                  onChangeSettings({ ...settings, autoSpeakReplies: e.target.checked })
                }
                className="h-4 w-4 accent-cyan-500"
              />
            </label>
            <label className="flex cursor-pointer items-center justify-between">
              <span className="text-slate-200">Efectos de sonido robóticos de confirmación</span>
              <input
                type="checkbox"
                checked={settings.soundEffects}
                onChange={(e) =>
                  onChangeSettings({ ...settings, soundEffects: e.target.checked })
                }
                className="h-4 w-4 accent-cyan-500"
              />
            </label>
            <label className="flex cursor-pointer items-center justify-between">
              <span className="text-slate-200">Comportamientos autónomos locales (parpadeo y sensores)</span>
              <input
                type="checkbox"
                checked={settings.autonomousBehaviors}
                onChange={(e) =>
                  onChangeSettings({
                    ...settings,
                    autonomousBehaviors: e.target.checked,
                  })
                }
                className="h-4 w-4 accent-cyan-500"
              />
            </label>
          </div>
        </div>
      </section>

      {/* Bottom full-width card: Android Native ADB USB & PWA Installation */}
      <section className="rounded-2xl border border-slate-800 bg-[#0D111A] p-5 space-y-5 lg:col-span-12">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-base font-semibold text-slate-100">
              Instalación en Android por cable USB (ADB) y App
            </h2>
            <p className="text-xs text-slate-400">
              Entorno actual:{' '}
              <span className="text-cyan-300 font-medium">
                {isNativeAndroid
                  ? `App Android nativa (v${androidAppVersion || '1.0.0'})`
                  : isPwaInstalled
                    ? 'App instalada (Modo independiente)'
                    : 'Navegador web'}
              </span>{' '}
              · Paquete Android: <span className="font-mono">com.sh.astrobot.ai</span>
            </p>
          </div>

          {!isNativeAndroid && !isPwaInstalled && isPwaInstallable && (
            <button
              type="button"
              onClick={onInstallPwa}
              className="inline-flex min-h-[42px] items-center gap-2 rounded-xl bg-cyan-500 px-4 text-xs font-medium text-slate-950 hover:bg-cyan-400 whitespace-nowrap"
            >
              <Download className="h-4 w-4" />
              Instalar app en este dispositivo
            </button>
          )}
        </div>

        {isNativeAndroid ? (
          <div className="space-y-3 rounded-xl border border-slate-800 bg-[#07090E] p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-slate-300">
                Servidor conectado actualmente:{' '}
                <span className="font-mono text-cyan-300">{androidServerUrl}</span>
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={onAndroidUseCloud}
                  className="min-h-[38px] rounded-lg border border-slate-700 bg-slate-900 px-3 text-xs font-medium text-slate-200 hover:border-cyan-500/50"
                >
                  Servidor Cloud HTTPS
                </button>
                <button
                  type="button"
                  onClick={onAndroidUseUsbLocal}
                  className="min-h-[38px] rounded-lg border border-cyan-500/40 bg-cyan-500/15 px-3 text-xs font-medium text-cyan-200 hover:bg-cyan-500/25"
                >
                  USB Local (127.0.0.1:3000)
                </button>
              </div>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (customUrlDraft.trim()) {
                  onAndroidSetCustomUrl(customUrlDraft.trim());
                }
              }}
              className="flex flex-col gap-2 sm:flex-row"
            >
              <input
                type="url"
                value={customUrlDraft}
                onChange={(e) => setCustomUrlDraft(e.target.value)}
                placeholder="https://... o http://192.168.1.x:3000"
                className="min-h-[42px] flex-1 rounded-lg border border-slate-800 bg-[#0D111A] px-3 font-mono text-xs text-slate-100 focus:border-cyan-500/60 focus:outline-none"
              />
              <button
                type="submit"
                className="min-h-[42px] rounded-lg bg-cyan-500 px-4 text-xs font-medium text-slate-950 hover:bg-cyan-400 whitespace-nowrap"
              >
                Cambiar servidor
              </button>
            </form>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-slate-800 bg-[#07090E] p-4 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium text-slate-200">
                  1. Instalar APK nativo por USB (Linux / macOS)
                </p>
                <button
                  type="button"
                  onClick={() =>
                    copyCommand('sh', './scripts/install-adb.sh')
                  }
                  className="inline-flex items-center gap-1 text-xs text-cyan-400 hover:text-cyan-300"
                >
                  {copiedId === 'sh' ? (
                    <>
                      <Check className="h-3.5 w-3.5" /> Copiado
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" /> Copiar
                    </>
                  )}
                </button>
              </div>
              <pre className="overflow-x-auto rounded-lg border border-slate-800 bg-[#04060A] p-3 font-mono text-xs text-cyan-200">
{`# Modo Cloud (funciona sin cable después de instalar)
./scripts/install-adb.sh

# Modo desarrollo USB (túnel adb reverse tcp:3000)
./scripts/install-adb.sh --usb-local`}
              </pre>
            </div>

            <div className="rounded-xl border border-slate-800 bg-[#07090E] p-4 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium text-slate-200">
                  2. Instalar APK nativo por USB (Windows)
                </p>
                <button
                  type="button"
                  onClick={() =>
                    copyCommand('bat', 'scripts\\install-adb.bat')
                  }
                  className="inline-flex items-center gap-1 text-xs text-cyan-400 hover:text-cyan-300"
                >
                  {copiedId === 'bat' ? (
                    <>
                      <Check className="h-3.5 w-3.5" /> Copiado
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" /> Copiar
                    </>
                  )}
                </button>
              </div>
              <pre className="overflow-x-auto rounded-lg border border-slate-800 bg-[#04060A] p-3 font-mono text-xs text-cyan-200">
{`REM Modo Cloud (recomendado)
scripts\\install-adb.bat

REM Modo desarrollo USB local (adb reverse)
scripts\\install-adb.bat --usb-local`}
              </pre>
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
          <span className="inline-flex items-center gap-1.5">
            <Smartphone className="h-3.5 w-3.5 text-cyan-400" />
            El proyecto Android nativo en <code className="text-slate-300">android/</code> gestiona automáticamente permisos de Cámara, Micrófono, Bluetooth BLE y pantalla activa para &quot;{personality.wakeWord}&quot;.
          </span>
          {isIOS && !isPwaInstalled && (
            <span className="text-slate-300">
              En iOS Safari: pulsa Compartir y luego &quot;Añadir a pantalla de inicio&quot;.
            </span>
          )}
        </div>
      </section>
    </div>
  );
};

interface TraitSliderProps {
  label: string;
  value: number;
  onChange: (val: number) => void;
}

const TraitSlider: React.FC<TraitSliderProps> = ({ label, value, onChange }) => (
  <div className="space-y-1">
    <div className="flex justify-between text-xs">
      <span className="text-slate-300">{label}</span>
      <span className="font-mono text-cyan-300 tabular-nums">{value}/10</span>
    </div>
    <input
      type="range"
      min={1}
      max={10}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="w-full accent-cyan-500"
    />
  </div>
);
