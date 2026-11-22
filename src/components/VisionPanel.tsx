import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Camera,
  CameraOff,
  RefreshCw,
  ScanFace,
  Send,
  Trash2,
  UserPlus,
} from 'lucide-react';
import type {
  AstroExpression,
  KnownFace,
  RecognizedFace,
  RobotSoundId,
  ServoTargets,
} from '../types';

interface FaceBox {
  x: number;
  y: number;
  w: number;
  h: number;
  source: 'native' | 'chrominance';
}

interface VisionAnalysisResult {
  description: string;
  spokenSummary: string;
  facesDetected: RecognizedFace[];
  expression: AstroExpression;
  sound: RobotSoundId;
  servos: ServoTargets;
}

interface VisionPanelProps {
  knownFaces: KnownFace[];
  model: string;
  botName: string;
  onEnrollFace: (face: KnownFace) => void;
  onDeleteFace: (id: string) => void;
  onMarkFaceSeen: (name: string) => void;
  onVisionResult: (result: VisionAnalysisResult, imageDataUrl: string) => void;
  onFaceGazeChange: (gaze: { x: number; y: number } | null) => void;
}

interface BrowserFaceDetectorLike {
  detect: (source: HTMLVideoElement) => Promise<
    Array<{ boundingBox: { x: number; y: number; width: number; height: number } }>
  >;
}

