import type {
  AppSettings,
  ChatMessage,
  KnownFace,
  MemoryItem,
  PersonalityConfig,
} from '../types';

const KEYS = {
  chat: 'sh_astrobot_chat_v1',
  memories: 'sh_astrobot_memories_v1',
  faces: 'sh_astrobot_faces_v1',
  personality: 'sh_astrobot_personality_v1',
  settings: 'sh_astrobot_settings_v1',
};

export const DEFAULT_PERSONALITY: PersonalityConfig = {
  botName: 'AstroBot',
  wakeWord: 'Dummy',
  curiosity: 8,
  expressiveness: 9,
  humor: 6,
  conciseness: 7,
  customInstructions:
    'Eres un pequeño robot compañero de escritorio. Reacciona con entusiasmo a descubrimientos, preguntas de tecnología y al reconocer a personas conocidas.',
};

export const DEFAULT_SETTINGS: AppSettings = {
  model: 'gemini-4-hydrogen',
  thinkingLevel: 'LOW',
  autoMemory: true,
  ttsEngine: 'gemini',
  geminiVoice: 'Puck',
  browserVoiceURI: '',
  speechRate: 1.05,
  speechPitch: 1.1,
  autoSpeakReplies: true,
  soundEffects: true,
  autonomousBehaviors: true,
  esp32WifiIp: '192.168.1.50',
  esp32WifiPort: 81,
  esp32WifiProtocol: 'ws',
};

export const DEFAULT_MEMORIES: MemoryItem[] = [
  {
    id: 'mem-init-1',
    category: 'hecho',
    content: 'Mi controlador físico objetivo es una placa ESP32-S3 conectada por Bluetooth BLE o Wi-Fi.',
    createdAt: new Date().toISOString(),
    source: 'manual',
  },
  {
    id: 'mem-init-2',
    category: 'preferencia',
    content: 'El usuario me llama Dummy cuando activa el modo de escucha continua.',
    createdAt: new Date().toISOString(),
    source: 'manual',
  },
];

export const DEFAULT_CHAT: ChatMessage[] = [
  {
    id: 'msg-welcome',
    role: 'assistant',
    text: 'Hola, soy S.H. AstroBot AI. Mis sensores visuales y de audio están listos. Puedes hablarme por texto, pulsar el micrófono o activar la escucha continua y llamarme Dummy.',
    timestamp: new Date().toISOString(),
    expression: 'happy',
    sound: 'wake',
    servos: { headPan: 0, headTilt: 8, leftArm: 45, rightArm: 135 },
  },
];

export function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function saveToStorage<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage quota errors gracefully
  }
}

export const storage = {
  loadChat: () => loadFromStorage<ChatMessage[]>(KEYS.chat, DEFAULT_CHAT),
  saveChat: (v: ChatMessage[]) => saveToStorage(KEYS.chat, v.slice(-60)),
  loadMemories: () => loadFromStorage<MemoryItem[]>(KEYS.memories, DEFAULT_MEMORIES),
  saveMemories: (v: MemoryItem[]) => saveToStorage(KEYS.memories, v),
  loadFaces: () => loadFromStorage<KnownFace[]>(KEYS.faces, []),
  saveFaces: (v: KnownFace[]) => saveToStorage(KEYS.faces, v),
  loadPersonality: () =>
    loadFromStorage<PersonalityConfig>(KEYS.personality, DEFAULT_PERSONALITY),
  savePersonality: (v: PersonalityConfig) => saveToStorage(KEYS.personality, v),
  loadSettings: () => ({
    ...DEFAULT_SETTINGS,
    ...loadFromStorage<Partial<AppSettings>>(KEYS.settings, {}),
  }),
  saveSettings: (v: AppSettings) => saveToStorage(KEYS.settings, v),
};
