import React, { useState } from 'react';
import { Download, Plus, Trash2 } from 'lucide-react';
import type { KnownFace, MemoryCategory, MemoryItem } from '../types';

interface MemoryPanelProps {
  memories: MemoryItem[];
  knownFaces: KnownFace[];
  autoMemory: boolean;
  onToggleAutoMemory: (enabled: boolean) => void;
  onAddMemory: (category: MemoryCategory, content: string) => void;
  onDeleteMemory: (id: string) => void;
  onClearMemories: () => void;
  onExportBackup: () => void;
}

const CATEGORIES: Array<{ id: MemoryCategory | 'all'; label: string }> = [
  { id: 'all', label: 'Todos' },
  { id: 'usuario', label: 'Usuario' },
  { id: 'preferencia', label: 'Preferencias' },
  { id: 'hecho', label: 'Hechos' },
  { id: 'rutina', label: 'Rutinas' },
];

export const MemoryPanel: React.FC<MemoryPanelProps> = ({
  memories,
  knownFaces,
  autoMemory,
  onToggleAutoMemory,
  onAddMemory,
  onDeleteMemory,
  onClearMemories,
  onExportBackup,
}) => {
  const [filter, setFilter] = useState<MemoryCategory | 'all'>('all');
  const [category, setCategory] = useState<MemoryCategory>('usuario');
  const [content, setContent] = useState('');

  const visible =
    filter === 'all' ? memories : memories.filter((m) => m.category === filter);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = content.trim();
    if (!clean) return;
    onAddMemory(category, clean);
    setContent('');
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
      {/* Add Memory + Settings */}
      <section className="space-y-4 lg:col-span-5">
        <div className="rounded-2xl border border-slate-800 bg-[#0D111A] p-5 space-y-4">
          <div>
            <h2 className="font-display text-base font-semibold text-slate-100">
              Estructura de memoria
            </h2>
            <p className="text-xs text-slate-400">
              Estos datos se inyectan en el contexto de Gemini para personalizar las respuestas de AstroBot.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs text-slate-400">Categoría</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as MemoryCategory)}
                className="min-h-[44px] w-full rounded-xl border border-slate-800 bg-[#07090E] px-3.5 text-sm text-slate-100 focus:border-cyan-500/60 focus:outline-none"
              >
                <option value="usuario">Usuario</option>
                <option value="preferencia">Preferencia</option>
                <option value="hecho">Hecho</option>
                <option value="rutina">Rutina</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs text-slate-400">Recuerdo</label>
              <textarea
                rows={3}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Ej: Me llamo Diego, estudio ingeniería electrónica y programo robots en Kotlin."
                className="w-full rounded-xl border border-slate-800 bg-[#07090E] p-3.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-cyan-500/60 focus:outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={!content.trim()}
              className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-cyan-500 px-4 text-sm font-medium text-slate-950 hover:bg-cyan-400 disabled:opacity-40"
            >
              <Plus className="h-4 w-4" />
              Guardar en memoria
            </button>
          </form>

          <div className="flex items-center justify-between border-t border-slate-800 pt-4">
            <div>
              <p className="text-sm font-medium text-slate-200">
                Aprendizaje automático
              </p>
              <p className="text-xs text-slate-400">
                Guarda datos relevantes detectados en la conversación.
              </p>
            </div>
            <input
              type="checkbox"
              checked={autoMemory}
              onChange={(e) => onToggleAutoMemory(e.target.checked)}
              aria-label="Activar aprendizaje automático de memoria"
              className="h-5 w-5 rounded border-slate-700 bg-slate-900 accent-cyan-500"
            />
          </div>

          <div className="flex flex-wrap gap-2 border-t border-slate-800 pt-4">
            <button
              type="button"
              onClick={onExportBackup}
              className="inline-flex min-h-[40px] flex-1 items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-3 text-xs font-medium text-slate-200 hover:border-slate-600"
            >
              <Download className="h-3.5 w-3.5" />
              Exportar JSON
            </button>
            <button
              type="button"
              onClick={onClearMemories}
              className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-xl border border-rose-500/30 bg-rose-950/20 px-3 text-xs font-medium text-rose-300 hover:bg-rose-950/40"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Vaciar
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-[#0D111A] p-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Resumen de conocimiento activo</span>
            <span className="font-mono tabular-nums text-cyan-400">
              {memories.length} recuerdos · {knownFaces.length} rostros
            </span>
          </div>
        </div>
      </section>

      {/* Memory List */}
      <section className="rounded-2xl border border-slate-800 bg-[#0D111A] p-5 space-y-4 lg:col-span-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-display text-base font-semibold text-slate-100">
            Recuerdos almacenados
          </h3>

          <div className="flex flex-wrap items-center gap-1 rounded-lg border border-slate-800 bg-[#07090E] p-1">
            {CATEGORIES.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setFilter(c.id)}
                className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                  filter === c.id
                    ? 'bg-cyan-500/20 text-cyan-200'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>

        {visible.length === 0 ? (
          <p className="py-10 text-center text-sm text-slate-500">
            No hay recuerdos en esta categoría.
          </p>
        ) : (
          <ul className="divide-y divide-slate-800">
            {visible.map((item) => (
              <li key={item.id} className="flex items-start justify-between gap-4 py-3.5">
                <div className="space-y-1">
                  <p className="text-sm text-slate-100 leading-relaxed">{item.content}</p>
                  <p className="font-mono text-xs text-slate-500">
                    {item.category} · {item.source === 'auto' ? 'Aprendido' : 'Manual'} ·{' '}
                    {new Date(item.createdAt).toLocaleDateString('es-ES')}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onDeleteMemory(item.id)}
                  aria-label="Eliminar recuerdo"
                  className="flex min-h-[40px] min-w-[40px] shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-rose-500/10 hover:text-rose-300"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
};
