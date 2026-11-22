import { useCallback, useEffect, useRef, useState } from 'react';
import type { AppSettings } from '../types';
import { playRobotSound } from '../utils/robotAudio';

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: {
      isFinal: boolean;
      [altIndex: number]: {
        transcript: string;
        confidence: number;
      };
    };
  };
}

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onstart: (() => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

function normalizeText(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function matchWakeWord(transcript: string, wakeWord: string): { matched: boolean; command: string } {
  const cleanWake = normalizeText(wakeWord || 'dummy');
  const normalized = normalizeText(transcript);

  // Build fuzzy Spanish STT variants for "Dummy" (often heard as dami, dumi, domi, dummi)
  const variants =
    cleanWake === 'dummy'
      ? ['dummy', 'dummi', 'dumi', 'dami', 'domi', 'dammy', 'dummie']
      : [cleanWake];

  for (const variant of variants) {
    const regex = new RegExp(`\\b${variant}\\b[,:\\s]*(.*)`, 'i');
    const m = normalized.match(regex);
    if (m) {
      return { matched: true, command: (m[1] || '').trim() };
    }
  }
  return { matched: false, command: '' };
}

export interface UseVoiceSystemOptions {
  wakeWord: string;
  settings: AppSettings;
  onVoicePrompt: (text: string, wakeTriggered: boolean) => void;
  onWakeActivated: () => void;
}

export function useVoiceSystem({
  wakeWord,
  settings,
  onVoicePrompt,
  onWakeActivated,
}: UseVoiceSystemOptions) {
  const [speechSupported] = useState<boolean>(() => Boolean(getSpeechRecognitionCtor()));
  const [alwaysActive, setAlwaysActive] = useState<boolean>(false);
  const [wakeArmed, setWakeArmed] = useState<boolean>(false);
  const [isListening, setIsListening] = useState<boolean>(false);
  const [isRecordingClip, setIsRecordingClip] = useState<boolean>(false);
  const [isTranscribing, setIsTranscribing] = useState<boolean>(false);
  const [isSpeaking, setIsSpeaking] = useState<boolean>(false);
  const [liveTranscript, setLiveTranscript] = useState<string>('');
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);

  const alwaysActiveRef = useRef(alwaysActive);
  alwaysActiveRef.current = alwaysActive;
  const wakeArmedRef = useRef(wakeArmed);
  wakeArmedRef.current = wakeArmed;
  const isSpeakingRef = useRef(isSpeaking);
  isSpeakingRef.current = isSpeaking;
  const wakeWordRef = useRef(wakeWord);
  wakeWordRef.current = wakeWord;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const onVoicePromptRef = useRef(onVoicePrompt);
  onVoicePromptRef.current = onVoicePrompt;
  const onWakeActivatedRef = useRef(onWakeActivated);
  onWakeActivatedRef.current = onWakeActivated;

  const continuousRecRef = useRef<SpeechRecognitionLike | null>(null);
  const manualRecRef = useRef<SpeechRecognitionLike | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaChunksRef = useRef<Blob[]>([]);
  const wakeWindowTimerRef = useRef<number | null>(null);
  const activeAudioRef = useRef<HTMLAudioElement | null>(null);
  const restartTimerRef = useRef<number | null>(null);

  // Load browser SpeechSynthesis voices
  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    const loadVoices = () => {
      const voices = window.speechSynthesis.getVoices();
      setAvailableVoices(voices);
    };
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
    return () => {
      window.speechSynthesis.onvoiceschanged = null;
    };
  }, []);

  const clearWakeWindow = useCallback(() => {
    if (wakeWindowTimerRef.current) {
      window.clearTimeout(wakeWindowTimerRef.current);
      wakeWindowTimerRef.current = null;
    }
    setWakeArmed(false);
    wakeArmedRef.current = false;
  }, []);

  // Stop any ongoing TTS playback
  const stopSpeaking = useCallback(() => {
    if (activeAudioRef.current) {
      activeAudioRef.current.pause();
      activeAudioRef.current.src = '';
      activeAudioRef.current = null;
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setIsSpeaking(false);
    isSpeakingRef.current = false;
  }, []);

  // Browser local SpeechSynthesis helper
  const speakWithBrowser = useCallback((text: string) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      setIsSpeaking(false);
      isSpeakingRef.current = false;
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'es-ES';
    utterance.rate = settingsRef.current.speechRate;
    utterance.pitch = settingsRef.current.speechPitch;

    const voices = window.speechSynthesis.getVoices();
    const chosen =
      voices.find((v) => v.voiceURI === settingsRef.current.browserVoiceURI) ||
      voices.find((v) => v.lang.toLowerCase().startsWith('es'));
    if (chosen) utterance.voice = chosen;

    utterance.onstart = () => {
      setIsSpeaking(true);
      isSpeakingRef.current = true;
    };
    utterance.onend = () => {
      setIsSpeaking(false);
      isSpeakingRef.current = false;
    };
    utterance.onerror = () => {
      setIsSpeaking(false);
      isSpeakingRef.current = false;
    };
    window.speechSynthesis.speak(utterance);
  }, []);

  // Speak text using Gemini Neural TTS (or browser SpeechSynthesis)
  const speak = useCallback(
    async (text: string) => {
      const clean = text.trim();
      if (!clean) return;
      stopSpeaking();
      setIsSpeaking(true);
      isSpeakingRef.current = true;

      if (settingsRef.current.ttsEngine === 'browser') {
        speakWithBrowser(clean);
        return;
      }

      try {
        const res = await fetch('/api/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: clean,
            voiceName: settingsRef.current.geminiVoice,
            style: 'Robot compañero amigable, entusiasta y claro hablando en español',
          }),
        });

        if (!res.ok) {
          throw new Error(`TTS HTTP ${res.status}`);
        }

        const data = (await res.json()) as { audioBase64?: string; mimeType?: string };
        if (!data.audioBase64) throw new Error('Sin audio en respuesta TTS');

        const audio = new Audio(`data:${data.mimeType || 'audio/wav'};base64,${data.audioBase64}`);
        audio.playbackRate = settingsRef.current.speechRate;
        activeAudioRef.current = audio;

        audio.onended = () => {
          setIsSpeaking(false);
          isSpeakingRef.current = false;
          activeAudioRef.current = null;
        };
        audio.onerror = () => {
          activeAudioRef.current = null;
          speakWithBrowser(clean);
        };

        await audio.play();
      } catch {
        // Fallback seamlessly to local browser speech synthesis
        speakWithBrowser(clean);
      }
    },
    [speakWithBrowser, stopSpeaking]
  );

  // Start / Stop Always Active ("Dummy") wake-word engine
  const startAlwaysActiveLoop = useCallback(() => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      setVoiceError(
        'El modo Always Active ("Dummy") requiere Web Speech API (Chrome / Edge / Android Chrome). Puedes usar el botón de micrófono para grabar audio con Gemini Transcribe.'
      );
      setAlwaysActive(false);
      return;
    }

    try {
      continuousRecRef.current?.abort();
    } catch {
      // ignore
    }

    const rec = new Ctor();
    rec.lang = 'es-ES';
    rec.continuous = true;
    rec.interimResults = true;
    continuousRecRef.current = rec;

    rec.onstart = () => {
      setVoiceError(null);
      setIsListening(true);
    };

    rec.onresult = (event) => {
      // Ignore self-audio while AstroBot is speaking
      if (isSpeakingRef.current) return;

      let latestInterim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const transcript = result[0]?.transcript?.trim() || '';
        if (!transcript) continue;

        if (!result.isFinal) {
          latestInterim = transcript;
          // Early visual feedback if wake word appears in interim speech
          const interimCheck = matchWakeWord(transcript, wakeWordRef.current);
          if (interimCheck.matched && !wakeArmedRef.current) {
            setWakeArmed(true);
            wakeArmedRef.current = true;
            playRobotSound('wake', settingsRef.current.soundEffects);
            onWakeActivatedRef.current();
          }
        } else {
          const check = matchWakeWord(transcript, wakeWordRef.current);
          if (check.matched) {
            if (check.command.length >= 2) {
              clearWakeWindow();
              setLiveTranscript('');
              playRobotSound('wake', settingsRef.current.soundEffects);
              onVoicePromptRef.current(check.command, true);
            } else {
              // User only said "Dummy" -> open 7s active command window
              setWakeArmed(true);
              wakeArmedRef.current = true;
              setLiveTranscript(`"${wakeWordRef.current}" detectado — dime qué necesitas...`);
              playRobotSound('wake', settingsRef.current.soundEffects);
              onWakeActivatedRef.current();
              if (wakeWindowTimerRef.current) window.clearTimeout(wakeWindowTimerRef.current);
              wakeWindowTimerRef.current = window.setTimeout(() => {
                clearWakeWindow();
                setLiveTranscript('');
              }, 7500);
            }
          } else if (wakeArmedRef.current && transcript.length >= 2) {
            // Follow-up sentence right after saying "Dummy"
            clearWakeWindow();
            setLiveTranscript('');
            onVoicePromptRef.current(transcript, true);
          }
        }
      }

      if (latestInterim) {
        setLiveTranscript(latestInterim);
      }
    };

    rec.onerror = (event) => {
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        setVoiceError('Permiso de micrófono denegado. Habilítalo para activar la escucha continua.');
        setAlwaysActive(false);
        setIsListening(false);
      } else if (event.error !== 'no-speech' && event.error !== 'aborted') {
        setVoiceError(`Reconocimiento de voz: ${event.error}`);
      }
    };

    rec.onend = () => {
      if (alwaysActiveRef.current) {
        restartTimerRef.current = window.setTimeout(() => {
          if (alwaysActiveRef.current) {
            try {
              rec.start();
            } catch {
              startAlwaysActiveLoop();
            }
          }
        }, 350);
      } else {
        setIsListening(false);
      }
    };

    try {
      rec.start();
    } catch {
      setVoiceError('No se pudo iniciar el micrófono. Verifica permisos del navegador.');
      setAlwaysActive(false);
    }
  }, [clearWakeWindow]);

  const toggleAlwaysActive = useCallback(() => {
    setVoiceError(null);
    if (alwaysActiveRef.current) {
      setAlwaysActive(false);
      alwaysActiveRef.current = false;
      clearWakeWindow();
      setLiveTranscript('');
      if (restartTimerRef.current) window.clearTimeout(restartTimerRef.current);
      try {
        continuousRecRef.current?.stop();
      } catch {
        // ignore
      }
      continuousRecRef.current = null;
      setIsListening(false);
    } else {
      // Stop manual recorder if active
      try {
        manualRecRef.current?.stop();
      } catch {
        // ignore
      }
      setAlwaysActive(true);
      alwaysActiveRef.current = true;
      startAlwaysActiveLoop();
    }
  }, [clearWakeWindow, startAlwaysActiveLoop]);

  // Manual Tap-to-Talk (Web Speech API OR MediaRecorder + Gemini Transcribe fallback)
  const toggleManualTalk = useCallback(async () => {
    setVoiceError(null);
    stopSpeaking();

    // If recording audio clip -> stop and transcribe with Gemini
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
      return;
    }

    // If manual Web Speech is active -> stop
    if (manualRecRef.current) {
      try {
        manualRecRef.current.stop();
      } catch {
        // ignore
      }
      manualRecRef.current = null;
      setIsListening(false);
      return;
    }

    // Pause continuous wake loop temporarily if running
    const wasAlwaysActive = alwaysActiveRef.current;
    if (wasAlwaysActive && continuousRecRef.current) {
      try {
        continuousRecRef.current.stop();
      } catch {
        // ignore
      }
    }

    const Ctor = getSpeechRecognitionCtor();
    if (Ctor) {
      const rec = new Ctor();
      rec.lang = 'es-ES';
      rec.continuous = false;
      rec.interimResults = true;
      manualRecRef.current = rec;
      let capturedFinal = '';

      rec.onstart = () => {
        setIsListening(true);
        setLiveTranscript('Escuchando...');
        playRobotSound('wake', settingsRef.current.soundEffects);
      };

      rec.onresult = (event) => {
        let interim = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const text = event.results[i][0]?.transcript || '';
          if (event.results[i].isFinal) {
            capturedFinal += (capturedFinal ? ' ' : '') + text.trim();
          } else {
            interim += text;
          }
        }
        setLiveTranscript(capturedFinal || interim);
      };

      rec.onerror = (ev) => {
        if (ev.error !== 'no-speech' && ev.error !== 'aborted') {
          setVoiceError(`Micrófono: ${ev.error}`);
        }
      };

      rec.onend = () => {
        manualRecRef.current = null;
        setIsListening(false);
        const finalText = capturedFinal.trim();
        setLiveTranscript('');
        if (finalText) {
          onVoicePromptRef.current(finalText, false);
        }
        if (wasAlwaysActive && alwaysActiveRef.current) {
          startAlwaysActiveLoop();
        }
      };

      try {
        rec.start();
        return;
      } catch {
        manualRecRef.current = null;
      }
    }

    // Fallback: record real audio via MediaRecorder & transcribe with Gemini 3.5 Transcribe
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : 'audio/mp4';
      const recorder = new MediaRecorder(stream, { mimeType });
      mediaChunksRef.current = [];
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) mediaChunksRef.current.push(ev.data);
      };

      recorder.onstop = async () => {
        setIsRecordingClip(false);
        setIsListening(false);
        stream.getTracks().forEach((t) => t.stop());
        mediaRecorderRef.current = null;

        const blob = new Blob(mediaChunksRef.current, { type: mimeType });
        if (blob.size < 400) return;

        setIsTranscribing(true);
        setLiveTranscript('Transcribiendo audio con Gemini...');
        try {
          const base64 = await blobToBase64(blob);
          const res = await fetch('/api/transcribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ audioBase64: base64, mimeType }),
          });
          const data = (await res.json()) as { text?: string; error?: string };
          if (!res.ok) throw new Error(data.error || 'Error al transcribir');
          if (data.text) {
            onVoicePromptRef.current(data.text, false);
          }
        } catch (err) {
          setVoiceError(
            err instanceof Error ? err.message : 'No se pudo transcribir el audio.'
          );
        } finally {
          setIsTranscribing(false);
          setLiveTranscript('');
        }
      };

      recorder.start();
      setIsRecordingClip(true);
      setIsListening(true);
      setLiveTranscript('Grabando audio... pulsa de nuevo para enviar');
      playRobotSound('wake', settingsRef.current.soundEffects);
    } catch (err) {
      setVoiceError(
        err instanceof Error
          ? `No se pudo acceder al micrófono: ${err.message}`
          : 'Permiso de micrófono no disponible.'
      );
    }
  }, [startAlwaysActiveLoop, stopSpeaking]);

  useEffect(() => {
    return () => {
      alwaysActiveRef.current = false;
      if (restartTimerRef.current) window.clearTimeout(restartTimerRef.current);
      if (wakeWindowTimerRef.current) window.clearTimeout(wakeWindowTimerRef.current);
      try {
        continuousRecRef.current?.abort();
        manualRecRef.current?.abort();
      } catch {
        // ignore
      }
      stopSpeaking();
    };
  }, [stopSpeaking]);

  return {
    speechSupported,
    alwaysActive,
    wakeArmed,
    isListening,
    isRecordingClip,
    isTranscribing,
    isSpeaking,
    liveTranscript,
    voiceError,
    availableVoices,
    toggleAlwaysActive,
    toggleManualTalk,
    speak,
    stopSpeaking,
  };
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = String(reader.result || '');
      const base64 = result.includes(',') ? result.split(',')[1] : result;
      resolve(base64);
    };
    reader.onerror = () => reject(new Error('Error leyendo audio grabado.'));
    reader.readAsDataURL(blob);
  });
}
