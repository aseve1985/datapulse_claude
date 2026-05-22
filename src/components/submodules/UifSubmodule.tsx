import React, { useState, useMemo, useCallback } from 'react';
import { motion } from 'motion/react';
import {
  Database, Loader2, ShieldAlert, CheckCircle2,
  Clock, Filter, X, RefreshCcw
} from 'lucide-react';
import AuditInbox, { AuditUpdate } from '../AuditInbox';

const KEY_COLUMNS = [
  'fecha_insercion', 'cuil', 'dni', 'loan_id',
  'fecha', 'aviso_2_1', 'aviso_2_2', 'aviso_2_3', 'aviso_2_4'
];
const AUDIT_COLUMN = 'auditoria_realizada';
const ALERT_COLUMNS = ['aviso_2_1', 'aviso_2_2', 'aviso_2_3', 'aviso_2_4'];
const PRIORITY_COLUMNS = ['loan_id', 'fecha', 'fecha_insercion', 'cuil', 'dni', ...ALERT_COLUMNS, 'auditor_legal'];

interface Filters {
  loan_id: string;
  fecha_from: string;
  fecha_to: string;
  fecha_insercion_from: string;
  fecha_insercion_to: string;
  alerta: string;
  auditado: string;
}

const EMPTY_FILTERS: Filters = {
  loan_id: '',
  fecha_from: '',
  fecha_to: '',
  fecha_insercion_from: '',
  fecha_insercion_to: '',
  alerta: 'all',
  auditado: 'all',
};

function StatCard({ label, value, color, icon }: {
  label: string;
  value: number;
  color: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
      <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-2">{label}</p>
      <div className={`flex items-center gap-2 ${color}`}>
        {icon}
        <span className="text-2xl font-black">{value.toLocaleString('es-AR')}</span>
      </div>
    </div>
  );
}

