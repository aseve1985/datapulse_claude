import React from 'react';
import { motion } from 'motion/react';
import { Database, Loader2, Download, FileText, RefreshCcw, CalendarCheck } from 'lucide-react';
import { useState } from 'react';

interface Stats {
  total: number;
  periodo: string | null;
}

export default function RiExperianSubmodule() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLoad = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/ri-experian/records');
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.details || err.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setStats({ total: data.total, periodo: data.periodo ?? null });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleExport = () => {
    window.location.href = '/api/ri-experian/export';
  };

  // ── Initial load screen ──────────────────────────────────────────────────────
  if (!stats) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center py-20">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full text-center space-y-8"
        >
          <div className="w-16 h-16 bg-zinc-800/60 rounded-3xl flex items-center justify-center mx-auto border border-zinc-700/50">
            <FileText className="w-8 h-8 text-zinc-400" />
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-bold text-white">RI-EXPERIAN</h2>
            <p className="text-zinc-400 text-sm leading-relaxed">
              Régimen Informativo Experian.<br />Generación de reportes para el Bureau de crédito.
            </p>
          </div>
          {error && (
            <div className="text-red-400 text-sm bg-red-900/20 border border-red-500/30 rounded-xl px-4 py-3">
              {error}
            </div>
          )}
          <button
            onClick={handleLoad}
            disabled={loading}
            className="mx-auto flex items-center justify-center gap-2 px-8 py-3 bg-zinc-700 hover:bg-zinc-600 text-white font-bold rounded-xl transition-colors disabled:opacity-50 shadow-lg"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Database className="w-5 h-5" />}
            {loading ? 'Preparando reporte…' : 'Cargar Registros'}
          </button>
        </motion.div>
      </div>
    );
  }

  // ── Main view ────────────────────────────────────────────────────────────────
  return (
    <div className="flex-1 p-6 space-y-5 max-w-full overflow-hidden">

      {/* Stats + actions */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex items-center gap-8">
          <div>
            <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1">Total registros</p>
            <span className="text-3xl font-black text-zinc-200">{stats.total.toLocaleString('es-AR')}</span>
          </div>
          {stats.periodo && (
            <>
              <div className="w-px h-10 bg-slate-700" />
              <div>
                <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1">Mes a presentar</p>
                <div className="flex items-center gap-2">
                  <CalendarCheck className="w-4 h-4 text-emerald-400" />
                  <span className="text-3xl font-black text-emerald-400">{stats.periodo}</span>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleLoad}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-zinc-400 hover:text-zinc-200 hover:bg-slate-800 transition-colors disabled:opacity-30"
            title="Recargar datos"
          >
            <RefreshCcw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Recargar
          </button>
          <button
            onClick={handleExport}
            className="flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm rounded-xl transition-colors shadow-lg"
          >
            <Download className="w-4 h-4" />
            Descargar TXT
          </button>
        </div>
      </div>

      {/* Info card */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
        <p className="text-xs text-zinc-500 leading-relaxed">
          El archivo se genera directamente desde Redshift. El nombre del archivo sigue la nomenclatura{' '}
          <span className="font-mono text-zinc-300">050193.YYYYMMDD.T.txt</span>{' '}
          donde <span className="font-mono text-zinc-300">YYYYMMDD</span> es el período informado ({stats.periodo ?? '—'}).
        </p>
      </div>
    </div>
  );
}
