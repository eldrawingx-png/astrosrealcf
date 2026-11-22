import React, { useState } from 'react';
import {
  Bluetooth,
  Cpu,
  Hand,
  Trash2,
  Volume2,
  Wifi,
} from 'lucide-react';
import type {
  AstroExpression,
  ConnectionMode,
  ProtocolPacket,
  RobotCommand,
  RobotSoundId,
  RobotTelemetry,
  ServoTargets,
} from '../types';

interface HardwarePanelProps {
  mode: ConnectionMode;
  connectionState: 'connected' | 'connecting' | 'disconnected' | 'error';
  deviceLabel: string;
  connectionError: string | null;
  expression: AstroExpression;
  servos: ServoTargets;
  ledColor: string;
  telemetry: RobotTelemetry;
  packets: ProtocolPacket[];
  wifiIp: string;
  wifiPort: number;
  wifiProtocol: 'ws' | 'http';
  autonomousBehaviors: boolean;
  onUpdateWifiConfig: (ip: string, port: number, protocol: 'ws' | 'http') => void;
  onActivateSimulator: () => void;
  onConnectBle: () => void;
  onConnectWifi: (ip: string, port: number, protocol: 'ws' | 'http') => void;
  onSendCommand: (cmd: Omit<RobotCommand, 'type' | 'timestamp'>) => void;
  onUpdateSimulatedSensor: (patch: Partial<RobotTelemetry>) => void;
  onTriggerTouch: () => void;
  onToggleAutonomous: (enabled: boolean) => void;
  onClearPackets: () => void;
}

const EXPRESSIONS: Array<{ id: AstroExpression; label: string }> = [
  { id: 'neutral', label: 'Neutral' },
  { id: 'happy', label: 'Feliz' },
  { id: 'curious', label: 'Curioso' },
  { id: 'listening', label: 'Escucha' },
  { id: 'thinking', label: 'Pensando' },
  { id: 'surprised', label: 'Sorpresa' },
  { id: 'love', label: 'Afecto' },
  { id: 'sleepy', label: 'Reposo' },
  { id: 'alert', label: 'Alerta' },
];

const SOUNDS: Array<{ id: RobotSoundId; label: string }> = [
  { id: 'wake', label: 'Despertar' },
  { id: 'confirm', label: 'Confirmación' },
  { id: 'happy', label: 'Alegre' },
  { id: 'curious', label: 'Curioso' },
  { id: 'alert', label: 'Alerta' },
  { id: 'sleep', label: 'Reposo' },
];

const LED_SWATCHES = ['#22D3EE', '#3B82F6', '#38BDF8', '#10B981', '#F59E0B', '#F43F5E'];