export default function UifSubmodule({ userEmail }: { userEmail?: string }) {
  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);

  const handleLoad = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/uif/records');
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.details || err.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setRecords(data.records || []);
      setLoaded(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const stats = useMemo(() => {
    const total = records.length;
    const auditados = records.filter(r => r[AUDIT_COLUMN]).length;
    const pendientes = total - auditados;
    const byAlerta: Record<string, number> = {};
    for (const col of ALERT_COLUMNS) {
      byAlerta[col] = records.filter(r => r[col]).length;
    }
    return { total, auditados, pendientes, byAlerta };
  }, [records]);

  const filteredRecords = useMemo(() => {
    return records.filter(r => {
      if (filters.loan_id && !String(r.loan_id ?? '').toLowerCase().includes(filters.loan_id.toLowerCase())) return false;
      if (filters.fecha_from && r.fecha && new Date(r.fecha) < new Date(filters.fecha_from)) return false;
      if (filters.fecha_to && r.fecha && new Date(r.fecha) > new Date(filters.fecha_to + 'T23:59:59')) return false;
      if (filters.fecha_insercion_from && r.fecha_insercion && new Date(r.fecha_insercion) < new Date(filters.fecha_insercion_from)) return false;
      if (filters.fecha_insercion_to && r.fecha_insercion && new Date(r.fecha_insercion) > new Date(filters.fecha_insercion_to + 'T23:59:59')) return false;
      if (filters.alerta !== 'all' && !r[filters.alerta]) return false;
      if (filters.auditado === 'si' && !r[AUDIT_COLUMN]) return false;
      if (filters.auditado === 'no' && r[AUDIT_COLUMN]) return false;
      return true;
    });
  }, [records, filters]);

  const handleSave = useCallback(async (updates: AuditUpdate[]) => {
    setSaving(true);
    try {
      const res = await fetch('/api/uif/audit', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          auditor_legal: userEmail || '',
          updates: updates.map(u => ({
            record: u.record,
            auditoria_realizada: u.value,
          })),
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Error al guardar en Redshift');
      }
      // Reflect saved values in local state
      const savedMap = new Map(
        updates.map(u => [JSON.stringify(KEY_COLUMNS.map(k => u.record[k])), u.value])
      );
      setRecords(prev =>
        prev.map(r => {
          const key = JSON.stringify(KEY_COLUMNS.map(k => r[k]));
          return savedMap.has(key)
            ? { ...r, [AUDIT_COLUMN]: savedMap.get(key), auditor_legal: userEmail || '' }
            : r;
        })
      );
    } finally {
      setSaving(false);
    }
  }, [userEmail]);

  const hasActiveFilters = Object.entries(filters).some(([, v]) => v !== '' && v !== 'all');

  // ── Initial load screen ──────────────────────────────────────────────────────
  if (!loaded) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center py-20">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full text-center space-y-8"
        >
          <div className="w-16 h-16 bg-zinc-800/60 rounded-3xl flex items-center justify-center mx-auto border border-zinc-700/50">
            <ShieldAlert className="w-8 h-8 text-zinc-400" />
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-bold text-white">UIF</h2>
            <p className="text-zinc-400 text-sm leading-relaxed">
              Unidad de Información Financiera.<br />Auditoría y reportes de prevención del lavado de activos.
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
            {loading ? 'Cargando registros…' : 'Cargar Registros'}
          </button>
        </motion.div>
      </div>
    );
  }

  // ── Main view ────────────────────────────────────────────────────────────────
  return (
    <div className="flex-1 p-6 space-y-5 max-w-full overflow-hidden">

      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total registros" value={stats.total} color="text-zinc-200" />
        <StatCard
          label="Auditados"
          value={stats.auditados}
          color="text-emerald-400"
          icon={<CheckCircle2 className="w-5 h-5" />}
        />
        <StatCard
          label="Pendientes"
          value={stats.pendientes}
          color="text-amber-400"
          icon={<Clock className="w-5 h-5" />}
        />
        {/* Alert breakdown */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Por tipo de alerta</p>
            <button
              onClick={handleLoad}
              disabled={loading}
              className="p-1 rounded-lg hover:bg-slate-800 text-zinc-600 hover:text-zinc-300 transition-colors disabled:opacity-30"
              title="Recargar datos"
            >
              <RefreshCcw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-y-2 gap-x-3">
            {ALERT_COLUMNS.map(col => (
              <div key={col} className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-zinc-500 uppercase">
                  {col.replace('aviso_', 'Av. ').replace('_', '.')}
                </span>
                <span className="text-sm font-bold text-red-400">
                  {stats.byAlerta[col].toLocaleString('es-AR')}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 text-zinc-400">
            <Filter className="w-3.5 h-3.5" />
            <span className="text-xs font-bold uppercase tracking-wider">Filtros</span>
          </div>
          {hasActiveFilters && (
            <button
              onClick={() => setFilters(EMPTY_FILTERS)}
              className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-200 transition-colors"
            >
              <X className="w-3 h-3" /> Limpiar
            </button>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Loan ID */}
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Loan ID</label>
            <input
              type="text"
              value={filters.loan_id}
              onChange={e => setFilters(f => ({ ...f, loan_id: e.target.value }))}
              placeholder="Buscar…"
              className="w-full bg-slate-800 border border-slate-700 text-xs text-white rounded-lg px-3 py-2 focus:outline-none focus:border-zinc-500 placeholder-zinc-600"
            />
          </div>
          {/* Fecha */}
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Fecha</label>
            <div className="flex gap-1.5">
              <input type="date" value={filters.fecha_from}
                onChange={e => setFilters(f => ({ ...f, fecha_from: e.target.value }))}
                className="w-full bg-slate-800 border border-slate-700 text-xs text-white rounded-lg px-2 py-2 focus:outline-none focus:border-zinc-500 [color-scheme:dark]" />
              <input type="date" value={filters.fecha_to}
                onChange={e => setFilters(f => ({ ...f, fecha_to: e.target.value }))}
                className="w-full bg-slate-800 border border-slate-700 text-xs text-white rounded-lg px-2 py-2 focus:outline-none focus:border-zinc-500 [color-scheme:dark]" />
            </div>
          </div>
          {/* Fecha inserción */}
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Fecha inserción</label>
            <div className="flex gap-1.5">
              <input type="date" value={filters.fecha_insercion_from}
                onChange={e => setFilters(f => ({ ...f, fecha_insercion_from: e.target.value }))}
                className="w-full bg-slate-800 border border-slate-700 text-xs text-white rounded-lg px-2 py-2 focus:outline-none focus:border-zinc-500 [color-scheme:dark]" />
              <input type="date" value={filters.fecha_insercion_to}
                onChange={e => setFilters(f => ({ ...f, fecha_insercion_to: e.target.value }))}
                className="w-full bg-slate-800 border border-slate-700 text-xs text-white rounded-lg px-2 py-2 focus:outline-none focus:border-zinc-500 [color-scheme:dark]" />
            </div>
          </div>
          {/* Tipo de alerta */}
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Tipo de alerta</label>
            <select
              value={filters.alerta}
              onChange={e => setFilters(f => ({ ...f, alerta: e.target.value }))}
              className="w-full bg-slate-800 border border-slate-700 text-xs text-white rounded-lg px-3 py-2 focus:outline-none focus:border-zinc-500"
            >
              <option value="all">Todas las alertas</option>
              {ALERT_COLUMNS.map(col => (
                <option key={col} value={col}>
                  {col.replace('aviso_', 'Aviso ').replace('_', '.')}
                </option>
              ))}
            </select>
          </div>
          {/* Auditado */}
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Auditado</label>
            <select
              value={filters.auditado}
              onChange={e => setFilters(f => ({ ...f, auditado: e.target.value }))}
              className="w-full bg-slate-800 border border-slate-700 text-xs text-white rounded-lg px-3 py-2 focus:outline-none focus:border-zinc-500"
            >
              <option value="all">Todos</option>
              <option value="si">Sí — auditados</option>
              <option value="no">No — pendientes</option>
            </select>
          </div>
        </div>
      </div>

      {/* Record count when filtered */}
      {hasActiveFilters && (
        <p className="text-xs text-zinc-500">
          Mostrando{' '}
          <span className="font-bold text-zinc-300">{filteredRecords.length.toLocaleString('es-AR')}</span>
          {' '}de {stats.total.toLocaleString('es-AR')} registros
        </p>
      )}

      {/* Audit table */}
      <AuditInbox
        records={filteredRecords}
        keyColumns={KEY_COLUMNS}
        auditColumn={AUDIT_COLUMN}
        priorityColumns={PRIORITY_COLUMNS}
        onSave={handleSave}
        saving={saving}
      />
    </div>
  );
}
