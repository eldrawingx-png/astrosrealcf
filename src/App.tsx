import React, { useCallback, useEffect, useState } from 'react';
import {
  Brain,
  Camera,
  Cpu,
  MessageSquare,
  Sliders,
} from 'lucide-react';
import { ChatPanel } from './components/ChatPanel';
import { HardwarePanel } from './components/HardwarePanel';
import { MemoryPanel } from './components/MemoryPanel';
import { SettingsPanel } from './components/SettingsPanel';
import { VisionPanel } from './components/VisionPanel';
import { useAndroidBridge } from './hooks/useAndroidBridge';
import { usePWAInstall } from './hooks/usePWAInstall';
import { useRobotHardware } from './hooks/useRobotHardware';
import { useVoiceSystem } from './hooks/useVoiceSystem';
import type {
  AppSettings,
  AstroExpression,
  ChatMessage,
  KnownFace,
  MemoryCategory,
  MemoryItem,
  NavTab,
  PersonalityConfig,
  RecognizedFace,
  RobotSoundId,
  ServoTargets,
} from './types';
import { DEFAULT_CHAT, storage } from './utils/storage';

const NAV_ITEMS: Array<{ id: NavTab; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: 'chat', label: 'Conversación', icon: MessageSquare },
  { id: 'vision', label: 'Visión', icon: Camera },
  { id: 'hardware', label: 'Hardware', icon: Cpu },
  { id: 'memory', label: 'Memoria', icon: Brain },
  { id: 'settings', label: 'Ajustes', icon: Sliders },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<NavTab>('chat');
  const [messages, setMessages] = useState<ChatMessage[]>(() => storage.loadChat());
  const [memories, setMemories] = useState<MemoryItem[]>(() => storage.loadMemories());
  const [knownFaces, setKnownFaces] = useState<KnownFace[]>(() => storage.loadFaces());
  const [personality, setPersonality] = useState<PersonalityConfig>(() =>
    storage.loadPersonality()
  );
  const [settings, setSettings] = useState<AppSettings>(() => storage.loadSettings());
  const [isSending, setIsSending] = useState(false);
  const [faceGaze, setFaceGaze] = useState<{ x: number; y: number } | null>(null);

  const androidBridge = useAndroidBridge();
  const pwa = usePWAInstall();

  // Persist user data automatically
  useEffect(() => storage.saveChat(messages), [messages]);
  useEffect(() => storage.saveMemories(memories), [memories]);
  useEffect(() => storage.saveFaces(knownFaces), [knownFaces]);
  useEffect(() => storage.savePersonality(personality), [personality]);
  useEffect(() => storage.saveSettings(settings), [settings]);

  const hardware = useRobotHardware({
    soundEffects: settings.soundEffects,
    autonomousBehaviors: settings.autonomousBehaviors,
    wifiIp: settings.esp32WifiIp,
    wifiPort: settings.esp32WifiPort,
    wifiProtocol: settings.esp32WifiProtocol,
  });

  // Core Gemini chat pipeline
  const sendToGemini = useCallback(
    async (
      text: string,
      opts?: { viaVoice?: boolean; wakeTriggered?: boolean; imageDataUrl?: string }
    ) => {
      const trimmed = text.trim();
      if (!trimmed || isSending) return;

      const userMsg: ChatMessage = {
        id: `u-${Date.now()}`,
        role: 'user',
        text: trimmed,
        timestamp: new Date().toISOString(),
        viaVoice: opts?.viaVoice,
        wakeTriggered: opts?.wakeTriggered,
        imageDataUrl: opts?.imageDataUrl,
      };

      setMessages((prev) => [...prev, userMsg]);
      setIsSending(true);
      hardware.setExpression('thinking');

      try {
        const historyPayload = messages.slice(-12).map((m) => ({
          role: m.role,
          text: m.text,
        }));

        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: trimmed,
            history: historyPayload,
            personality,
            memories: memories.map((m) => ({ category: m.category, content: m.content })),
            knownFaces: knownFaces.map((f) => ({
              name: f.name,
              relation: f.relation,
              notes: f.notes,
            })),
            telemetry: {
              distanceCm: hardware.telemetry.distanceCm,
              batteryPct: hardware.telemetry.batteryPct,
              touchActive: hardware.telemetry.touchActive,
              mode: hardware.mode,
            },
            model: settings.model,
            thinkingLevel: settings.thinkingLevel,
            imageBase64: opts?.imageDataUrl?.includes(',')
              ? opts.imageDataUrl.split(',')[1]
              : undefined,
          }),
        });

        const data = (await res.json()) as {
          reply?: string;
          expression?: AstroExpression;
          sound?: RobotSoundId;
          servos?: ServoTargets;
          suggestedMemory?: {
            shouldSave?: boolean;
            category?: MemoryCategory;
            content?: string;
          };
          error?: string;
        };

        if (!res.ok) {
          throw new Error(data.error || `Error del servidor (${res.status})`);
        }

        const replyText =
          data.reply || 'Recibí tu mensaje correctamente.';
        const expr: AstroExpression = data.expression || 'happy';
        const snd: RobotSoundId = data.sound || 'confirm';
        const srv: ServoTargets = data.servos || hardware.servos;

        // Dispatch physical command to ESP32-S3 / Simulator
        hardware.sendCommand({
          source: 'gemini',
          expression: expr,
          sound: snd,
          servos: srv,
        });

        // Auto-save memory if Gemini extracted an important fact
        if (
          settings.autoMemory &&
          data.suggestedMemory?.shouldSave &&
          data.suggestedMemory.content?.trim()
        ) {
          const newFact = data.suggestedMemory.content.trim();
          setMemories((prev) => {
            const exists = prev.some(
              (m) => m.content.toLowerCase() === newFact.toLowerCase()
            );
            if (exists) return prev;
            return [
              {
                id: `mem-${Date.now()}`,
                category: data.suggestedMemory?.category || 'usuario',
                content: newFact,
                createdAt: new Date().toISOString(),
                source: 'auto',
              },
              ...prev,
            ];
          });
        }

        const assistantMsg: ChatMessage = {
          id: `a-${Date.now()}`,
          role: 'assistant',
          text: replyText,
          timestamp: new Date().toISOString(),
          expression: expr,
          sound: snd,
          servos: srv,
        };
        setMessages((prev) => [...prev, assistantMsg]);

        if (settings.autoSpeakReplies || opts?.viaVoice || opts?.wakeTriggered) {
          voice.speak(replyText);
        }
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : 'Error de conexión con Gemini.';
        hardware.sendCommand({
          source: 'gemini',
          expression: 'alert',
          sound: 'alert',
        });
        setMessages((prev) => [
          ...prev,
          {
            id: `err-${Date.now()}`,
            role: 'assistant',
            text: `No pude completar la respuesta: ${msg}`,
            timestamp: new Date().toISOString(),
            expression: 'alert',
            error: true,
          },
        ]);
      } finally {
        setIsSending(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isSending, messages, personality, memories, knownFaces, settings, hardware]
  );

  const voice = useVoiceSystem({
    wakeWord: personality.wakeWord,
    settings,
    onWakeActivated: () => {
      androidBridge.vibrate(45);
      hardware.sendCommand({
        source: 'user',
        expression: 'listening',
        sound: 'none',
        servos: { headTilt: 10, headPan: 0 },
      });
    },
    onVoicePrompt: (spokenText, wakeTriggered) => {
      setActiveTab('chat');
      sendToGemini(spokenText, { viaVoice: true, wakeTriggered });
    },
  });

  // Keep Android screen awake automatically while Always Active ("Dummy") is running
  useEffect(() => {
    androidBridge.setKeepScreenOn(voice.alwaysActive);
  }, [voice.alwaysActive, androidBridge]);

  // Handle Vision & Facial Recognition result from Gemini
  const handleVisionResult = useCallback(
    (
      result: {
        description: string;
        spokenSummary: string;
        facesDetected: RecognizedFace[];
        expression: AstroExpression;
        sound: RobotSoundId;
        servos: ServoTargets;
      },
      imageDataUrl: string
    ) => {
      hardware.sendCommand({
        source: 'vision',
        expression: result.expression,
        sound: result.sound,
        servos: result.servos,
      });

      const knownNames = result.facesDetected
        .filter((f) => f.matchedKnownFace)
        .map((f) => f.name);

      const summaryMessage =
        knownNames.length > 0
          ? `${result.spokenSummary} (Reconocido: ${knownNames.join(', ')})`
          : result.spokenSummary || result.description;

      setMessages((prev) => [
        ...prev,
        {
          id: `vis-${Date.now()}`,
          role: 'assistant',
          text: summaryMessage,
          timestamp: new Date().toISOString(),
          imageDataUrl,
          expression: result.expression,
          sound: result.sound,
          servos: result.servos,
          recognizedFaces: result.facesDetected,
        },
      ]);

      if (settings.autoSpeakReplies && result.spokenSummary) {
        voice.speak(result.spokenSummary);
      }
    },
    [hardware, settings.autoSpeakReplies, voice]
  );

  const handleExportBackup = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      personality,
      memories,
      knownFacesCount: knownFaces.length,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `astrobot-memoria-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Drive headPan slightly when face tracking detects a face in Vision tab
  useEffect(() => {
    if (!faceGaze || !settings.autonomousBehaviors) return;
    hardware.setServos((prev) => ({
      ...prev,
      headPan: Math.round(faceGaze.x * 28),
      headTilt: Math.round(-faceGaze.y * 16),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [faceGaze]);

  return (
    <div className="min-h-screen bg-[#07090E] text-slate-100 flex flex-col">
      {/* Desktop & Mobile Top Navigation Bar (Strict 3-Zone Contract) */}
      <header className="sticky top-0 z-30 border-b border-slate-800/90 bg-[#07090E]/95 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-8 px-4 sm:px-6">
          {/* Zone 1: Single-element brand wordmark */}
          <button
            type="button"
            onClick={() => setActiveTab('chat')}
            className="font-display text-base font-bold tracking-wide text-slate-100 hover:text-cyan-300 transition-colors whitespace-nowrap shrink-0"
          >
            S.H. AstroBot AI
          </button>

          {/* Zone 2: Clean single-line text nav links (Desktop) */}
          <nav
            aria-label="Navegación principal"
            className="hidden md:flex items-center gap-6 text-sm font-medium"
          >
            {NAV_ITEMS.map((item) => {
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={`relative py-4 transition-colors whitespace-nowrap shrink-0 ${
                    active
                      ? 'text-cyan-300'
                      : 'text-slate-400 hover:text-slate-100'
                  }`}
                >
                  {item.label}
                  {active && (
                    <span className="absolute inset-x-0 bottom-0 h-0.5 bg-cyan-400" />
                  )}
                </button>
              );
            })}
          </nav>

          {/* Zone 3: Single Primary Action — Always Active ("Dummy") Toggle */}
          <button
            type="button"
            onClick={voice.toggleAlwaysActive}
            className={`min-h-[38px] rounded-lg px-3.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
              voice.alwaysActive
                ? 'bg-cyan-500 text-slate-950 hover:bg-cyan-400'
                : 'border border-cyan-500/40 bg-cyan-500/10 text-cyan-200 hover:bg-cyan-500/20'
            }`}
          >
            {voice.alwaysActive
              ? `Escuchando "${personality.wakeWord}"`
              : `Activar "${personality.wakeWord}"`}
          </button>
        </div>
      </header>

      {/* Main Content Container */}
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-5 pb-24 sm:px-6 md:pb-8">
        {activeTab === 'chat' && (
          <ChatPanel
            messages={messages}
            isSending={isSending}
            expression={hardware.expression}
            servos={hardware.servos}
            ledColor={hardware.ledColor}
            telemetry={hardware.telemetry}
            connectionMode={hardware.mode}
            deviceLabel={hardware.deviceLabel}
            wakeWord={personality.wakeWord}
            alwaysActive={voice.alwaysActive}
            wakeArmed={voice.wakeArmed}
            isListening={voice.isListening}
            isRecordingClip={voice.isRecordingClip}
            isTranscribing={voice.isTranscribing}
            isSpeaking={voice.isSpeaking}
            liveTranscript={voice.liveTranscript}
            voiceError={voice.voiceError}
            onSendMessage={(text, opts) => sendToGemini(text, opts)}
            onToggleAlwaysActive={voice.toggleAlwaysActive}
            onToggleManualTalk={voice.toggleManualTalk}
            onSpeakText={voice.speak}
            onStopSpeaking={voice.stopSpeaking}
            onTouchVisor={() => {
              androidBridge.vibrate(30);
              hardware.triggerTouchInteraction();
            }}
            onQuickExpression={(expr, snd) =>
              hardware.sendCommand({ source: 'user', expression: expr, sound: snd })
            }
            onClearChat={() => setMessages(DEFAULT_CHAT)}
            onOpenVision={() => setActiveTab('vision')}
          />
        )}

        {activeTab === 'vision' && (
          <VisionPanel
            knownFaces={knownFaces}
            model={settings.model}
            botName={personality.botName}
            onEnrollFace={(face) => setKnownFaces((prev) => [face, ...prev])}
            onDeleteFace={(id) =>
              setKnownFaces((prev) => prev.filter((f) => f.id !== id))
            }
            onMarkFaceSeen={(name) =>
              setKnownFaces((prev) =>
                prev.map((f) =>
                  f.name.toLowerCase() === name.toLowerCase()
                    ? { ...f, lastSeenAt: new Date().toISOString() }
                    : f
                )
              )
            }
            onVisionResult={handleVisionResult}
            onFaceGazeChange={setFaceGaze}
          />
        )}

        {activeTab === 'hardware' && (
          <HardwarePanel
            mode={hardware.mode}
            connectionState={hardware.connectionState}
            deviceLabel={hardware.deviceLabel}
            connectionError={hardware.connectionError}
            expression={hardware.expression}
            servos={hardware.servos}
            ledColor={hardware.ledColor}
            telemetry={hardware.telemetry}
            packets={hardware.packets}
            wifiIp={settings.esp32WifiIp}
            wifiPort={settings.esp32WifiPort}
            wifiProtocol={settings.esp32WifiProtocol}
            autonomousBehaviors={settings.autonomousBehaviors}
            onUpdateWifiConfig={(ip, port, proto) =>
              setSettings((prev) => ({
                ...prev,
                esp32WifiIp: ip,
                esp32WifiPort: port,
                esp32WifiProtocol: proto,
              }))
            }
            onActivateSimulator={hardware.activateSimulator}
            onConnectBle={hardware.connectBle}
            onConnectWifi={hardware.connectWifi}
            onSendCommand={hardware.sendCommand}
            onUpdateSimulatedSensor={hardware.updateSimulatedSensor}
            onTriggerTouch={hardware.triggerTouchInteraction}
            onToggleAutonomous={(enabled) =>
              setSettings((prev) => ({ ...prev, autonomousBehaviors: enabled }))
            }
            onClearPackets={hardware.clearPackets}
          />
        )}

        {activeTab === 'memory' && (
          <MemoryPanel
            memories={memories}
            knownFaces={knownFaces}
            autoMemory={settings.autoMemory}
            onToggleAutoMemory={(enabled) =>
              setSettings((prev) => ({ ...prev, autoMemory: enabled }))
            }
            onAddMemory={(category, content) =>
              setMemories((prev) => [
                {
                  id: `mem-${Date.now()}`,
                  category,
                  content,
                  createdAt: new Date().toISOString(),
                  source: 'manual',
                },
                ...prev,
              ])
            }
            onDeleteMemory={(id) =>
              setMemories((prev) => prev.filter((m) => m.id !== id))
            }
            onClearMemories={() => setMemories([])}
            onExportBackup={handleExportBackup}
          />
        )}

        {activeTab === 'settings' && (
          <SettingsPanel
            personality={personality}
            settings={settings}
            availableVoices={voice.availableVoices}
            isNativeAndroid={androidBridge.isNativeAndroid}
            androidAppVersion={androidBridge.appVersion}
            androidServerUrl={androidBridge.serverUrl}
            isPwaInstallable={pwa.isInstallable}
            isPwaInstalled={pwa.isInstalled}
            isIOS={pwa.isIOS}
            onInstallPwa={() => {
              pwa.install();
            }}
            onAndroidUseCloud={androidBridge.useCloudServer}
            onAndroidUseUsbLocal={androidBridge.useUsbLocalServer}
            onAndroidSetCustomUrl={androidBridge.setServerUrl}
            onChangePersonality={setPersonality}
            onChangeSettings={setSettings}
            onTestVoice={() =>
              voice.speak(
                `Hola, soy ${personality.botName}. Mi sistema de voz y mis sensores están listos.`
              )
            }
          />
        )}
      </main>

      {!pwa.isOnline && (
        <div
          role="status"
          className="fixed bottom-16 left-4 right-4 z-50 mx-auto max-w-md rounded-xl border border-amber-500/40 bg-amber-950/90 px-4 py-2.5 text-center text-xs font-medium text-amber-200 backdrop-blur-md md:bottom-4"
        >
          Sin conexión a internet — El simulador y memoria local siguen activos.
        </div>
      )}

      {/* Mobile Fixed Thumb-Zone Bottom Navigation Bar */}
      <nav
        aria-label="Navegación móvil"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-800 bg-[#07090E]/95 backdrop-blur-md md:hidden pb-safe"
      >
        <div className="grid h-14 grid-cols-5">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors ${
                  active ? 'text-cyan-400' : 'text-slate-400'
                }`}
              >
                <Icon className="h-5 w-5" />
                <span className="truncate max-w-full px-1">{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
