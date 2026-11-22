import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  AstroExpression,
  ConnectionMode,
  ProtocolPacket,
  RobotCommand,
  RobotSoundId,
  RobotTelemetry,
  ServoTargets,
} from '../types';
import { playRobotSound } from '../utils/robotAudio';

// Nordic UART Service UUIDs commonly used on ESP32-S3 BLE firmware
const BLE_SERVICE_UUID = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
const BLE_TX_CHAR_UUID = '6e400002-b5a3-f393-e0a9-e50e24dcca9e';
const BLE_RX_CHAR_UUID = '6e400003-b5a3-f393-e0a9-e50e24dcca9e';

interface BluetoothDeviceLike {
  id: string;
  name?: string;
  gatt?: {
    connected: boolean;
    connect: () => Promise<{
      getPrimaryService: (uuid: string) => Promise<{
        getCharacteristic: (uuid: string) => Promise<{
          writeValue: (data: BufferSource) => Promise<void>;
          startNotifications: () => Promise<void>;
          addEventListener: (type: string, listener: (ev: Event) => void) => void;
          value?: DataView;
        }>;
      }>;
    }>;
    disconnect: () => void;
  };
  addEventListener: (type: string, listener: () => void) => void;
}

interface NavigatorWithBluetooth extends Navigator {
  bluetooth?: {
    requestDevice: (options: {
      acceptAllDevices?: boolean;
      filters?: Array<{ namePrefix?: string; services?: string[] }>;
      optionalServices?: string[];
    }) => Promise<BluetoothDeviceLike>;
  };
}

const DEFAULT_SERVOS: ServoTargets = {
  headPan: 0,
  headTilt: 4,
  leftArm: 35,
  rightArm: 35,
};

const DEFAULT_TELEMETRY: RobotTelemetry = {
  distanceCm: 72,
  touchActive: false,
  lightLevel: 68,
  batteryPct: 96,
  temperatureC: 32.4,
  rssiDbm: -48,
  uptimeSec: 0,
  autonomousState: 'Espera atenta',
};

export interface UseRobotHardwareOptions {
  soundEffects: boolean;
  autonomousBehaviors: boolean;
  wifiIp: string;
  wifiPort: number;
  wifiProtocol: 'ws' | 'http';
}

