export type AstroExpression =
  | 'neutral'
  | 'happy'
  | 'curious'
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'surprised'
  | 'sleepy'
  | 'love'
  | 'alert';

export type RobotSoundId =
  | 'none'
  | 'confirm'
  | 'happy'
  | 'curious'
  | 'alert'
  | 'wake'
  | 'sleep';

export interface ServoTargets {
  headPan: number; // -45 to 45 deg
  headTilt: number; // -30 to 30 deg
  leftArm: number; // 0 to 180 deg
  rightArm: number; // 0 to 180 deg
}

export interface RobotCommand {
  type: 'cmd';
  timestamp: string;
  source: 'gemini' | 'user' | 'autonomous' | 'vision';
  expression?: AstroExpression;
  sound?: RobotSoundId;
  servos?: Partial<ServoTargets>;
  ledColor?: string;
}

export interface RobotTelemetry {
  distanceCm: number;
  touchActive: boolean;
  lightLevel: number; // 0-100
  batteryPct: number;
  temperatureC: number;
  rssiDbm: number;
  uptimeSec: number;
  autonomousState: string;
}

export interface ProtocolPacket {
  id: string;
  direction: 'TX' | 'RX';
  transport: 'simulator' | 'ble' | 'wifi';
  timestamp: string;
  payload: string;
}

export type ConnectionMode = 'simulator' | 'ble' | 'wifi';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: string;
  viaVoice?: boolean;
  wakeTriggered?: boolean;
  imageDataUrl?: string;
  expression?: AstroExpression;
  sound?: RobotSoundId;
  servos?: ServoTargets;
  recognizedFaces?: RecognizedFace[];
  error?: boolean;
}

export type MemoryCategory = 'usuario' | 'preferencia' | 'hecho' | 'rutina';

export interface MemoryItem {
  id: string;
  category: MemoryCategory;
  content: string;
  createdAt: string;
  source: 'manual' | 'auto';
}

export interface KnownFace {
  id: string;
  name: string;
  relation: string;
  notes: string;
  avatarDataUrl: string;
  enrolledAt: string;
  lastSeenAt?: string;
}

export interface RecognizedFace {
  name: string;
  matchedKnownFace: boolean;
  emotion: string;
  traits: string;
  greeting: string;
}

export interface PersonalityConfig {
  botName: string;
  wakeWord: string;
  curiosity: number; // 1-10
  expressiveness: number; // 1-10
  humor: number; // 1-10
  conciseness: number; // 1-10
  customInstructions: string;
}

export type GeminiModelId = 'gemini-4-hydrogen' | 'gemini-3.1-flash-lite';
export type ThinkingDepth = 'LOW' | 'MEDIUM' | 'HIGH';
export type TtsEngine = 'gemini' | 'browser';
export type GeminiVoiceName = 'Puck' | 'Kore' | 'Zephyr' | 'Fenrir' | 'Charon';

export interface AppSettings {
  model: GeminiModelId;
  thinkingLevel: ThinkingDepth;
  autoMemory: boolean;
  ttsEngine: TtsEngine;
  geminiVoice: GeminiVoiceName;
  browserVoiceURI: string;
  speechRate: number; // 0.7 - 1.6
  speechPitch: number; // 0.7 - 1.4
  autoSpeakReplies: boolean;
  soundEffects: boolean;
  autonomousBehaviors: boolean;
  esp32WifiIp: string;
  esp32WifiPort: number;
  esp32WifiProtocol: 'ws' | 'http';
}

export type NavTab = 'chat' | 'vision' | 'hardware' | 'memory' | 'settings';