export const HardwarePanel: React.FC<HardwarePanelProps> = ({
  mode,
  connectionState,
  deviceLabel,
  connectionError,
  expression,
  servos,
  ledColor,
  telemetry,
  packets,
  wifiIp,
  wifiPort,
  wifiProtocol,
  autonomousBehaviors,
  onUpdateWifiConfig,
  onActivateSimulator,
  onConnectBle,
  onConnectWifi,
  onSendCommand,
  onUpdateSimulatedSensor,
  onTriggerTouch,
  onToggleAutonomous,
  onClearPackets,
}) => {
  const [selectedTab, setSelectedTab] = useState<ConnectionMode>(mode);
  const [ipDraft, setIpDraft] = useState(wifiIp);
  const [portDraft, setPortDraft] = useState(String(wifiPort));
  const [protoDraft, setProtoDraft] = useState<'ws' | 'http'>(wifiProtocol);

  const statusText =
    connectionState === 'connected'
      ? 'Conectado'
      : connectionState === 'connecting'
        ? 'Conectando...'
        : connectionState === 'error'
          ? 'Error de enlace'
          : 'Desconectado';

  const statusClass =
    connectionState === 'connected'
      ? 'text-emerald-400'
      : connectionState === 'connecting'
        ? 'text-amber-300'
        : 'text-rose-400';

  return (
    <div className="space-y-6">
      {/* Top Connection Bar + Transport Switcher */}
      <section className="rounded-2xl border border-slate-800 bg-[#0D111A] p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-lg font-semibold text-slate-100">
              Conexión y simulador ESP32-S3
            </h2>
            <p className="text-xs text-slate-400">
              {deviceLabel} · <span className={statusClass}>{statusText}</span> · Protocolo JSON bidireccional
            </p>
          </div>

          <div className="flex items-center gap-1 rounded-xl border border-slate-800 bg-[#07090E] p-1">
            <button
              type="button"
              onClick={() => {
                setSelectedTab('simulator');
                onActivateSimulator();
              }}
              className={`inline-flex min-h-[38px] items-center gap-1.5 rounded-lg px-3.5 text-xs font-medium transition-colors whitespace-nowrap ${
                selectedTab === 'simulator'
                  ? 'bg-cyan-500/20 text-cyan-200'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Cpu className="h-3.5 w-3.5" />
              Simulador
            </button>
            <button
              type="button"
              onClick={() => setSelectedTab('ble')}
              className={`inline-flex min-h-[38px] items-center gap-1.5 rounded-lg px-3.5 text-xs font-medium transition-colors whitespace-nowrap ${
                selectedTab === 'ble'
                  ? 'bg-cyan-500/20 text-cyan-200'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Bluetooth className="h-3.5 w-3.5" />
              Bluetooth BLE
            </button>
            <button
              type="button"
              onClick={() => setSelectedTab('wifi')}
              className={`inline-flex min-h-[38px] items-center gap-1.5 rounded-lg px-3.5 text-xs font-medium transition-colors whitespace-nowrap ${
                selectedTab === 'wifi'
                  ? 'bg-cyan-500/20 text-cyan-200'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Wifi className="h-3.5 w-3.5" />
              Wi-Fi IP
            </button>
          </div>
        </div>

        {/* Transport-specific controls */}
        {selectedTab === 'ble' && (
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-800 bg-[#07090E] p-4">
            <div className="space-y-1">
              <p className="text-sm font-medium text-slate-100">
                Emparejar ESP32-S3 por Bluetooth Low Energy (GATT UART)
              </p>
              <p className="font-mono text-xs text-slate-400">
                Servicio UUID: 6e400001-b5a3-f393-e0a9-e50e24dcca9e · Prefijos: AstroBot / ESP32
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onConnectBle}
                className="min-h-[44px] rounded-xl bg-cyan-500 px-4 text-xs font-medium text-slate-950 hover:bg-cyan-400 whitespace-nowrap"
              >
                Buscar dispositivos BLE
              </button>
              <button
                type="button"
                onClick={() => {
                  setSelectedTab('simulator');
                  onActivateSimulator();
                }}
                className="min-h-[44px] rounded-xl border border-slate-700 bg-slate-900 px-3.5 text-xs font-medium text-slate-300 hover:text-white whitespace-nowrap"
              >
                Volver a simulador
              </button>
            </div>
          </div>
        )}

        {selectedTab === 'wifi' && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const portNum = Math.max(1, Math.min(65535, Number(portDraft) || 81));
              onUpdateWifiConfig(ipDraft.trim(), portNum, protoDraft);
              onConnectWifi(ipDraft.trim(), portNum, protoDraft);
            }}
            className="grid grid-cols-1 gap-3 rounded-xl border border-slate-800 bg-[#07090E] p-4 sm:grid-cols-12 sm:items-end"
          >
            <div className="sm:col-span-5 space-y-1">
              <label className="text-xs text-slate-400">Dirección IP de ESP32-S3</label>
              <input
                type="text"
                value={ipDraft}
                onChange={(e) => setIpDraft(e.target.value)}
                placeholder="192.168.1.50"
                className="min-h-[42px] w-full rounded-lg border border-slate-800 bg-[#0D111A] px-3 font-mono text-xs text-slate-100 focus:border-cyan-500/60 focus:outline-none"
              />
            </div>
            <div className="sm:col-span-2 space-y-1">
              <label className="text-xs text-slate-400">Puerto</label>
              <input
                type="number"
                value={portDraft}
                onChange={(e) => setPortDraft(e.target.value)}
                className="min-h-[42px] w-full rounded-lg border border-slate-800 bg-[#0D111A] px-3 font-mono text-xs text-slate-100 focus:border-cyan-500/60 focus:outline-none"
              />
            </div>
            <div className="sm:col-span-2 space-y-1">
              <label className="text-xs text-slate-400">Protocolo</label>
              <select
                value={protoDraft}
                onChange={(e) => setProtoDraft(e.target.value as 'ws' | 'http')}
                className="min-h-[42px] w-full rounded-lg border border-slate-800 bg-[#0D111A] px-2.5 text-xs text-slate-100 focus:border-cyan-500/60 focus:outline-none"
              >
                <option value="ws">WebSocket</option>
                <option value="http">HTTP JSON</option>
              </select>
            </div>
            <div className="sm:col-span-3">
              <button
                type="submit"
                className="min-h-[42px] w-full rounded-lg bg-cyan-500 px-4 text-xs font-medium text-slate-950 hover:bg-cyan-400"
              >
                Conectar Wi-Fi
              </button>
            </div>
          </form>
        )}

        {connectionError && (
          <p className="rounded-xl border border-amber-500/40 bg-amber-950/25 px-3.5 py-2.5 text-xs text-amber-200">
            {connectionError}
          </p>
        )}
      </section>

      {/* Main Split: Robot Simulator Twin + Actuators & JSON Protocol */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Virtual ESP32-S3 Robot Twin & Sensors */}
        <section className="space-y-4 lg:col-span-5">
          <div className="rounded-2xl border border-slate-800 bg-[#0D111A] p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-display text-sm font-semibold text-slate-100">
                  Gemelo cinemático del robot
                </h3>
                <p className="text-xs text-slate-400">
                  Estado local: {telemetry.autonomousState}
                </p>
              </div>
              <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-slate-300">
                <input
                  type="checkbox"
                  checked={autonomousBehaviors}
                  onChange={(e) => onToggleAutonomous(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-700 bg-slate-900 accent-cyan-500"
                />
                Autonomía local
              </label>
            </div>

            {/* Interactive SVG Robot Chassis reacting live to servos, expression & LED */}
            <div className="flex items-center justify-center rounded-xl border border-slate-800 bg-[#060910] py-6">
              <svg
                viewBox="0 0 260 230"
                className="h-52 w-60"
                aria-label="Simulador visual del robot AstroBot"
              >
                {/* Floor shadow */}
                <ellipse cx="130" cy="212" rx="64" ry="10" fill="rgba(34,211,238,0.09)" />

                {/* Left Arm */}
                <g
                  transform={`translate(66, 134) rotate(${Math.round(
                    (servos.leftArm - 35) * 0.75
                  )})`}
                  style={{ transition: 'transform 220ms cubic-bezier(0.16, 1, 0.3, 1)' }}
                >
                  <rect
                    x="-16"
                    y="-8"
                    width="18"
                    height="48"
                    rx="9"
                    fill="#1E293B"
                    stroke="#334155"
                    strokeWidth="1.5"
                  />
                  <circle cx="-7" cy="36" r="5" fill={ledColor} opacity="0.85" />
                </g>

                {/* Right Arm */}
                <g
                  transform={`translate(194, 134) rotate(${Math.round(
                    -(servos.rightArm - 35) * 0.75
                  )})`}
                  style={{ transition: 'transform 220ms cubic-bezier(0.16, 1, 0.3, 1)' }}
                >
                  <rect
                    x="-2"
                    y="-8"
                    width="18"
                    height="48"
                    rx="9"
                    fill="#1E293B"
                    stroke="#334155"
                    strokeWidth="1.5"
                  />
                  <circle cx="7" cy="36" r="5" fill={ledColor} opacity="0.85" />
                </g>

                {/* Body Torso */}
                <rect
                  x="76"
                  y="118"
                  width="108"
                  height="78"
                  rx="26"
                  fill="#0F172A"
                  stroke="#334155"
                  strokeWidth="2"
                />
                {/* Chest Core LED */}
                <circle
                  cx="130"
                  cy="154"
                  r="14"
                  fill="none"
                  stroke={ledColor}
                  strokeWidth="3"
                  opacity="0.9"
                />
                <circle cx="130" cy="154" r="6" fill={ledColor} opacity="0.55" />

                {/* Feet */}
                <rect x="88" y="190" width="32" height="16" rx="8" fill="#1E293B" />
                <rect x="140" y="190" width="32" height="16" rx="8" fill="#1E293B" />

                {/* Articulated Head (Pan + Tilt) */}
                <g
                  transform={`translate(${130 + servos.headPan * 0.38}, ${
                    68 - servos.headTilt * 0.35
                  }) rotate(${servos.headPan * 0.22})`}
                  style={{ transition: 'transform 220ms cubic-bezier(0.16, 1, 0.3, 1)' }}
                >
                  {/* Antenna */}
                  <line
                    x1="0"
                    y1="-44"
                    x2="0"
                    y2="-58"
                    stroke="#475569"
                    strokeWidth="3"
                    strokeLinecap="round"
                  />
                  <circle cx="0" cy="-61" r="5" fill={ledColor} />

                  {/* Head Shell */}
                  <rect
                    x="-62"
                    y="-44"
                    width="124"
                    height="84"
                    rx="30"
                    fill="#1E293B"
                    stroke="#475569"
                    strokeWidth="2"
                  />
                  {/* OLED Visor */}
                  <rect
                    x="-50"
                    y="-31"
                    width="100"
                    height="58"
                    rx="18"
                    fill="#030712"
                    stroke={ledColor}
                    strokeWidth="1.5"
                    strokeOpacity="0.6"
                  />
                  {/* Mini Eyes */}
                  {expression === 'happy' ? (
                    <>
                      <path
                        d="M -30 0 Q -20 -13 -10 0"
                        fill="none"
                        stroke={ledColor}
                        strokeWidth="4.5"
                        strokeLinecap="round"
                      />
                      <path
                        d="M 10 0 Q 20 -13 30 0"
                        fill="none"
                        stroke={ledColor}
                        strokeWidth="4.5"
                        strokeLinecap="round"
                      />
                    </>
                  ) : expression === 'sleepy' ? (
                    <>
                      <rect x="-32" y="-3" width="22" height="5" rx="2.5" fill={ledColor} />
                      <rect x="10" y="-3" width="22" height="5" rx="2.5" fill={ledColor} />
                    </>
                  ) : (
                    <>
                      <rect x="-30" y="-14" width="18" height="26" rx="9" fill={ledColor} />
                      <rect x="12" y="-14" width="18" height="26" rx="9" fill={ledColor} />
                    </>
                  )}
                </g>
              </svg>
            </div>

            {/* Telemetry Metrics Grid */}
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="rounded-xl border border-slate-800 bg-[#07090E] p-3">
                <p className="text-slate-400">Distancia ultrasónica</p>
                <p className="mt-1 font-mono text-lg font-semibold text-slate-100 tabular-nums">
                  {telemetry.distanceCm} <span className="text-xs text-slate-500">cm</span>
                </p>
              </div>
              <div className="rounded-xl border border-slate-800 bg-[#07090E] p-3">
                <p className="text-slate-400">Batería Li-Ion</p>
                <p className="mt-1 font-mono text-lg font-semibold text-slate-100 tabular-nums">
                  {telemetry.batteryPct} <span className="text-xs text-slate-500">%</span>
                </p>
              </div>
              <div className="rounded-xl border border-slate-800 bg-[#07090E] p-3">
                <p className="text-slate-400">Temperatura MCU</p>
                <p className="mt-1 font-mono text-lg font-semibold text-slate-100 tabular-nums">
                  {telemetry.temperatureC.toFixed(1)}{' '}
                  <span className="text-xs text-slate-500">°C</span>
                </p>
              </div>
              <div className="rounded-xl border border-slate-800 bg-[#07090E] p-3">
                <p className="text-slate-400">Tiempo activo</p>
                <p className="mt-1 font-mono text-lg font-semibold text-slate-100 tabular-nums">
                  {formatUptime(telemetry.uptimeSec)}
                </p>
              </div>
            </div>

            {/* Interactive Virtual Sensor Controls (for testing ESP32 local reactions) */}
            <div className="space-y-3 border-t border-slate-800 pt-3">
              <p className="text-xs font-medium text-slate-300">
                Estímulos de sensores (prueban reacción autónoma local sin Gemini)
              </p>

              <div className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-400">Sensor ultrasónico (alerta &lt; 24 cm)</span>
                  <span className="font-mono text-cyan-300 tabular-nums">
                    {telemetry.distanceCm} cm
                  </span>
                </div>
                <input
                  type="range"
                  min={5}
                  max={200}
                  value={telemetry.distanceCm}
                  onChange={(e) =>
                    onUpdateSimulatedSensor({ distanceCm: Number(e.target.value) })
                  }
                  className="w-full accent-cyan-500"
                />
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-400">Luz ambiental (reposo &lt; 15%)</span>
                  <span className="font-mono text-cyan-300 tabular-nums">
                    {telemetry.lightLevel}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={telemetry.lightLevel}
                  onChange={(e) =>
                    onUpdateSimulatedSensor({ lightLevel: Number(e.target.value) })
                  }
                  className="w-full accent-cyan-500"
                />
              </div>

              <button
                type="button"
                onClick={onTriggerTouch}
                className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-cyan-500/40 bg-cyan-500/15 px-4 text-xs font-medium text-cyan-200 hover:bg-cyan-500/25"
              >
                <Hand className="h-4 w-4" />
                Simular toque capacitivo en la cabeza
              </button>
            </div>
          </div>
        </section>

        {/* Right: Actuators Deck + Live Bidirectional JSON Console */}
        <section className="space-y-4 lg:col-span-7">
          <div className="rounded-2xl border border-slate-800 bg-[#0D111A] p-5 space-y-5">
            <div>
              <h3 className="font-display text-sm font-semibold text-slate-100">
                Control de actuadores y expresiones
              </h3>
              <p className="text-xs text-slate-400">
                Cada comando se serializa a JSON y se envía al transporte activo.
              </p>
            </div>

            {/* Expressions */}
            <div className="space-y-2">
              <p className="text-xs text-slate-400">Ojos OLED</p>
              <div className="flex flex-wrap gap-1.5">
                {EXPRESSIONS.map((e) => (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() =>
                      onSendCommand({ source: 'user', expression: e.id, sound: 'confirm' })
                    }
                    className={`min-h-[38px] rounded-lg px-3 text-xs font-medium transition-colors whitespace-nowrap ${
                      expression === e.id
                        ? 'bg-cyan-500 text-slate-950'
                        : 'border border-slate-800 bg-slate-900 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    {e.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Servomotors */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <ServoSlider
                label="Cabeza Pan (horizontal)"
                min={-45}
                max={45}
                value={servos.headPan}
                onChange={(v) =>
                  onSendCommand({ source: 'user', servos: { headPan: v } })
                }
              />
              <ServoSlider
                label="Cabeza Tilt (vertical)"
                min={-30}
                max={30}
                value={servos.headTilt}
                onChange={(v) =>
                  onSendCommand({ source: 'user', servos: { headTilt: v } })
                }
              />
              <ServoSlider
                label="Servo Brazo Izquierdo"
                min={0}
                max={180}
                value={servos.leftArm}
                onChange={(v) =>
                  onSendCommand({ source: 'user', servos: { leftArm: v } })
                }
              />
              <ServoSlider
                label="Servo Brazo Derecho"
                min={0}
                max={180}
                value={servos.rightArm}
                onChange={(v) =>
                  onSendCommand({ source: 'user', servos: { rightArm: v } })
                }
              />
            </div>

            {/* LED & Sounds */}
            <div className="grid grid-cols-1 gap-4 border-t border-slate-800 pt-4 sm:grid-cols-2">
              <div className="space-y-2">
                <p className="text-xs text-slate-400">Anillo LED RGB</p>
                <div className="flex items-center gap-2">
                  {LED_SWATCHES.map((hex) => (
                    <button
                      key={hex}
                      type="button"
                      aria-label={`Color LED ${hex}`}
                      onClick={() => onSendCommand({ source: 'user', ledColor: hex })}
                      className={`h-9 w-9 rounded-lg border-2 transition-transform ${
                        ledColor === hex
                          ? 'scale-105 border-white'
                          : 'border-slate-800 hover:border-slate-500'
                      }`}
                      style={{ backgroundColor: hex }}
                    />
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-xs text-slate-400">Sonidos del zumbador / altavoz</p>
                <div className="flex flex-wrap gap-1.5">
                  {SOUNDS.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => onSendCommand({ source: 'user', sound: s.id })}
                      className="inline-flex min-h-[36px] items-center gap-1 rounded-lg border border-slate-800 bg-slate-900 px-2.5 text-xs text-slate-300 hover:border-cyan-500/40 hover:text-cyan-200"
                    >
                      <Volume2 className="h-3 w-3" />
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Bidirectional JSON Protocol Monitor */}
          <div className="rounded-2xl border border-slate-800 bg-[#0D111A] p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-display text-sm font-semibold text-slate-100">
                  Monitor de protocolo JSON
                </h3>
                <p className="text-xs text-slate-400">
                  Tramas TX/RX en tiempo real hacia y desde la ESP32-S3
                </p>
              </div>
              <button
                type="button"
                onClick={onClearPackets}
                className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900 px-3 text-xs text-slate-400 hover:text-slate-200"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Limpiar
              </button>
            </div>

            <div className="h-56 overflow-y-auto rounded-xl border border-slate-800 bg-[#06080D] p-3 font-mono text-xs space-y-1.5">
              {packets.length === 0 ? (
                <p className="text-slate-500">
                  Envía una expresión, mueve un servo o activa un sensor para inspeccionar el tráfico JSON.
                </p>
              ) : (
                packets.map((pkt) => (
                  <div
                    key={pkt.id}
                    className="flex items-start gap-2 border-b border-slate-900 pb-1.5 last:border-b-0"
                  >
                    <span className="shrink-0 text-slate-500 tabular-nums">
                      {pkt.timestamp}
                    </span>
                    <span
                      className={`shrink-0 font-semibold ${
                        pkt.direction === 'TX' ? 'text-cyan-400' : 'text-emerald-400'
                      }`}
                    >
                      {pkt.direction}
                    </span>
                    <span className="break-all text-slate-300">{pkt.payload}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

interface ServoSliderProps {
  label: string;
  min: number;
  max: number;
  value: number;
  onChange: (val: number) => void;
}

const ServoSlider: React.FC<ServoSliderProps> = ({ label, min, max, value, onChange }) => (
  <div className="space-y-1.5">
    <div className="flex items-center justify-between text-xs">
      <span className="text-slate-300">{label}</span>
      <span className="font-mono text-cyan-300 tabular-nums">
        {value > 0 && min < 0 ? `+${value}` : value}°
      </span>
    </div>
    <input
      type="range"
      min={min}
      max={max}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="w-full accent-cyan-500"
    />
  </div>
);

function formatUptime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