export function useRobotHardware(options: UseRobotHardwareOptions) {
  const { soundEffects, autonomousBehaviors, wifiIp, wifiPort, wifiProtocol } = options;

  const [mode, setMode] = useState<ConnectionMode>('simulator');
  const [connectionState, setConnectionState] = useState<
    'connected' | 'connecting' | 'disconnected' | 'error'
  >('connected');
  const [deviceLabel, setDeviceLabel] = useState<string>('ESP32-S3 Virtual (Simulador)');
  const [connectionError, setConnectionError] = useState<string | null>(null);

  const [expression, setExpression] = useState<AstroExpression>('happy');
  const [servos, setServos] = useState<ServoTargets>(DEFAULT_SERVOS);
  const [ledColor, setLedColor] = useState<string>('#22D3EE');
  const [telemetry, setTelemetry] = useState<RobotTelemetry>(DEFAULT_TELEMETRY);
  const [packets, setPackets] = useState<ProtocolPacket[]>([]);

  const bleDeviceRef = useRef<BluetoothDeviceLike | null>(null);
  const bleTxCharRef = useRef<{ writeValue: (data: BufferSource) => Promise<void> } | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const lastInteractionRef = useRef<number>(Date.now());
  const soundEnabledRef = useRef(soundEffects);
  soundEnabledRef.current = soundEffects;

  const pushPacket = useCallback(
    (direction: 'TX' | 'RX', transport: ConnectionMode, payloadObj: unknown) => {
      const payload =
        typeof payloadObj === 'string' ? payloadObj : JSON.stringify(payloadObj);
      const packet: ProtocolPacket = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        direction,
        transport,
        timestamp: new Date().toLocaleTimeString('es-ES', {
          hour12: false,
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        }),
        payload,
      };
      setPackets((prev) => [packet, ...prev].slice(0, 60));
    },
    []
  );

  const sendCommand = useCallback(
    async (partial: Omit<RobotCommand, 'type' | 'timestamp'>) => {
      lastInteractionRef.current = Date.now();
      const cmd: RobotCommand = {
        type: 'cmd',
        timestamp: new Date().toISOString(),
        ...partial,
      };

      if (cmd.expression) setExpression(cmd.expression);
      if (cmd.ledColor) setLedColor(cmd.ledColor);
      if (cmd.servos) {
        setServos((prev) => ({
          headPan: clamp(cmd.servos?.headPan ?? prev.headPan, -45, 45),
          headTilt: clamp(cmd.servos?.headTilt ?? prev.headTilt, -30, 30),
          leftArm: clamp(cmd.servos?.leftArm ?? prev.leftArm, 0, 180),
          rightArm: clamp(cmd.servos?.rightArm ?? prev.rightArm, 0, 180),
        }));
      }
      if (cmd.sound && cmd.sound !== 'none') {
        playRobotSound(cmd.sound, soundEnabledRef.current);
      }

      const jsonPayload = JSON.stringify({
        type: 'cmd',
        src: cmd.source,
        expr: cmd.expression,
        snd: cmd.sound,
        srv: cmd.servos,
        led: cmd.ledColor,
      });

      pushPacket('TX', mode, jsonPayload);

      // Dispatch over active hardware transport
      if (mode === 'ble' && bleTxCharRef.current) {
        try {
          const encoded = new TextEncoder().encode(jsonPayload + '\n');
          await bleTxCharRef.current.writeValue(encoded);
        } catch (err) {
          setConnectionError(
            err instanceof Error ? `Error BLE TX: ${err.message}` : 'Error enviando por BLE'
          );
        }
      } else if (mode === 'wifi') {
        if (wifiProtocol === 'ws' && wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(jsonPayload);
        } else if (wifiProtocol === 'http' && connectionState === 'connected') {
          try {
            const res = await fetch(`http://${wifiIp}:${wifiPort}/command`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: jsonPayload,
            });
            if (res.ok) {
              const ack = await res.text();
              pushPacket('RX', 'wifi', ack || '{"ok":true}');
            }
          } catch (err) {
            setConnectionError(
              err instanceof Error
                ? `Sin respuesta HTTP en ${wifiIp}:${wifiPort}: ${err.message}`
                : 'Error enviando comando HTTP a ESP32.'
            );
          }
        }
      } else if (mode === 'simulator') {
        // Virtual ESP32-S3 deterministic ACK
        setTimeout(() => {
          pushPacket('RX', 'simulator', {
            type: 'ack',
            ok: true,
            expr: cmd.expression ?? 'keep',
            ms: 4,
          });
        }, 35);
      }
    },
    [mode, wifiProtocol, wifiIp, wifiPort, connectionState, pushPacket]
  );

  // Switch back to simulator cleanly
  const activateSimulator = useCallback(() => {
    wsRef.current?.close();
    wsRef.current = null;
    if (bleDeviceRef.current?.gatt?.connected) {
      bleDeviceRef.current.gatt.disconnect();
    }
    bleTxCharRef.current = null;
    setMode('simulator');
    setConnectionState('connected');
    setDeviceLabel('ESP32-S3 Virtual (Simulador)');
    setConnectionError(null);
    pushPacket('RX', 'simulator', {
      type: 'status',
      device: 'ESP32-S3-SIM',
      ready: true,
    });
  }, [pushPacket]);

  // Real Web Bluetooth BLE scan & connect for ESP32-S3
  const connectBle = useCallback(async () => {
    setConnectionError(null);
    const nav = navigator as NavigatorWithBluetooth;
    if (!nav.bluetooth) {
      setConnectionError(
        'Web Bluetooth no está disponible en este navegador o contexto embebido. Usa Chrome en Android/Desktop con HTTPS o prueba con el Simulador ESP32-S3.'
      );
      return;
    }

    try {
      setMode('ble');
      setConnectionState('connecting');
      const device = await nav.bluetooth.requestDevice({
        filters: [
          { namePrefix: 'AstroBot' },
          { namePrefix: 'ESP32' },
          { services: [BLE_SERVICE_UUID] },
        ],
        optionalServices: [BLE_SERVICE_UUID],
      });

      bleDeviceRef.current = device;
      device.addEventListener('gattserverdisconnected', () => {
        setConnectionState('disconnected');
        bleTxCharRef.current = null;
        setConnectionError('ESP32-S3 desconectada por Bluetooth BLE.');
      });

      if (!device.gatt) {
        throw new Error('El dispositivo seleccionado no expone servidor GATT.');
      }

      const server = await device.gatt.connect();
      const service = await server.getPrimaryService(BLE_SERVICE_UUID);
      const txChar = await service.getCharacteristic(BLE_TX_CHAR_UUID);
      bleTxCharRef.current = txChar;

      try {
        const rxChar = await service.getCharacteristic(BLE_RX_CHAR_UUID);
        await rxChar.startNotifications();
        rxChar.addEventListener('characteristicvaluechanged', (ev: Event) => {
          const target = ev.target as { value?: DataView } | null;
          if (!target?.value) return;
          const text = new TextDecoder().decode(target.value);
          pushPacket('RX', 'ble', text);
          try {
            const parsed = JSON.parse(text);
            if (parsed.type === 'telemetry') {
              setTelemetry((prev) => ({
                ...prev,
                distanceCm: parsed.distCm ?? prev.distanceCm,
                touchActive: Boolean(parsed.touch ?? prev.touchActive),
                batteryPct: parsed.batt ?? prev.batteryPct,
                temperatureC: parsed.tempC ?? prev.temperatureC,
              }));
            }
          } catch {
            // Raw text packet already logged
          }
        });
      } catch {
        // RX notifications optional if ESP32 firmware only implements TX
      }

      setConnectionState('connected');
      setDeviceLabel(device.name || 'ESP32-S3 BLE');
      playRobotSound('confirm', soundEnabledRef.current);
      pushPacket('RX', 'ble', { type: 'ble_connected', name: device.name || device.id });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'No se pudo emparejar con ESP32-S3.';
      setConnectionState('error');
      setConnectionError(msg);
    }
  }, [pushPacket]);

  // Real Wi-Fi WebSocket or HTTP connection to ESP32-S3 IP
  const connectWifi = useCallback(
    async (ip: string, port: number, protocol: 'ws' | 'http') => {
      setConnectionError(null);
      wsRef.current?.close();
      wsRef.current = null;
      setMode('wifi');
      setConnectionState('connecting');

      if (protocol === 'ws') {
        try {
          const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws';
          const url = `${scheme}://${ip}:${port}`;
          const socket = new WebSocket(url);
          wsRef.current = socket;

          const timeout = window.setTimeout(() => {
            if (socket.readyState !== WebSocket.OPEN) {
              socket.close();
              setConnectionState('error');
              setConnectionError(
                `Tiempo de espera agotado conectando a ${url}. Verifica que tu ESP32-S3 esté en la misma red y acepte WebSocket.`
              );
            }
          }, 5000);

          socket.onopen = () => {
            window.clearTimeout(timeout);
            setConnectionState('connected');
            setDeviceLabel(`ESP32-S3 Wi-Fi (${ip}:${port})`);
            playRobotSound('confirm', soundEnabledRef.current);
            pushPacket('RX', 'wifi', { type: 'wifi_connected', url });
          };

          socket.onmessage = (event) => {
            const raw = String(event.data);
            pushPacket('RX', 'wifi', raw);
            try {
              const parsed = JSON.parse(raw);
              if (parsed.type === 'telemetry') {
                setTelemetry((prev) => ({
                  ...prev,
                  distanceCm: parsed.distCm ?? prev.distanceCm,
                  touchActive: Boolean(parsed.touch ?? prev.touchActive),
                  batteryPct: parsed.batt ?? prev.batteryPct,
                  temperatureC: parsed.tempC ?? prev.temperatureC,
                  rssiDbm: parsed.rssi ?? prev.rssiDbm,
                }));
              }
            } catch {
              // Non-JSON message logged as-is
            }
          };

          socket.onerror = () => {
            window.clearTimeout(timeout);
            setConnectionState('error');
            setConnectionError(
              `No se pudo abrir WebSocket en ${url}. Si esta app corre en HTTPS, la red local requiere WSS o usar el Simulador.`
            );
          };

          socket.onclose = () => {
            window.clearTimeout(timeout);
            setConnectionState((prev) => (prev === 'error' ? 'error' : 'disconnected'));
          };
        } catch (err) {
          setConnectionState('error');
          setConnectionError(
            err instanceof Error ? err.message : 'Error inicializando conexión Wi-Fi.'
          );
        }
      } else {
        try {
          const controller = new AbortController();
          const timer = window.setTimeout(() => controller.abort(), 4000);
          const res = await fetch(`http://${ip}:${port}/status`, {
            signal: controller.signal,
          });
          window.clearTimeout(timer);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const text = await res.text();
          setConnectionState('connected');
          setDeviceLabel(`ESP32-S3 HTTP (${ip}:${port})`);
          pushPacket('RX', 'wifi', text || '{"status":"ok"}');
          playRobotSound('confirm', soundEnabledRef.current);
        } catch (err) {
          setConnectionState('error');
          setConnectionError(
            `No se alcanzó http://${ip}:${port}/status (${err instanceof Error ? err.message : 'sin respuesta'}).`
          );
        }
      }
    },
    [pushPacket]
  );

  // Simulator sensor triggers (also tests local autonomous ESP32 behavior without Gemini!)
  const updateSimulatedSensor = useCallback(
    (patch: Partial<RobotTelemetry>) => {
      setTelemetry((prev) => {
        const next = { ...prev, ...patch };
        if (mode === 'simulator') {
          pushPacket('RX', 'simulator', {
            type: 'telemetry',
            distCm: next.distanceCm,
            touch: next.touchActive,
            light: next.lightLevel,
            batt: next.batteryPct,
            tempC: next.temperatureC,
          });
        }
        return next;
      });

      // Local autonomous ESP32 reaction (independent of Gemini!)
      if (autonomousBehaviors && mode === 'simulator') {
        if (typeof patch.distanceCm === 'number' && patch.distanceCm < 24) {
          setTelemetry((prev) => ({
            ...prev,
            autonomousState: 'Reacción local: objeto cercano',
          }));
          sendCommand({
            source: 'autonomous',
            expression: 'surprised',
            sound: 'curious',
            servos: { headTilt: 14, leftArm: 115, rightArm: 115 },
            ledColor: '#F59E0B',
          });
        } else if (typeof patch.distanceCm === 'number' && patch.distanceCm >= 24) {
          setTelemetry((prev) => ({
            ...prev,
            autonomousState: 'Espera atenta',
          }));
        }

        if (typeof patch.lightLevel === 'number' && patch.lightLevel < 15) {
          setTelemetry((prev) => ({
            ...prev,
            autonomousState: 'Reacción local: baja luz (reposo)',
          }));
          sendCommand({
            source: 'autonomous',
            expression: 'sleepy',
            sound: 'sleep',
            servos: { headTilt: -12, leftArm: 15, rightArm: 15 },
            ledColor: '#3B82F6',
          });
        }
      }
    },
    [autonomousBehaviors, mode, pushPacket, sendCommand]
  );

  const triggerTouchInteraction = useCallback(() => {
    setTelemetry((prev) => ({
      ...prev,
      touchActive: true,
      autonomousState: 'Reacción táctil local',
    }));
    pushPacket('RX', mode, { type: 'sensor', sensor: 'touch_head', pressed: true });

    if (autonomousBehaviors) {
      const happyExpr: AstroExpression = Math.random() > 0.35 ? 'happy' : 'love';
      sendCommand({
        source: 'autonomous',
        expression: happyExpr,
        sound: 'happy',
        servos: {
          headPan: Math.random() > 0.5 ? 12 : -12,
          headTilt: 10,
          leftArm: 130,
          rightArm: 130,
        },
        ledColor: happyExpr === 'love' ? '#38BDF8' : '#22D3EE',
      });
    }

    window.setTimeout(() => {
      setTelemetry((prev) => ({
        ...prev,
        touchActive: false,
        autonomousState: 'Espera atenta',
      }));
    }, 1800);
  }, [autonomousBehaviors, mode, pushPacket, sendCommand]);

  // Simulator telemetry heartbeat & autonomous idle animations
  useEffect(() => {
    const interval = window.setInterval(() => {
      setTelemetry((prev) => ({
        ...prev,
        uptimeSec: prev.uptimeSec + 1,
        temperatureC: Number((31.8 + Math.sin(prev.uptimeSec / 14) * 0.9).toFixed(1)),
      }));

      // Autonomous idle micro-look every ~12 seconds if undisturbed
      const idleMs = Date.now() - lastInteractionRef.current;
      if (autonomousBehaviors && mode === 'simulator' && idleMs > 12000) {
        lastInteractionRef.current = Date.now() - 4000;
        const randomPan = Math.round((Math.random() - 0.5) * 34);
        const randomTilt = Math.round((Math.random() - 0.3) * 14);
        setServos((prev) => ({
          ...prev,
          headPan: randomPan,
          headTilt: randomTilt,
        }));
        setExpression((curr) =>
          curr === 'thinking' || curr === 'listening' || curr === 'speaking'
            ? curr
            : idleMs > 45000
              ? 'sleepy'
              : 'neutral'
        );
      }
    }, 1000);

    return () => window.clearInterval(interval);
  }, [autonomousBehaviors, mode]);

  const clearPackets = useCallback(() => setPackets([]), []);

  return {
    mode,
    connectionState,
    deviceLabel,
    connectionError,
    expression,
    setExpression,
    servos,
    setServos,
    ledColor,
    setLedColor,
    telemetry,
    packets,
    sendCommand,
    activateSimulator,
    connectBle,
    connectWifi,
    updateSimulatedSensor,
    triggerTouchInteraction,
    clearPackets,
  };
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(v)));
}
