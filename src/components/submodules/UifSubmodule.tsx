import React, { useState, useEffect, useRef, useCallback, useMemo, memo } from 'react';
import {
  Database, Loader2, ShieldAlert, CheckCircle2, Clock, RefreshCcw,
  AlertTriangle, ChevronDown, ChevronRight, Save, Filter, X
} from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────────────────

interface UifRecord {
  fecha_warning: string | null;
  cuil: string;
  dni: number;
  loan_id: number;
  fecha_desembolso: string | null;
  monto_desembolsado: string | null;
  tipo_cliente: string | null;
  medio_pago: string | null;
  nse: boolean | null;
  actividad_empleador: boolean | null;
  actividad_laboral: string | null;
  descripcion_actividad_laboral: boolean | null;
  razon_social_empleador: boolean | null;
  cuit_empleador: boolean | null;
  region_loan: string | null;
  riesgo_region: string | null;
  warning_cancelacion_anticipada: number | null;
  warning_pep_o_so: number | null;
  warning_smvm_men_anual: number | null;
  warning_pagador_indirecto: number | null;
  total_cancelados_en_el_mes: number | null;
  salario_min: number | null;
  smvm_mes: number | null;
  smvm_anio: number | null;
  cvu_igual: number | null;
  es_so: number | null;
  es_pep: number | null;
  riesgo: string | null;
  auditoria_1: string | null; auditor_1: string | null; auditoria_fecha_1: string | null;
  auditoria_2: string | null; auditor_2: string | null; auditoria_fecha_2: string | null;
  auditoria_3: string | null; auditor_3: string | null; auditoria_fecha_3: string | null;
  auditoria_4: string | null; auditor_4: string | null; auditoria_fecha_4: string | null;
  auditoria_5: string | null; auditor_5: string | null; auditoria_fecha_5: string | null;
  riesgo_auditado: string | null;
}

