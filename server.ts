import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type, ThinkingLevel } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ALLOWED_MODELS = new Set(['gemini-4-hydrogen', 'gemini-3.1-flash-lite']);
const ALLOWED_VOICES = new Set(['Puck', 'Kore', 'Zephyr', 'Fenrir', 'Charon']);

function getAiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY no está configurada en el servidor.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function resolveThinkingLevel(level: unknown): ThinkingLevel {
  if (level === 'HIGH') return ThinkingLevel.HIGH;
  if (level === 'MEDIUM') return ThinkingLevel.MEDIUM;
  return ThinkingLevel.LOW;
}

function buildSystemInstruction(
  personality: {
    botName?: string;
    wakeWord?: string;
    curiosity?: number;
    expressiveness?: number;
    humor?: number;
    conciseness?: number;
    customInstructions?: string;
  } = {},
  memories: Array<{ category: string; content: string }> = [],
  knownFaces: Array<{ name: string; relation: string; notes: string }> = [],
  telemetry?: { distanceCm?: number; batteryPct?: number; touchActive?: boolean; mode?: string }
): string {
  const name = personality.botName || 'AstroBot';
  const wakeWord = personality.wakeWord || 'Dummy';
  const curiosity = personality.curiosity ?? 8;
  const expressiveness = personality.expressiveness ?? 9;
  const humor = personality.humor ?? 6;
  const conciseness = personality.conciseness ?? 7;

  const memoryBlock =
    memories.length > 0
      ? memories.map((m) => `- [${m.category}] ${m.content}`).join('\n')
      : '- Sin recuerdos guardados todavía.';

  const facesBlock =
    knownFaces.length > 0
      ? knownFaces
          .map((f) => `- ${f.name} (${f.relation || 'conocido'}): ${f.notes || 'sin notas'}`)
          .join('\n')
      : '- Ningún rostro registrado todavía.';

  const hardwareBlock = telemetry
    ? `Modo hardware: ${telemetry.mode || 'simulador'}, distancia frontal: ${telemetry.distanceCm ?? 65} cm, batería: ${telemetry.batteryPct ?? 95}%, sensor táctil: ${telemetry.touchActive ? 'activo' : 'inactivo'}.`
    : 'Hardware operando en modo simulador local.';

  return `Eres ${name} (también respondes al nombre de activación "${wakeWord}"), el cerebro inteligente de un pequeño robot físico de escritorio inspirado en Astro Bot.

PERSONALIDAD:
- Amigable, curioso (${curiosity}/10), expresivo (${expressiveness}/10), con humor sutil (${humor}/10) y directo/conciso (${conciseness}/10).
- Hablas siempre en español natural y cercano, como un compañero robótico inteligente sobre el escritorio.
- Mantén tus respuestas breves y fáciles de pronunciar por voz (idealmente 1 a 3 frases, salvo que te pidan una explicación detallada).
- No uses emojis ni formato markdown complejo en el campo "reply" para que la síntesis de voz suene limpia y natural.
${personality.customInstructions ? `- Instrucciones adicionales del usuario: ${personality.customInstructions}` : ''}

MEMORIA ACTIVA DEL ROBOT:
${memoryBlock}

PERSONAS REGISTRADAS EN VISIÓN:
${facesBlock}

ESTADO ACTUAL DEL ROBOT (ESP32-S3):
${hardwareBlock}

CONTROL FÍSICO:
Siempre debes devolver un JSON válido con tu respuesta hablada ("reply"), la expresión facial OLED ("expression"), un efecto de sonido ("sound"), las posiciones sugeridas de servomotores ("servos": headPan entre -45 y 45, headTilt entre -30 y 30, leftArm entre 0 y 180, rightArm entre 0 y 180), y opcionalmente "suggestedMemory" si el usuario reveló un dato personal importante o preferencia digna de recordar.`;
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: '15mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'sh-astrobot-ai' });
  });

  // 1. Conversación natural + comandos físicos del robot (Gemini)
  app.post('/api/chat', async (req, res) => {
    try {
      const {
        message,
        history = [],
        personality = {},
        memories = [],
        knownFaces = [],
        telemetry,
        model = 'gemini-4-hydrogen',
        thinkingLevel = 'LOW',
        imageBase64,
        imageMimeType = 'image/jpeg',
      } = req.body ?? {};

      if (!message || typeof message !== 'string') {
        res.status(400).json({ error: 'El mensaje de texto es obligatorio.' });
        return;
      }

      const selectedModel = ALLOWED_MODELS.has(model) ? model : 'gemini-4-hydrogen';
      const ai = getAiClient();

      const systemInstruction = buildSystemInstruction(
        personality,
        memories,
        knownFaces,
        telemetry
      );

      const recentHistory = Array.isArray(history)
        ? history.slice(-12).map((item: { role: string; text: string }) => ({
            role: item.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: String(item.text || '') }],
          }))
        : [];

      const currentParts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [];
      if (imageBase64 && typeof imageBase64 === 'string') {
        currentParts.push({
          inlineData: {
            mimeType: imageMimeType,
            data: imageBase64,
          },
        });
      }
      currentParts.push({ text: message });

      const contents = [
        ...recentHistory,
        {
          role: 'user',
          parts: currentParts,
        },
      ];

      const response = await ai.models.generateContent({
        model: selectedModel,
        contents,
        config: {
          systemInstruction,
          thinkingConfig: {
            thinkingLevel: resolveThinkingLevel(thinkingLevel),
          },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              reply: {
                type: Type.STRING,
                description: 'Respuesta natural de AstroBot en español, sin emojis ni markdown.',
              },
              expression: {
                type: Type.STRING,
                enum: [
                  'neutral',
                  'happy',
                  'curious',
                  'surprised',
                  'thinking',
                  'love',
                  'sleepy',
                  'alert',
                ],
                description: 'Expresión OLED recomendada para los ojos del robot.',
              },
              sound: {
                type: Type.STRING,
                enum: ['none', 'confirm', 'happy', 'curious', 'alert', 'wake'],
                description: 'Sonido robótico breve a reproducir junto con la respuesta.',
              },
              servos: {
                type: Type.OBJECT,
                properties: {
                  headPan: { type: Type.INTEGER, description: 'Ángulo horizontal cabeza (-45 a 45)' },
                  headTilt: { type: Type.INTEGER, description: 'Ángulo vertical cabeza (-30 a 30)' },
                  leftArm: { type: Type.INTEGER, description: 'Brazo izquierdo (0 a 180)' },
                  rightArm: { type: Type.INTEGER, description: 'Brazo derecho (0 a 180)' },
                },
                required: ['headPan', 'headTilt', 'leftArm', 'rightArm'],
              },
              suggestedMemory: {
                type: Type.OBJECT,
                properties: {
                  shouldSave: { type: Type.BOOLEAN },
                  category: {
                    type: Type.STRING,
                    enum: ['usuario', 'preferencia', 'hecho', 'rutina'],
                  },
                  content: { type: Type.STRING },
                },
                required: ['shouldSave', 'category', 'content'],
              },
            },
            required: ['reply', 'expression', 'sound', 'servos'],
          },
        },
      });

      const rawText = (response.text ?? '').trim();
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(rawText);
      } catch {
        parsed = {
          reply: rawText || 'He recibido tu mensaje, pero tuve un pequeño hipo al estructurar mis motores.',
          expression: 'curious',
          sound: 'confirm',
          servos: { headPan: 0, headTilt: 5, leftArm: 35, rightArm: 35 },
        };
      }

      res.json(parsed);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Error al comunicarse con Gemini.';
      console.error('[API /api/chat error]', err);
      res.status(500).json({ error: errorMessage });
    }
  });

  // 2. Visión por cámara y reconocimiento facial con Gemini Vision
  app.post('/api/vision', async (req, res) => {
    try {
      const {
        imageBase64,
        imageMimeType = 'image/jpeg',
        prompt = 'Analiza esta imagen desde tu cámara. Identifica si hay rostros humanos y compáralos con las personas registradas.',
        knownFaces = [],
        personality = {},
        model = 'gemini-4-hydrogen',
      } = req.body ?? {};

      if (!imageBase64 || typeof imageBase64 !== 'string') {
        res.status(400).json({ error: 'Se requiere una imagen en base64 para el análisis visual.' });
        return;
      }

      const selectedModel = ALLOWED_MODELS.has(model) ? model : 'gemini-4-hydrogen';
      const ai = getAiClient();

      const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [];

      // Attach enrolled face thumbnails (up to 4) for genuine visual comparison by Gemini Vision
      const validFaces = Array.isArray(knownFaces) ? knownFaces.slice(0, 4) : [];
      if (validFaces.length > 0) {
        parts.push({
          text: 'REFERENCIAS DE ROSTROS REGISTRADOS EN LA MEMORIA DE ASTROBOT (úsalas para reconocer a la persona en la foto en vivo):',
        });
        for (const face of validFaces) {
          parts.push({
            text: `Persona registrada: Nombre="${face.name}", Relación="${face.relation || 'conocido'}", Notas="${face.notes || 'ninguna'}". Foto de referencia:`,
          });
          if (typeof face.avatarBase64 === 'string' && face.avatarBase64.length > 50) {
            parts.push({
              inlineData: {
                mimeType: face.avatarMimeType || 'image/jpeg',
                data: face.avatarBase64,
              },
            });
          }
        }
      }

      parts.push({
        text: `CAPTURA EN VIVO DE LA CÁMARA DEL ROBOT. Instrucción: ${prompt}.
Si reconoces a una persona comparando sus rasgos faciales con alguna de las fotos de referencia anteriores, indica su nombre exacto y pon matchedKnownFace=true. Si no coincide o no hay referencias, pon name="Desconocido" y matchedKnownFace=false. Responde siempre en español sin emojis.`,
      });
      parts.push({
        inlineData: {
          mimeType: imageMimeType,
          data: imageBase64,
        },
      });

      const response = await ai.models.generateContent({
        model: selectedModel,
        contents: [{ role: 'user', parts }],
        config: {
          systemInstruction: `Eres ${personality.botName || 'AstroBot'}, un robot de escritorio inteligente con cámara. Analizas escenas y reconoces rostros con precisión y amabilidad en español.`,
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              description: {
                type: Type.STRING,
                description: 'Descripción natural y útil de lo que ve la cámara en español.',
              },
              spokenSummary: {
                type: Type.STRING,
                description: 'Frase breve y amigable que diría AstroBot en voz alta al ver esta escena o persona.',
              },
              facesDetected: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    name: { type: Type.STRING },
                    matchedKnownFace: { type: Type.BOOLEAN },
                    emotion: { type: Type.STRING },
                    traits: { type: Type.STRING },
                    greeting: { type: Type.STRING },
                  },
                  required: ['name', 'matchedKnownFace', 'emotion', 'traits', 'greeting'],
                },
              },
              expression: {
                type: Type.STRING,
                enum: ['neutral', 'happy', 'curious', 'surprised', 'love', 'alert'],
              },
              sound: {
                type: Type.STRING,
                enum: ['none', 'confirm', 'happy', 'curious', 'alert', 'wake'],
              },
              servos: {
                type: Type.OBJECT,
                properties: {
                  headPan: { type: Type.INTEGER },
                  headTilt: { type: Type.INTEGER },
                  leftArm: { type: Type.INTEGER },
                  rightArm: { type: Type.INTEGER },
                },
                required: ['headPan', 'headTilt', 'leftArm', 'rightArm'],
              },
            },
            required: ['description', 'spokenSummary', 'facesDetected', 'expression', 'sound', 'servos'],
          },
        },
      });

      const raw = (response.text ?? '{}').trim();
      const parsed = JSON.parse(raw);
      res.json(parsed);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Error al analizar la imagen con Gemini.';
      console.error('[API /api/vision error]', err);
      res.status(500).json({ error: errorMessage });
    }
  });

  // 3. Síntesis de voz neural con Gemini TTS (gemini-3.8-flash-lite-tts)
  app.post('/api/tts', async (req, res) => {
    try {
      const { text, voiceName = 'Puck', style = 'Amigable, expresivo y claro en español' } = req.body ?? {};
      if (!text || typeof text !== 'string') {
        res.status(400).json({ error: 'Texto requerido para síntesis de voz.' });
        return;
      }

      const safeVoice = ALLOWED_VOICES.has(voiceName) ? voiceName : 'Puck';
      const ai = getAiClient();

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash-lite-tts',
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: text.slice(0, 800),
                speechMetadata: {
                  style: String(style),
                },
              },
            ],
          },
        ],
        config: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: safeVoice,
              },
            },
          },
        },
      });

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (!base64Audio) {
        res.status(502).json({ error: 'Gemini TTS no devolvió audio.' });
        return;
      }

      res.json({ audioBase64: base64Audio, mimeType: 'audio/wav' });
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Error generando voz con Gemini TTS.';
      console.error('[API /api/tts error]', err);
      res.status(500).json({ error: errorMessage });
    }
  });

  // 4. Transcripción de audio con Gemini (gemini-3.5-transcribe)
  app.post('/api/transcribe', async (req, res) => {
    try {
      const { audioBase64, mimeType = 'audio/webm' } = req.body ?? {};
      if (!audioBase64 || typeof audioBase64 !== 'string') {
        res.status(400).json({ error: 'Audio en base64 requerido para transcripción.' });
        return;
      }

      const ai = getAiClient();
      const response = await ai.models.generateContent({
        model: 'gemini-3.5-transcribe',
        contents: {
          parts: [
            {
              inlineData: {
                mimeType,
                data: audioBase64,
              },
            },
            {
              text: 'Transcribe exactamente lo que dice el usuario en español. Devuelve únicamente el texto transcrito sin comentarios adicionales.',
            },
          ],
        },
      });

      res.json({ text: (response.text ?? '').trim() });
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Error al transcribir audio.';
      console.error('[API /api/transcribe error]', err);
      res.status(500).json({ error: errorMessage });
    }
  });

  // Vite middleware in dev / static files in production
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`S.H. AstroBot AI server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