export const VisionPanel: React.FC<VisionPanelProps> = ({
  knownFaces,
  model,
  botName,
  onEnrollFace,
  onDeleteFace,
  onMarkFaceSeen,
  onVisionResult,
  onFaceGazeChange,
}) => {
  const [cameraSource, setCameraSource] = useState<'phone' | 'robot'>('phone');
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [faceBox, setFaceBox] = useState<FaceBox | null>(null);
  const [autoScan, setAutoScan] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<VisionAnalysisResult | null>(null);
  const [customPrompt, setCustomPrompt] = useState('');

  // Face enrollment form state
  const [enrollName, setEnrollName] = useState('');
  const [enrollRelation, setEnrollRelation] = useState('');
  const [enrollNotes, setEnrollNotes] = useState('');
  const [enrollNotice, setEnrollNotice] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const offscreenCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const faceDetectorRef = useRef<BrowserFaceDetectorLike | null>(null);
  const lastResultNameRef = useRef<string | null>(null);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
    setFaceBox(null);
    onFaceGazeChange(null);
  }, [onFaceGazeChange]);

  const startCamera = useCallback(
    async (facing: 'user' | 'environment') => {
      setCameraError(null);
      stopCamera();
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: facing,
            width: { ideal: 640 },
            height: { ideal: 480 },
          },
          audio: false,
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setCameraActive(true);

        // Initialize native Shape Detection FaceDetector if supported by Chrome/Android
        const w = window as unknown as {
          FaceDetector?: new (opts?: { fastMode?: boolean; maxDetectedFaces?: number }) => BrowserFaceDetectorLike;
        };
        if (w.FaceDetector && !faceDetectorRef.current) {
          try {
            faceDetectorRef.current = new w.FaceDetector({
              fastMode: true,
              maxDetectedFaces: 3,
            });
          } catch {
            faceDetectorRef.current = null;
          }
        }
      } catch (err) {
        setCameraError(
          err instanceof Error
            ? `No se pudo abrir la cámara: ${err.message}`
            : 'Permiso de cámara denegado o dispositivo no disponible.'
        );
      }
    },
    [stopCamera]
  );

  // Stop camera on unmount
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  // Real-time local face detection + tracking reticle loop
  useEffect(() => {
    if (!cameraActive) return;
    let active = true;
    let timerId = 0;

    if (!offscreenCanvasRef.current) {
      offscreenCanvasRef.current = document.createElement('canvas');
      offscreenCanvasRef.current.width = 160;
      offscreenCanvasRef.current.height = 120;
    }

    const tick = async () => {
      if (!active) return;
      const video = videoRef.current;
      const overlay = overlayCanvasRef.current;
      if (!video || !overlay || video.readyState < 2 || video.videoWidth === 0) {
        timerId = window.setTimeout(tick, 180);
        return;
      }

      if (overlay.width !== video.videoWidth || overlay.height !== video.videoHeight) {
        overlay.width = video.videoWidth;
        overlay.height = video.videoHeight;
      }

      let detected: FaceBox | null = null;

      if (faceDetectorRef.current) {
        try {
          const faces = await faceDetectorRef.current.detect(video);
          if (faces.length > 0) {
            const bb = faces[0].boundingBox;
            detected = {
              x: bb.x,
              y: bb.y,
              w: bb.width,
              h: bb.height,
              source: 'native',
            };
          }
        } catch {
          faceDetectorRef.current = null;
        }
      }

      // Deterministic YCbCr skin-region face centroid fallback when FaceDetector API is absent
      if (!detected && offscreenCanvasRef.current) {
        const off = offscreenCanvasRef.current;
        const octx = off.getContext('2d', { willReadFrequently: true });
        if (octx) {
          octx.drawImage(video, 0, 0, off.width, off.height);
          const img = octx.getImageData(0, 0, off.width, off.height).data;
          let minX = off.width;
          let minY = off.height;
          let maxX = 0;
          let maxY = 0;
          let count = 0;

          for (let y = 8; y < off.height - 8; y += 2) {
            for (let x = 12; x < off.width - 12; x += 2) {
              const idx = (y * off.width + x) * 4;
              const r = img[idx];
              const g = img[idx + 1];
              const b = img[idx + 2];
              const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
              const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
              if (r > 70 && cb >= 77 && cb <= 127 && cr >= 133 && cr <= 175) {
                count++;
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
              }
            }
          }

          if (count > 55 && maxX - minX > 14 && maxY - minY > 16) {
            const scaleX = video.videoWidth / off.width;
            const scaleY = video.videoHeight / off.height;
            detected = {
              x: minX * scaleX,
              y: minY * scaleY,
              w: (maxX - minX) * scaleX,
              h: Math.min((maxY - minY) * scaleY, (maxX - minX) * scaleX * 1.35),
              source: 'chrominance',
            };
          }
        }
      }

      setFaceBox(detected);

      const ctx = overlay.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, overlay.width, overlay.height);
        if (detected) {
          const cx = (detected.x + detected.w / 2) / overlay.width;
          const cy = (detected.y + detected.h / 2) / overlay.height;
          onFaceGazeChange({
            x: (facingMode === 'user' ? 1 - cx : cx) * 2 - 1,
            y: cy * 2 - 1,
          });

          // Draw clean corner tracking reticle
          const { x, y, w, h } = detected;
          const corner = Math.min(26, w * 0.22, h * 0.22);
          ctx.strokeStyle = '#22D3EE';
          ctx.lineWidth = 3;
          ctx.beginPath();
          // Top-left
          ctx.moveTo(x, y + corner);
          ctx.lineTo(x, y);
          ctx.lineTo(x + corner, y);
          // Top-right
          ctx.moveTo(x + w - corner, y);
          ctx.lineTo(x + w, y);
          ctx.lineTo(x + w, y + corner);
          // Bottom-left
          ctx.moveTo(x, y + h - corner);
          ctx.lineTo(x, y + h);
          ctx.lineTo(x + corner, y + h);
          // Bottom-right
          ctx.moveTo(x + w - corner, y + h);
          ctx.lineTo(x + w, y + h);
          ctx.lineTo(x + w, y + h - corner);
          ctx.stroke();

          const label = lastResultNameRef.current || 'Rostro en seguimiento';
          ctx.fillStyle = 'rgba(7, 9, 14, 0.82)';
          ctx.fillRect(x, Math.max(0, y - 26), Math.max(150, label.length * 8.5), 22);
          ctx.fillStyle = '#67E8F9';
          ctx.font = '12px "JetBrains Mono", monospace';
          ctx.fillText(label, x + 6, Math.max(15, y - 10));
        } else {
          onFaceGazeChange(null);
        }
      }

      timerId = window.setTimeout(tick, 180);
    };

    timerId = window.setTimeout(tick, 200);
    return () => {
      active = false;
      window.clearTimeout(timerId);
    };
  }, [cameraActive, facingMode, onFaceGazeChange]);

  const captureSnapshotDataUrl = useCallback((maxWidth = 640): string | null => {
    const video = videoRef.current;
    if (!video || video.readyState < 2 || video.videoWidth === 0) return null;
    const scale = Math.min(1, maxWidth / video.videoWidth);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.82);
  }, []);

  const runVisionAnalysis = useCallback(
    async (modePrompt: string) => {
      if (isAnalyzing) return;
      const dataUrl = captureSnapshotDataUrl(640);
      if (!dataUrl) {
        setCameraError('Activa la cámara primero para capturar una imagen.');
        return;
      }
      setIsAnalyzing(true);
      setCameraError(null);

      try {
        const imageBase64 = dataUrl.split(',')[1];
        const facesPayload = knownFaces.map((f) => ({
          name: f.name,
          relation: f.relation,
          notes: f.notes,
          avatarBase64: f.avatarDataUrl.includes(',')
            ? f.avatarDataUrl.split(',')[1]
            : '',
          avatarMimeType: 'image/jpeg',
        }));

        const res = await fetch('/api/vision', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            imageBase64,
            imageMimeType: 'image/jpeg',
            prompt: modePrompt,
            knownFaces: facesPayload,
            personality: { botName },
            model,
          }),
        });

        const data = (await res.json()) as VisionAnalysisResult & { error?: string };
        if (!res.ok) throw new Error(data.error || 'Error analizando imagen.');

        setAnalysis(data);
        const firstKnown = data.facesDetected?.find((f) => f.matchedKnownFace);
        if (firstKnown) {
          lastResultNameRef.current = `${firstKnown.name} (${firstKnown.emotion})`;
          onMarkFaceSeen(firstKnown.name);
        } else if (data.facesDetected?.length > 0) {
          lastResultNameRef.current = `Rostro (${data.facesDetected[0].emotion})`;
        } else {
          lastResultNameRef.current = null;
        }

        onVisionResult(data, dataUrl);
      } catch (err) {
        setCameraError(
          err instanceof Error ? err.message : 'Error durante el análisis visual.'
        );
      } finally {
        setIsAnalyzing(false);
      }
    },
    [
      botName,
      captureSnapshotDataUrl,
      isAnalyzing,
      knownFaces,
      model,
      onMarkFaceSeen,
      onVisionResult,
    ]
  );

  // Periodic automatic facial recognition scan when enabled
  useEffect(() => {
    if (!autoScan || !cameraActive) return;
    const id = window.setInterval(() => {
      runVisionAnalysis(
        'Escaneo automático de reconocimiento facial. Identifica si la persona frente a la cámara coincide con algún rostro registrado y detecta su estado de ánimo.'
      );
    }, 9000);
    return () => window.clearInterval(id);
  }, [autoScan, cameraActive, runVisionAnalysis]);

  const handleEnrollCurrentFace = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = enrollName.trim();
    if (!cleanName) {
      setEnrollNotice('Escribe un nombre para registrar este rostro.');
      return;
    }
    const snapshot = captureSnapshotDataUrl(320);
    if (!snapshot) {
      setEnrollNotice('Enciende la cámara antes de capturar un rostro de referencia.');
      return;
    }

    const newFace: KnownFace = {
      id: `face-${Date.now()}`,
      name: cleanName,
      relation: enrollRelation.trim() || 'Conocido',
      notes: enrollNotes.trim(),
      avatarDataUrl: snapshot,
      enrolledAt: new Date().toISOString(),
    };

    onEnrollFace(newFace);
    setEnrollName('');
    setEnrollRelation('');
    setEnrollNotes('');
    setEnrollNotice(`Rostro de ${cleanName} guardado en la memoria visual.`);
    window.setTimeout(() => setEnrollNotice(null), 3500);
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
      {/* Left: Live Camera Stage & Face Tracking */}
      <section className="space-y-4 lg:col-span-7">
        <div className="rounded-2xl border border-slate-800 bg-[#0D111A] p-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-base font-semibold text-slate-100">
                Visión y reconocimiento facial
              </h2>
              <p className="text-xs text-slate-400">
                {cameraActive
                  ? faceBox
                    ? `Rostro detectado (${faceBox.source === 'native' ? 'FaceDetector nativo' : 'seguimiento óptico'})`
                    : 'Cámara activa · Buscando rostro'
                  : 'Cámara detenida'}
              </p>
            </div>

            {/* Source switcher (Phone vs future ESP32-CAM) */}
            <div className="flex items-center gap-1 rounded-lg bg-[#07090E] p-1 border border-slate-800">
              <button
                type="button"
                onClick={() => setCameraSource('phone')}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                  cameraSource === 'phone'
                    ? 'bg-cyan-500/20 text-cyan-200'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Cámara del dispositivo
              </button>
              <button
                type="button"
                onClick={() => {
                  stopCamera();
                  setCameraSource('robot');
                }}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                  cameraSource === 'robot'
                    ? 'bg-cyan-500/20 text-cyan-200'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Cámara ESP32 (Futuro)
              </button>
            </div>
          </div>

          {cameraSource === 'robot' ? (
            <div className="flex min-h-[300px] flex-col items-center justify-center rounded-xl border border-dashed border-slate-700 bg-[#07090E] p-6 text-center space-y-2">
              <Camera className="h-8 w-8 text-slate-500" />
              <p className="text-sm font-medium text-slate-200">
                Canal preparado para cámara integrada en ESP32-S3-CAM
              </p>
              <p className="max-w-md text-xs text-slate-400">
                Cuando el hardware físico cuente con módulo OV2640 / MJPEG stream sobre Wi-Fi, esta vista recibirá los fotogramas directamente desde la IP de la ESP32. Mientras tanto usa la cámara del dispositivo.
              </p>
              <button
                type="button"
                onClick={() => setCameraSource('phone')}
                className="mt-2 min-h-[40px] rounded-lg bg-cyan-500 px-4 py-2 text-xs font-medium text-slate-950 hover:bg-cyan-400"
              >
                Usar cámara del dispositivo
              </button>
            </div>
          ) : (
            <>
              <div className="relative overflow-hidden rounded-xl border border-slate-800 bg-[#04070D] aspect-[4/3]">
                <video
                  ref={videoRef}
                  playsInline
                  muted
                  className={`h-full w-full object-cover ${
                    facingMode === 'user' ? '-scale-x-100' : ''
                  } ${cameraActive ? 'opacity-100' : 'opacity-0'}`}
                />
                <canvas
                  ref={overlayCanvasRef}
                  className={`pointer-events-none absolute inset-0 h-full w-full object-cover ${
                    facingMode === 'user' ? '-scale-x-100' : ''
                  }`}
                />
                {!cameraActive && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
                    <Camera className="h-9 w-9 text-cyan-400/70" />
                    <p className="text-sm text-slate-300">
                      Activa la cámara para seguimiento facial en tiempo real y análisis con Gemini Vision.
                    </p>
                    <button
                      type="button"
                      onClick={() => startCamera(facingMode)}
                      className="min-h-[44px] rounded-xl bg-cyan-500 px-5 py-2.5 text-sm font-medium text-slate-950 hover:bg-cyan-400"
                    >
                      Iniciar cámara
                    </button>
                  </div>
                )}
              </div>

              {cameraError && (
                <p className="rounded-xl border border-rose-500/40 bg-rose-950/30 px-3.5 py-2.5 text-xs text-rose-200">
                  {cameraError}
                </p>
              )}

              {/* Camera Controls */}
              <div className="flex flex-wrap items-center gap-2">
                {cameraActive ? (
                  <button
                    type="button"
                    onClick={stopCamera}
                    className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-4 text-xs font-medium text-slate-200 hover:border-slate-600"
                  >
                    <CameraOff className="h-4 w-4" />
                    Apagar
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => startCamera(facingMode)}
                    className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-cyan-500 px-4 text-xs font-medium text-slate-950 hover:bg-cyan-400"
                  >
                    <Camera className="h-4 w-4" />
                    Encender
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    const next = facingMode === 'user' ? 'environment' : 'user';
                    setFacingMode(next);
                    if (cameraActive) startCamera(next);
                  }}
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-slate-800 bg-slate-900 px-3.5 text-xs font-medium text-slate-300 hover:border-slate-700"
                >
                  <RefreshCw className="h-4 w-4" />
                  {facingMode === 'user' ? 'Frontal' : 'Trasera'}
                </button>

                <button
                  type="button"
                  disabled={!cameraActive || isAnalyzing}
                  onClick={() =>
                    runVisionAnalysis(
                      'Identifica todos los rostros visibles, compáralos con las fotos de referencia de memoria, detecta su estado de ánimo y salúdalos con naturalidad.'
                    )
                  }
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-blue-600 px-4 text-xs font-medium text-white hover:bg-blue-500 disabled:opacity-40"
                >
                  <ScanFace className="h-4 w-4" />
                  {isAnalyzing ? 'Reconociendo...' : 'Reconocer rostro'}
                </button>

                <label className="ml-auto inline-flex min-h-[44px] cursor-pointer items-center gap-2 text-xs text-slate-300">
                  <input
                    type="checkbox"
                    checked={autoScan}
                    onChange={(e) => setAutoScan(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-700 bg-slate-900 accent-cyan-500"
                  />
                  Auto-escaneo (9s)
                </label>
              </div>

              {/* Ask Gemini about current camera frame */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const q =
                    customPrompt.trim() ||
                    'Describe detalladamente qué ves frente a tu cámara y si reconoces algún objeto o persona.';
                  setCustomPrompt('');
                  runVisionAnalysis(q);
                }}
                className="flex items-center gap-2"
              >
                <input
                  type="text"
                  value={customPrompt}
                  onChange={(e) => setCustomPrompt(e.target.value)}
                  placeholder="Pregunta a Gemini sobre lo que ve la cámara..."
                  className="min-h-[44px] flex-1 rounded-xl border border-slate-800 bg-[#07090E] px-3.5 text-xs text-slate-100 placeholder:text-slate-500 focus:border-cyan-500/60 focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={!cameraActive || isAnalyzing}
                  className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-cyan-500/40 bg-cyan-500/15 px-4 text-xs font-medium text-cyan-200 hover:bg-cyan-500/25 disabled:opacity-40 whitespace-nowrap"
                >
                  <Send className="h-3.5 w-3.5" />
                  Analizar
                </button>
              </form>
            </>
          )}
        </div>

        {/* Last Vision Result */}
        {analysis && (
          <div className="rounded-2xl border border-slate-800 bg-[#0D111A] p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-sm font-semibold text-slate-100">
                Último análisis visual
              </h3>
              <span className="font-mono text-xs text-cyan-400">
                {analysis.facesDetected.length} rostro(s) · Ojos: {analysis.expression}
              </span>
            </div>
            <p className="text-sm text-slate-200 leading-relaxed">{analysis.description}</p>

            {analysis.facesDetected.length > 0 && (
              <div className="divide-y divide-slate-800 border-t border-slate-800 pt-2">
                {analysis.facesDetected.map((face, idx) => (
                  <div key={`${face.name}-${idx}`} className="py-2.5 text-xs space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-slate-100">
                        {face.name}{' '}
                        <span className="text-slate-400 font-normal">
                          · {face.matchedKnownFace ? 'Reconocido en memoria' : 'No registrado'}
                        </span>
                      </span>
                      <span className="font-mono text-cyan-300">{face.emotion}</span>
                    </div>
                    <p className="text-slate-400">{face.traits}</p>
                    <p className="text-slate-300">&ldquo;{face.greeting}&rdquo;</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      {/* Right: Known Faces Database & Enrollment */}
      <section className="space-y-4 lg:col-span-5">
        <div className="rounded-2xl border border-slate-800 bg-[#0D111A] p-4 space-y-4">
          <div>
            <h3 className="font-display text-base font-semibold text-slate-100">
              Registrar rostro conocido
            </h3>
            <p className="text-xs text-slate-400">
              Captura una referencia desde la cámara activa para que Gemini identifique a esta persona por su nombre.
            </p>
          </div>

          <form onSubmit={handleEnrollCurrentFace} className="space-y-3">
            <input
              type="text"
              value={enrollName}
              onChange={(e) => setEnrollName(e.target.value)}
              placeholder="Nombre (ej. Carlos)"
              className="min-h-[44px] w-full rounded-xl border border-slate-800 bg-[#07090E] px-3.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-cyan-500/60 focus:outline-none"
            />
            <input
              type="text"
              value={enrollRelation}
              onChange={(e) => setEnrollRelation(e.target.value)}
              placeholder="Relación (ej. Creador, Hermano, Invitado)"
              className="min-h-[44px] w-full rounded-xl border border-slate-800 bg-[#07090E] px-3.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-cyan-500/60 focus:outline-none"
            />
            <input
              type="text"
              value={enrollNotes}
              onChange={(e) => setEnrollNotes(e.target.value)}
              placeholder="Notas opcionales (ej. usa gafas, le gusta la robótica)"
              className="min-h-[44px] w-full rounded-xl border border-slate-800 bg-[#07090E] px-3.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-cyan-500/60 focus:outline-none"
            />

            {enrollNotice && (
              <p className="text-xs text-cyan-300">{enrollNotice}</p>
            )}

            <button
              type="submit"
              disabled={!cameraActive}
              className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-cyan-500 px-4 text-sm font-medium text-slate-950 hover:bg-cyan-400 disabled:opacity-40"
            >
              <UserPlus className="h-4 w-4" />
              Capturar y registrar rostro
            </button>
          </form>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-[#0D111A] p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-sm font-semibold text-slate-100">
              Rostros en memoria
            </h3>
            <span className="font-mono text-xs text-slate-400 tabular-nums">
              {knownFaces.length} registrados
            </span>
          </div>

          {knownFaces.length === 0 ? (
            <p className="py-6 text-center text-xs text-slate-500">
              Aún no has registrado ningún rostro. Enciende la cámara y guarda el primero para probar el reconocimiento facial personalizado.
            </p>
          ) : (
            <ul className="divide-y divide-slate-800">
              {knownFaces.map((face) => (
                <li key={face.id} className="flex items-center gap-3 py-3">
                  <img
                    src={face.avatarDataUrl}
                    alt={`Referencia facial de ${face.name}`}
                    referrerPolicy="no-referrer"
                    className="h-12 w-12 rounded-xl object-cover border border-slate-700 shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-100">
                      {face.name}{' '}
                      <span className="text-xs font-normal text-slate-400">
                        · {face.relation}
                      </span>
                    </p>
                    <p className="truncate text-xs text-slate-400">
                      {face.notes || 'Sin notas adicionales'}
                    </p>
                    {face.lastSeenAt && (
                      <p className="font-mono text-[11px] text-cyan-400/80">
                        Visto:{' '}
                        {new Date(face.lastSeenAt).toLocaleTimeString('es-ES', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => onDeleteFace(face.id)}
                    aria-label={`Eliminar rostro de ${face.name}`}
                    className="flex min-h-[40px] min-w-[40px] items-center justify-center rounded-lg text-slate-500 hover:bg-rose-500/10 hover:text-rose-300"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
};