interface AuditDraft {
  auditoria_1: string; auditoria_2: string; auditoria_3: string;
  auditoria_4: string; auditoria_5: string;
  riesgo_auditado: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtMoney(v: unknown): string {
  if (v === null || v === undefined) return '—';
  const n = parseFloat(String(v));
  if (isNaN(n)) return String(v);
  return new Intl.NumberFormat('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);
}

function fmtDate(v: unknown): string {
  if (!v) return '—';
  return String(v).slice(0, 10);
}

function fmtDateTime(v: unknown): string {
  if (!v) return '';
  const s = String(v);
  if (s.length >= 16) return s.slice(0, 16).replace('T', ' ');
  return s.slice(0, 10);
}

function rowKey(r: UifRecord) { return `${r.loan_id}|${r.cuil}`; }

function cleanAudit(v: string | null): string {
  if (!v || v === 'true' || v === 'false') return '';
  return v;
}

function draftFromRecord(r: UifRecord): AuditDraft {
  return {
    auditoria_1: cleanAudit(r.auditoria_1),
    auditoria_2: cleanAudit(r.auditoria_2),
    auditoria_3: cleanAudit(r.auditoria_3),
    auditoria_4: cleanAudit(r.auditoria_4),
    auditoria_5: cleanAudit(r.auditoria_5),
    riesgo_auditado: r.riesgo_auditado ?? '',
  };
}

function auditProgress(r: UifRecord): number {
  return [r.auditoria_1, r.auditoria_2, r.auditoria_3, r.auditoria_4, r.auditoria_5]
    .filter(v => v && v !== 'true' && v !== 'false').length;
}

// ── Small components ─────────────────────────────────────────────────────────

function RiesgoBadge({ value, size = 'sm' }: { value: string | null; size?: 'sm' | 'xs' }) {
  if (!value) return <span className="text-zinc-600">—</span>;
  const cls: Record<string, string> = {
    BAJO: 'bg-emerald-900/60 text-emerald-400 border-emerald-700/50',
    MEDIO: 'bg-amber-900/60 text-amber-400 border-amber-700/50',
    ALTO: 'bg-rose-900/60 text-rose-400 border-rose-700/50',
  };
  const base = size === 'xs' ? 'text-[10px] px-1.5 py-0.5' : 'text-[10px] px-2 py-1';
  return (
    <span className={`inline-block font-bold rounded-md border whitespace-nowrap ${base} ${cls[value] ?? 'bg-zinc-800 text-zinc-400 border-zinc-700'}`}>
      {value}
    </span>
  );
}

function WarnDot({ active }: { active: boolean }) {
  return active
    ? <span className="inline-block w-2 h-2 rounded-full bg-amber-400" />
    : <span className="inline-block w-2 h-2 rounded-full bg-zinc-700" />;
}

function BoolBadge({ value }: { value: unknown }) {
  const bool = value === true || value === 1 || value === '1' || value === 'true';
  return bool
    ? <span className="text-[10px] font-bold text-emerald-400">Sí</span>
    : <span className="text-[10px] text-zinc-600">No</span>;
}

// ── DualScroll (ResizeObserver — no reflow on expand) ────────────────────────

function DualScroll({ children, maxHeight = '60vh' }: { children: React.ReactNode; maxHeight?: string }) {
  const topRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const syncing = useRef(false);

  useEffect(() => {
    const body = bodyRef.current;
    const top = topRef.current;
    if (!body || !top) return;

    const measure = () => {
      const inner = top.querySelector('div') as HTMLDivElement | null;
      if (inner) inner.style.minWidth = `${body.scrollWidth}px`;
      top.style.marginRight = `${body.offsetWidth - body.clientWidth}px`;
    };

    const ro = new ResizeObserver(measure);
    ro.observe(body);
    measure();
    return () => ro.disconnect();
  }, []); // runs once; ResizeObserver handles subsequent size changes

  const onTop = () => {
    if (syncing.current || !bodyRef.current || !topRef.current) return;
    syncing.current = true;
    bodyRef.current.scrollLeft = topRef.current.scrollLeft;
    syncing.current = false;
  };
  const onBody = () => {
    if (syncing.current || !topRef.current || !bodyRef.current) return;
    syncing.current = true;
    topRef.current.scrollLeft = bodyRef.current.scrollLeft;
    syncing.current = false;
  };

  return (
    <div>
      <div
        ref={topRef}
        onScroll={onTop}
        className="overflow-x-auto overflow-y-hidden [&::-webkit-scrollbar]:h-3 [&::-webkit-scrollbar-thumb]:rounded [&::-webkit-scrollbar-thumb]:bg-blue-500 [&::-webkit-scrollbar-track]:bg-slate-800"
      >
        <div style={{ height: '1px' }} />
      </div>
      <div
        ref={bodyRef}
        onScroll={onBody}
        style={{ maxHeight }}
        className="overflow-x-auto overflow-y-auto [&::-webkit-scrollbar]:h-3 [&::-webkit-scrollbar-thumb]:rounded [&::-webkit-scrollbar-thumb]:bg-blue-500 [&::-webkit-scrollbar-track]:bg-slate-800"
      >
        {children}
      </div>
    </div>
  );
}

// ── Table columns ─────────────────────────────────────────────────────────────

const DISPLAY_COLS: { key: keyof UifRecord; label: string; render?: (v: unknown, r: UifRecord) => React.ReactNode }[] = [
  { key: 'fecha_warning', label: 'Fecha Warning', render: v => <span className="font-mono text-zinc-300">{fmtDate(v)}</span> },
  { key: 'cuil', label: 'CUIL', render: v => <span className="font-mono text-xs">{String(v ?? '—')}</span> },
  { key: 'dni', label: 'DNI', render: v => <span className="font-mono text-xs">{String(v ?? '—')}</span> },
  { key: 'loan_id', label: 'Loan ID', render: v => <span className="font-bold text-blue-400">{String(v ?? '—')}</span> },
  { key: 'fecha_desembolso', label: 'Fecha Desemb.', render: v => fmtDate(v) },
  { key: 'monto_desembolsado', label: 'Monto Desemb.', render: v => <span className="block text-right">{fmtMoney(v)}</span> },
  { key: 'tipo_cliente', label: 'Tipo Cliente' },
  { key: 'medio_pago', label: 'Medio de Pago' },
  { key: 'nse', label: 'NSE', render: v => <BoolBadge value={v} /> },
  { key: 'actividad_empleador', label: 'Act. Empleador', render: v => <BoolBadge value={v} /> },
  { key: 'actividad_laboral', label: 'Act. Laboral' },
  { key: 'descripcion_actividad_laboral', label: 'Desc. Act. Lab.', render: v => <BoolBadge value={v} /> },
  { key: 'razon_social_empleador', label: 'Razón Social', render: v => <BoolBadge value={v} /> },
  { key: 'cuit_empleador', label: 'CUIT Empl.', render: v => <BoolBadge value={v} /> },
  { key: 'region_loan', label: 'Región' },
  { key: 'riesgo_region', label: 'Riesgo Región', render: v => v ? <span className="text-[10px] text-zinc-400">{String(v).replace(/_/g, ' ')}</span> : <span className="text-zinc-600">—</span> },
  { key: 'warning_cancelacion_anticipada', label: 'W. Cancelac.', render: v => <WarnDot active={!!v} /> },
  { key: 'warning_pep_o_so', label: 'W. PEP/SO', render: v => <WarnDot active={!!v} /> },
  { key: 'warning_smvm_men_anual', label: 'W. SMVM', render: v => <WarnDot active={!!v} /> },
  { key: 'warning_pagador_indirecto', label: 'W. Pag. Ind.', render: v => <WarnDot active={!!v} /> },
  { key: 'total_cancelados_en_el_mes', label: 'Cancelados/Mes' },
  { key: 'salario_min', label: 'Salario Mín.', render: v => fmtMoney(v) },
  { key: 'smvm_mes', label: 'SMVM Mes', render: v => fmtMoney(v) },
  { key: 'smvm_anio', label: 'SMVM Año', render: v => fmtMoney(v) },
  { key: 'cvu_igual', label: 'CVU Igual', render: v => <BoolBadge value={v} /> },
  { key: 'es_so', label: 'SO', render: v => <BoolBadge value={v} /> },
  { key: 'es_pep', label: 'PEP', render: v => <BoolBadge value={v} /> },
  { key: 'riesgo', label: 'Riesgo', render: v => <RiesgoBadge value={v as string | null} size="xs" /> },
  { key: 'riesgo_auditado', label: 'Riesgo Auditado', render: v => <RiesgoBadge value={v as string | null} size="xs" /> },
];

// ── Audit panel (memoized — won't re-render when other rows change) ───────────

const SLOTS = [1, 2, 3, 4, 5] as const;

type SlotN = typeof SLOTS[number];

const AuditPanel = memo(function AuditPanel({
  record,
  userEmail,
  onSave,
}: {
  record: UifRecord;
  userEmail: string;
  onSave: (loan_id: number, cuil: string, draft: AuditDraft) => Promise<void>;
}) {
  const [draft, setDraft] = useState<AuditDraft>(() => draftFromRecord(record));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const colSpan = DISPLAY_COLS.length + 1;

  const setField = (field: keyof AuditDraft) => (
    e: React.ChangeEvent<HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    setSaved(false);
    setDraft(d => ({ ...d, [field]: e.target.value }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(record.loan_id, record.cuil, draft);
      setSaved(true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <tr className="bg-slate-950/80">
      <td colSpan={colSpan} className="px-6 py-5 border-b border-slate-800">
        <div className="flex flex-col gap-0 max-w-3xl divide-y divide-slate-800/60">

          {/* Audit rounds — one per row */}
          {SLOTS.map(n => {
            const auditKey = `auditoria_${n}` as keyof AuditDraft;
            const auditorVal = record[`auditor_${n}` as keyof UifRecord];
            const fechaVal = record[`auditoria_fecha_${n}` as keyof UifRecord];
            const auditorDisplay = typeof auditorVal === 'string' && auditorVal !== 'true'
              ? auditorVal
              : (draft[auditKey] ? userEmail : null);

            return (
              <div key={n} className="py-3 first:pt-0">
                {/* Row header: label + auditor + fecha */}
                <div className="flex items-center gap-4 mb-1.5">
                  <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider w-20 shrink-0">
                    Auditoría {n}
                  </span>
                  {auditorDisplay && (
                    <span className="text-[10px] text-zinc-500 truncate" title={auditorDisplay}>
                      {auditorDisplay}
                    </span>
                  )}
                  {fechaVal && (
                    <span className="text-[10px] text-zinc-600 ml-auto shrink-0">
                      {fmtDateTime(fechaVal)}
                    </span>
                  )}
                </div>
                <textarea
                  value={draft[auditKey as keyof AuditDraft]}
                  onChange={setField(auditKey as keyof AuditDraft)}
                  rows={2}
                  placeholder={`Notas auditoría ${n}…`}
                  className="w-full bg-slate-800 border border-slate-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 text-xs text-zinc-200 placeholder-zinc-600 rounded-lg px-3 py-2 resize-none outline-none transition-colors"
                />
              </div>
            );
          })}

          {/* Footer */}
          <div className="flex items-center gap-4 pt-3">
            <div className="flex items-center gap-2">
              <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider whitespace-nowrap">
                Riesgo Auditado
              </label>
              <select
                value={draft.riesgo_auditado}
                onChange={setField('riesgo_auditado')}
                className="bg-slate-800 border border-slate-700 focus:border-blue-500 text-xs text-zinc-200 rounded-lg px-3 py-1.5 outline-none"
              >
                <option value="">— Sin clasificar —</option>
                <option value="BAJO">BAJO</option>
                <option value="MEDIO">MEDIO</option>
                <option value="ALTO">ALTO</option>
              </select>
            </div>
            <button
              onClick={handleSave}
              disabled={saving}
              className="ml-auto flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition-colors"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              {saving ? 'Guardando…' : saved ? '✓ Guardado' : 'Guardar'}
            </button>
          </div>
        </div>
      </td>
    </tr>
  );
});

// ── Table row (memoized) ──────────────────────────────────────────────────────

const UifRow = memo(function UifRow({
  row,
  isOpen,
  userEmail,
  onToggle,
  onSave,
}: {
  row: UifRecord;
  isOpen: boolean;
  userEmail: string;
  onToggle: (key: string) => void;
  onSave: (loan_id: number, cuil: string, draft: AuditDraft) => Promise<void>;
}) {
  const key = rowKey(row);
  const progress = auditProgress(row);

  return (
    <React.Fragment>
      <tr
        className={`cursor-pointer transition-colors ${isOpen ? 'bg-slate-800/60' : 'hover:bg-slate-800/40'} border-b border-slate-800/50`}
        onClick={() => onToggle(key)}
      >
        <td className="px-3 py-2.5">
          <div className="flex items-center gap-1">
            {isOpen
              ? <ChevronDown className="w-3.5 h-3.5 text-blue-400" />
              : <ChevronRight className="w-3.5 h-3.5 text-zinc-600" />
            }
            {progress > 0 && (
              <span className="text-[9px] font-bold text-blue-400">{progress}/5</span>
            )}
          </div>
        </td>
        {DISPLAY_COLS.map(col => (
          <td key={col.key} className="px-3 py-2.5 text-xs text-zinc-300 whitespace-nowrap">
            {col.render
              ? col.render(row[col.key], row)
              : (row[col.key] === null || row[col.key] === undefined
                ? <span className="text-zinc-600">—</span>
                : String(row[col.key])
              )
            }
          </td>
        ))}
      </tr>
      {isOpen && (
        <AuditPanel record={row} userEmail={userEmail} onSave={onSave} />
      )}
    </React.Fragment>
  );
});

// ── Main submodule ────────────────────────────────────────────────────────────

interface Filters {
  loan_id: string;
  fecha_from: string;
  fecha_to: string;
  riesgo: string;
  riesgo_auditado: string;
}

const EMPTY_FILTERS: Filters = { loan_id: '', fecha_from: '', fecha_to: '', riesgo: 'all', riesgo_auditado: 'all' };

export default function UifSubmodule({ userEmail }: { userEmail?: string }) {
  const [records, setRecords] = useState<UifRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);

  const handleLoad = useCallback(async () => {
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
  }, []);

  const handleSave = useCallback(async (loan_id: number, cuil: string, draft: AuditDraft) => {
    const now = new Date().toISOString();
    const res = await fetch('/api/uif/audit', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        loan_id,
        cuil,
        auditoria_1: draft.auditoria_1 || null,
        auditor_1: draft.auditoria_1 ? (userEmail || null) : null,
        auditoria_2: draft.auditoria_2 || null,
        auditor_2: draft.auditoria_2 ? (userEmail || null) : null,
        auditoria_3: draft.auditoria_3 || null,
        auditor_3: draft.auditoria_3 ? (userEmail || null) : null,
        auditoria_4: draft.auditoria_4 || null,
        auditor_4: draft.auditoria_4 ? (userEmail || null) : null,
        auditoria_5: draft.auditoria_5 || null,
        auditor_5: draft.auditoria_5 ? (userEmail || null) : null,
        riesgo_auditado: draft.riesgo_auditado || null,
      }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Error al guardar');
    }
    setRecords(prev => prev.map(r =>
      r.loan_id === loan_id && r.cuil === cuil ? {
        ...r,
        auditoria_1: draft.auditoria_1 || null,
        auditor_1: draft.auditoria_1 ? (userEmail || null) : r.auditor_1,
        auditoria_fecha_1: draft.auditoria_1 ? now : null,
        auditoria_2: draft.auditoria_2 || null,
        auditor_2: draft.auditoria_2 ? (userEmail || null) : r.auditor_2,
        auditoria_fecha_2: draft.auditoria_2 ? now : null,
        auditoria_3: draft.auditoria_3 || null,
        auditor_3: draft.auditoria_3 ? (userEmail || null) : r.auditor_3,
        auditoria_fecha_3: draft.auditoria_3 ? now : null,
        auditoria_4: draft.auditoria_4 || null,
        auditor_4: draft.auditoria_4 ? (userEmail || null) : r.auditor_4,
        auditoria_fecha_4: draft.auditoria_4 ? now : null,
        auditoria_5: draft.auditoria_5 || null,
        auditor_5: draft.auditoria_5 ? (userEmail || null) : r.auditor_5,
        auditoria_fecha_5: draft.auditoria_5 ? now : null,
        riesgo_auditado: draft.riesgo_auditado || null,
      } : r
    ));
  }, [userEmail]);

  const toggleExpand = useCallback((key: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }, []);

  const stats = useMemo(() => {
    const total = records.length;
    const sinAuditoria = records.filter(r => !r.auditoria_1 || r.auditoria_1 === 'true').length;
    const cerrados = records.filter(r => !!r.riesgo_auditado).length;
    const enRevision = total - sinAuditoria - cerrados;
    const warnings = records.filter(r =>
      r.warning_cancelacion_anticipada || r.warning_pep_o_so ||
      r.warning_smvm_men_anual || r.warning_pagador_indirecto
    ).length;
    return { total, sinAuditoria, cerrados, enRevision, warnings };
  }, [records]);

  const filtered = useMemo(() => records.filter(r => {
    if (filters.loan_id && !String(r.loan_id ?? '').includes(filters.loan_id)) return false;
    if (filters.fecha_from && r.fecha_warning && r.fecha_warning < filters.fecha_from) return false;
    if (filters.fecha_to && r.fecha_warning && r.fecha_warning > filters.fecha_to) return false;
    if (filters.riesgo !== 'all' && r.riesgo !== filters.riesgo) return false;
    if (filters.riesgo_auditado === 'pendiente' && r.riesgo_auditado) return false;
    if (filters.riesgo_auditado === 'cerrado' && !r.riesgo_auditado) return false;
    if (
      filters.riesgo_auditado !== 'all' &&
      filters.riesgo_auditado !== 'pendiente' &&
      filters.riesgo_auditado !== 'cerrado' &&
      r.riesgo_auditado !== filters.riesgo_auditado
    ) return false;
    return true;
  }), [records, filters]);

  const hasFilters = Object.entries(filters).some(([, v]) => v !== '' && v !== 'all');

  // ── Initial screen ────────────────────────────────────────────────────────
  if (!loaded) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center py-20">
        <div className="max-w-md w-full text-center space-y-8">
          <div className="w-16 h-16 bg-zinc-800/60 rounded-3xl flex items-center justify-center mx-auto border border-zinc-700/50">
            <ShieldAlert className="w-8 h-8 text-zinc-400" />
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-bold text-white">UIF</h2>
            <p className="text-zinc-400 text-sm leading-relaxed">
              Unidad de Información Financiera.<br />Auditoría y prevención del lavado de activos.
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
            className="mx-auto flex items-center justify-center gap-2 px-8 py-3 bg-zinc-700 hover:bg-zinc-600 text-white font-bold rounded-xl transition-colors disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Database className="w-5 h-5" />}
            {loading ? 'Cargando registros…' : 'Cargar Registros'}
          </button>
        </div>
      </div>
    );
  }

  // ── Main view ─────────────────────────────────────────────────────────────
  return (
    <div className="flex-1 p-4 space-y-4 max-w-full overflow-hidden">

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {[
          { label: 'Total', value: stats.total, color: 'text-zinc-200', icon: null },
          { label: 'Sin Auditar', value: stats.sinAuditoria, color: 'text-amber-400', icon: <Clock className="w-4 h-4" /> },
          { label: 'En Revisión', value: stats.enRevision, color: 'text-blue-400', icon: <AlertTriangle className="w-4 h-4" /> },
          { label: 'Cerrados', value: stats.cerrados, color: 'text-emerald-400', icon: <CheckCircle2 className="w-4 h-4" /> },
          { label: 'Con Warnings', value: stats.warnings, color: 'text-rose-400', icon: <ShieldAlert className="w-4 h-4" /> },
        ].map(s => (
          <div key={s.label} className="bg-slate-900 border border-slate-800 rounded-xl p-3">
            <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1">{s.label}</p>
            <div className={`flex items-center gap-1.5 ${s.color}`}>
              {s.icon}
              <span className="text-xl font-black">{s.value.toLocaleString('es-AR')}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2 text-zinc-400">
            <Filter className="w-3.5 h-3.5" />
            <span className="text-xs font-bold uppercase tracking-wider">Filtros</span>
          </div>
          <div className="flex items-center gap-2">
            {hasFilters && (
              <button onClick={() => setFilters(EMPTY_FILTERS)} className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-200 transition-colors">
                <X className="w-3 h-3" /> Limpiar
              </button>
            )}
            <button onClick={handleLoad} disabled={loading} className="p-1 rounded-lg hover:bg-slate-800 text-zinc-600 hover:text-zinc-300 transition-colors disabled:opacity-30" title="Recargar">
              <RefreshCcw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-2">
          <input
            type="text"
            value={filters.loan_id}
            onChange={e => setFilters(f => ({ ...f, loan_id: e.target.value }))}
            placeholder="Loan ID…"
            className="bg-slate-800 border border-slate-700 text-xs text-white rounded-lg px-3 py-1.5 focus:outline-none focus:border-zinc-500 placeholder-zinc-600"
          />
          <input type="date" value={filters.fecha_from}
            onChange={e => setFilters(f => ({ ...f, fecha_from: e.target.value }))}
            className="bg-slate-800 border border-slate-700 text-xs text-white rounded-lg px-2 py-1.5 focus:outline-none focus:border-zinc-500 [color-scheme:dark]" />
          <input type="date" value={filters.fecha_to}
            onChange={e => setFilters(f => ({ ...f, fecha_to: e.target.value }))}
            className="bg-slate-800 border border-slate-700 text-xs text-white rounded-lg px-2 py-1.5 focus:outline-none focus:border-zinc-500 [color-scheme:dark]" />
          <select value={filters.riesgo} onChange={e => setFilters(f => ({ ...f, riesgo: e.target.value }))}
            className="bg-slate-800 border border-slate-700 text-xs text-white rounded-lg px-3 py-1.5 focus:outline-none">
            <option value="all">Riesgo: Todos</option>
            <option value="BAJO">BAJO</option>
            <option value="MEDIO">MEDIO</option>
            <option value="ALTO">ALTO</option>
          </select>
          <select value={filters.riesgo_auditado} onChange={e => setFilters(f => ({ ...f, riesgo_auditado: e.target.value }))}
            className="bg-slate-800 border border-slate-700 text-xs text-white rounded-lg px-3 py-1.5 focus:outline-none">
            <option value="all">Estado: Todos</option>
            <option value="pendiente">Sin cerrar</option>
            <option value="cerrado">Cerrado</option>
            <option value="BAJO">Auditado BAJO</option>
            <option value="MEDIO">Auditado MEDIO</option>
            <option value="ALTO">Auditado ALTO</option>
          </select>
        </div>
        {hasFilters && (
          <p className="text-[10px] text-zinc-600 mt-2">
            Mostrando <span className="text-zinc-400 font-bold">{filtered.length.toLocaleString('es-AR')}</span> de {stats.total.toLocaleString('es-AR')} registros
          </p>
        )}
      </div>

      {/* Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <DualScroll maxHeight="62vh">
          <table className="w-full text-left border-collapse" style={{ minWidth: '3200px' }}>
            <thead className="sticky top-0 z-10 bg-slate-800">
              <tr>
                <th className="w-8 px-3 py-3 border-b border-slate-700" />
                {DISPLAY_COLS.map(col => (
                  <th key={col.key} className="px-3 py-3 text-[10px] font-bold text-zinc-400 uppercase tracking-wider border-b border-slate-700 whitespace-nowrap">
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={DISPLAY_COLS.length + 1} className="px-6 py-12 text-center text-zinc-500 text-sm">
                    No hay registros para los filtros seleccionados.
                  </td>
                </tr>
              ) : filtered.map(row => (
                <UifRow
                  key={rowKey(row)}
                  row={row}
                  isOpen={expanded.has(rowKey(row))}
                  userEmail={userEmail || ''}
                  onToggle={toggleExpand}
                  onSave={handleSave}
                />
              ))}
            </tbody>
          </table>
        </DualScroll>
      </div>
    </div>
  );
}
