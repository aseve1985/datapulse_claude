import React, { useState, useEffect, useRef, useCallback, useMemo, memo, useDeferredValue } from 'react';
import {
  Database, Loader2, ShieldAlert, CheckCircle2, Clock, RefreshCcw,
  ChevronDown, ChevronRight, Save, Filter, X, RotateCcw
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
  riesgo_auditado_auditor: string | null;
  riesgo_auditado_fecha: string | null;
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

function isRealAudit(v: unknown): boolean {
  if (!v) return false;
  const s = String(v);
  return s !== '' && s !== 'true' && s !== 'false';
}

function auditProgress(r: UifRecord): number {
  return [r.auditoria_1, r.auditoria_2, r.auditoria_3, r.auditoria_4, r.auditoria_5]
    .filter(isRealAudit).length;
}

function isAuditado(r: UifRecord): boolean {
  const slots: [unknown, unknown, unknown][] = [
    [r.auditoria_1, r.auditor_1, r.auditoria_fecha_1],
    [r.auditoria_2, r.auditor_2, r.auditoria_fecha_2],
    [r.auditoria_3, r.auditor_3, r.auditoria_fecha_3],
    [r.auditoria_4, r.auditor_4, r.auditoria_fecha_4],
    [r.auditoria_5, r.auditor_5, r.auditoria_fecha_5],
    [r.riesgo_auditado, r.riesgo_auditado_auditor, r.riesgo_auditado_fecha],
  ];
  return slots.some(([valor, auditor, fecha]) =>
    isRealAudit(valor) && !!auditor && !!fecha
  );
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

// Shows boolean as Sí/No, text as-is, null as —
function SmartCell({ value }: { value: unknown }) {
  if (value === null || value === undefined) return <span className="text-zinc-600">—</span>;
  if (value === true) return <span className="text-[10px] font-bold text-emerald-400">Sí</span>;
  if (value === false) return <span className="text-[10px] text-zinc-600">No</span>;
  const s = String(value);
  if (s === '' || s === 'null') return <span className="text-zinc-600">—</span>;
  return <span className="text-xs text-zinc-300">{s}</span>;
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
  { key: 'nse', label: 'NSE', render: v => <SmartCell value={v} /> },
  { key: 'actividad_empleador', label: 'Act. Empleador', render: v => <SmartCell value={v} /> },
  { key: 'actividad_laboral', label: 'Act. Laboral' },
  { key: 'descripcion_actividad_laboral', label: 'Desc. Act. Lab.', render: v => <SmartCell value={v} /> },
  { key: 'razon_social_empleador', label: 'Razón Social', render: v => <SmartCell value={v} /> },
  { key: 'cuit_empleador', label: 'CUIT Empl.', render: v => <SmartCell value={v} /> },
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


const EMPTY_DRAFT: AuditDraft = { auditoria_1: '', auditoria_2: '', auditoria_3: '', auditoria_4: '', auditoria_5: '', riesgo_auditado: '' };

const AuditPanel = memo(function AuditPanel({
  record,
  userEmail,
  onSave,
  onReset,
}: {
  record: UifRecord;
  userEmail: string;
  onSave: (loan_id: number, cuil: string, draft: AuditDraft) => Promise<void>;
  onReset: (loan_id: number, cuil: string, riesgo: string | null) => Promise<void>;
}) {
  const [draft, setDraft] = useState<AuditDraft>(() => draftFromRecord(record));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [resetting, setResetting] = useState(false);

  const colSpan = DISPLAY_COLS.length + 1;

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(record.loan_id, record.cuil, draft);
      setSaved(true);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!window.confirm('¿Resetear toda la auditoría de este registro? El registro quedará como no auditado.')) return;
    setResetting(true);
    try {
      await onReset(record.loan_id, record.cuil, record.riesgo);
      setDraft(EMPTY_DRAFT);
      setSaved(false);
    } finally {
      setResetting(false);
    }
  };

  return (
    <tr className="bg-slate-950/70">
      <td colSpan={colSpan} className="border-b border-slate-800 px-3">
        {/* Max-width container so the grid doesn't stretch across 3200px */}
        <div className="max-w-3xl divide-y divide-slate-800/50">

          {/* 5 compact rows: [label 4rem] [input flex] [auditor 10rem] [fecha 8rem] */}
          {SLOTS.map(n => {
            const auditKey = `auditoria_${n}` as keyof AuditDraft;
            const auditorVal = record[`auditor_${n}` as keyof UifRecord];
            const fechaVal = record[`auditoria_fecha_${n}` as keyof UifRecord];
            const auditorDisplay = typeof auditorVal === 'string' && auditorVal !== 'true' && auditorVal !== 'false'
              ? auditorVal
              : (draft[auditKey] ? userEmail : '');

            return (
              <div key={n} className="grid gap-2 py-2" style={{ gridTemplateColumns: '4rem 1fr 10rem 8rem' }}>
                <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider self-center">
                  Aud. {n}
                </span>
                <input
                  type="text"
                  value={draft[auditKey]}
                  onChange={e => { setSaved(false); setDraft(d => ({ ...d, [auditKey]: e.target.value })); }}
                  placeholder={`Auditoría ${n}…`}
                  className="bg-slate-800 border border-slate-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 text-xs text-zinc-200 placeholder-zinc-600 rounded px-2.5 py-1.5 outline-none transition-colors w-full"
                />
                <span className="text-[10px] text-zinc-500 self-center truncate" title={auditorDisplay}>
                  {auditorDisplay || <span className="text-zinc-700">—</span>}
                </span>
                <span className="text-[10px] text-zinc-600 self-center font-mono">
                  {fechaVal ? fmtDateTime(fechaVal) : <span className="text-zinc-700">—</span>}
                </span>
              </div>
            );
          })}

          {/* Riesgo auditado — same grid layout as audit rows */}
          <div className="grid gap-2 py-2" style={{ gridTemplateColumns: '4rem 1fr 10rem 8rem' }}>
            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider self-center">
              Riesgo
            </span>
            <select
              value={draft.riesgo_auditado}
              onChange={e => { setSaved(false); setDraft(d => ({ ...d, riesgo_auditado: e.target.value })); }}
              className="bg-slate-800 border border-slate-700 focus:border-blue-500 text-xs text-zinc-200 rounded px-2.5 py-1.5 outline-none w-36"
            >
              <option value="">— Sin clasificar —</option>
              <option value="BAJO">BAJO</option>
              <option value="MEDIO">MEDIO</option>
              <option value="ALTO">ALTO</option>
            </select>
            <span className="text-[10px] text-zinc-500 self-center truncate" title={record.riesgo_auditado_auditor ?? ''}>
              {record.riesgo_auditado_auditor && record.riesgo_auditado_auditor !== 'true'
                ? record.riesgo_auditado_auditor
                : (draft.riesgo_auditado ? userEmail : <span className="text-zinc-700">—</span>)
              }
            </span>
            <span className="text-[10px] text-zinc-600 self-center font-mono">
              {record.riesgo_auditado_fecha
                ? fmtDateTime(record.riesgo_auditado_fecha)
                : <span className="text-zinc-700">—</span>
              }
            </span>
          </div>

          {/* Guardar / Resetear */}
          <div className="grid gap-2 py-2" style={{ gridTemplateColumns: '4rem 1fr 10rem 8rem' }}>
            <span />
            <div className="flex items-center gap-2">
              <button
                onClick={handleSave}
                disabled={saving || resetting}
                className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded text-xs font-bold transition-colors"
              >
                {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                {saving ? 'Guardando…' : saved ? '✓ Guardado' : 'Guardar'}
              </button>
              <button
                onClick={handleReset}
                disabled={saving || resetting}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-transparent hover:bg-rose-900/40 border border-zinc-700 hover:border-rose-700 text-zinc-500 hover:text-rose-400 disabled:opacity-50 rounded text-xs transition-colors"
              >
                {resetting ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
                {resetting ? 'Reseteando…' : 'Resetear'}
              </button>
            </div>
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
  onReset,
}: {
  row: UifRecord;
  isOpen: boolean;
  userEmail: string;
  onToggle: (key: string) => void;
  onSave: (loan_id: number, cuil: string, draft: AuditDraft) => Promise<void>;
  onReset: (loan_id: number, cuil: string, riesgo: string | null) => Promise<void>;
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
        <AuditPanel record={row} userEmail={userEmail} onSave={onSave} onReset={onReset} />
      )}
    </React.Fragment>
  );
});

// ── Main submodule ────────────────────────────────────────────────────────────

interface Filters {
  loan_id: string;
  cuil: string;
  fecha_from: string;
  fecha_to: string;
  warning: string;
  riesgo: string;
  riesgo_auditado: string;
}

const EMPTY_FILTERS: Filters = { loan_id: '', cuil: '', fecha_from: '', fecha_to: '', warning: 'all', riesgo: 'all', riesgo_auditado: 'all' };

export default function UifSubmodule({ userEmail }: { userEmail?: string }) {
  const [records, setRecords] = useState<UifRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const deferredFilters = useDeferredValue(filters);

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
    const now = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
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
        auditor_riesgo: draft.riesgo_auditado ? (userEmail || null) : null,
      }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Error al guardar');
    }
    const riesgo = draft.riesgo_auditado || null;
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
        riesgo_auditado: riesgo,
        riesgo_auditado_auditor: riesgo ? (userEmail || null) : null,
        riesgo_auditado_fecha: riesgo ? now : null,
      } : r
    ));
  }, [userEmail]);

  const handleReset = useCallback(async (loan_id: number, cuil: string, riesgo: string | null) => {
    const res = await fetch('/api/uif/audit', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        loan_id, cuil,
        auditoria_1: null, auditor_1: null,
        auditoria_2: null, auditor_2: null,
        auditoria_3: null, auditor_3: null,
        auditoria_4: null, auditor_4: null,
        auditoria_5: null, auditor_5: null,
        riesgo_auditado: riesgo, auditor_riesgo: null,
      }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Error al resetear');
    }
    setRecords(prev => prev.map(r =>
      r.loan_id === loan_id && r.cuil === cuil ? {
        ...r,
        auditoria_1: null, auditor_1: null, auditoria_fecha_1: null,
        auditoria_2: null, auditor_2: null, auditoria_fecha_2: null,
        auditoria_3: null, auditor_3: null, auditoria_fecha_3: null,
        auditoria_4: null, auditor_4: null, auditoria_fecha_4: null,
        auditoria_5: null, auditor_5: null, auditoria_fecha_5: null,
        riesgo_auditado: riesgo, riesgo_auditado_auditor: null, riesgo_auditado_fecha: null,
      } : r
    ));
  }, []);

  const toggleExpand = useCallback((key: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }, []);

  const stats = useMemo(() => {
    const total = records.length;
    const auditados = records.filter(isAuditado).length;
    const sinAuditoria = total - auditados;
    const riesgoAlto = records.filter(r => r.riesgo_auditado === 'ALTO').length;
    return { total, sinAuditoria, auditados, riesgoAlto };
  }, [records]);

  const filtered = useMemo(() => records.filter(r => {
    if (deferredFilters.loan_id && !String(r.loan_id ?? '').includes(deferredFilters.loan_id)) return false;
    if (deferredFilters.cuil && !String(r.cuil ?? '').includes(deferredFilters.cuil)) return false;
    if (deferredFilters.fecha_from && r.fecha_warning && r.fecha_warning < deferredFilters.fecha_from) return false;
    if (deferredFilters.fecha_to && r.fecha_warning && r.fecha_warning > deferredFilters.fecha_to) return false;
    if (deferredFilters.warning !== 'all' && !r[deferredFilters.warning as keyof UifRecord]) return false;
    if (deferredFilters.riesgo !== 'all' && r.riesgo_auditado !== deferredFilters.riesgo) return false;
    if (deferredFilters.riesgo_auditado !== 'all') {
      const auditado = isAuditado(r);
      if (deferredFilters.riesgo_auditado === 'auditado' && !auditado) return false;
      if (deferredFilters.riesgo_auditado === 'no_auditado' && auditado) return false;
    }
    return true;
  }), [records, deferredFilters]);

  const hasFilters = Object.entries(filters).some(([, v]) => v !== '' && v !== 'all');

  const cuilRanking = useMemo(() => {
    const map = new Map<string, { cuil: string; warnings: number; riesgoAlto: number }>();
    for (const r of records) {
      const entry = map.get(r.cuil) ?? { cuil: r.cuil, warnings: 0, riesgoAlto: 0 };
      entry.warnings++;
      if (r.riesgo_auditado === 'ALTO' || r.riesgo === 'ALTO') entry.riesgoAlto++;
      map.set(r.cuil, entry);
    }
    return Array.from(map.values()).sort((a, b) => b.warnings - a.warnings);
  }, [records]);

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
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Total', value: stats.total, color: 'text-zinc-200', icon: null },
          { label: 'Sin Auditar', value: stats.sinAuditoria, color: 'text-amber-400', icon: <Clock className="w-4 h-4" /> },
          { label: 'Auditados', value: stats.auditados, color: 'text-blue-400', icon: <CheckCircle2 className="w-4 h-4" /> },
          { label: 'Riesgo Alto', value: stats.riesgoAlto, color: 'text-rose-400', icon: <ShieldAlert className="w-4 h-4" /> },
        ].map(s => (
          <div key={s.label} className="bg-slate-900 border border-slate-800 rounded-xl p-3">
            <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1">{s.label}</p>
            <div className={`flex items-center gap-1.5 ${s.color}`}>
              {s.icon}
              <span className="text-xl font-black">{(s.value ?? 0).toLocaleString('es-AR')}</span>
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
        <div className="grid gap-2" style={{ gridTemplateColumns: '7rem 7rem 9rem 9rem 1.4fr 1.6fr' }}>
          <input
            type="text"
            value={filters.loan_id}
            onChange={e => setFilters(f => ({ ...f, loan_id: e.target.value }))}
            placeholder="Loan ID…"
            className="bg-slate-800 border border-slate-700 text-xs text-white rounded-lg px-3 py-1.5 focus:outline-none focus:border-zinc-500 placeholder-zinc-600"
          />
          <input
            type="text"
            value={filters.cuil}
            onChange={e => setFilters(f => ({ ...f, cuil: e.target.value }))}
            placeholder="CUIL…"
            className="bg-slate-800 border border-slate-700 text-xs text-white rounded-lg px-3 py-1.5 focus:outline-none focus:border-zinc-500 placeholder-zinc-600"
          />
          <input type="date" value={filters.fecha_from}
            title="Fecha Warning — desde"
            onChange={e => setFilters(f => ({ ...f, fecha_from: e.target.value }))}
            className="bg-slate-800 border border-slate-700 text-xs text-white rounded-lg px-2 py-1.5 focus:outline-none focus:border-zinc-500 [color-scheme:dark]" />
          <input type="date" value={filters.fecha_to}
            title="Fecha Warning — hasta"
            onChange={e => setFilters(f => ({ ...f, fecha_to: e.target.value }))}
            className="bg-slate-800 border border-slate-700 text-xs text-white rounded-lg px-2 py-1.5 focus:outline-none focus:border-zinc-500 [color-scheme:dark]" />
          <select value={filters.warning} onChange={e => setFilters(f => ({ ...f, warning: e.target.value }))}
            className="bg-slate-800 border border-slate-700 text-xs text-white rounded-lg px-3 py-1.5 focus:outline-none">
            <option value="all">Warning: Todos</option>
            <option value="warning_cancelacion_anticipada">Cancelación anticipada</option>
            <option value="warning_pep_o_so">PEP / SO</option>
            <option value="warning_smvm_men_anual">SMVM mensual/anual</option>
            <option value="warning_pagador_indirecto">Pagador indirecto</option>
          </select>
          <div className="grid grid-cols-2 gap-2">
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
              <option value="auditado">Auditado</option>
              <option value="no_auditado">No auditado</option>
            </select>
          </div>
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
                  onReset={handleReset}
                />
              ))}
            </tbody>
          </table>
        </DualScroll>
      </div>

      {/* Ranking por CUIL */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-800 flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-rose-400" />
          <span className="text-xs font-bold text-zinc-300 uppercase tracking-wider">Ranking CUIL por cantidad de warnings</span>
        </div>
        <div className="overflow-y-auto max-h-72">
        <table className="w-full text-left border-collapse">
          <thead className="sticky top-0 bg-slate-800">
            <tr>
              <th className="px-4 py-2 text-[10px] font-bold text-zinc-400 uppercase tracking-wider w-10">#</th>
              <th className="px-4 py-2 text-[10px] font-bold text-zinc-400 uppercase tracking-wider">CUIL</th>
              <th className="px-4 py-2 text-[10px] font-bold text-zinc-400 uppercase tracking-wider text-right">Warnings</th>
              <th className="px-4 py-2 text-[10px] font-bold text-zinc-400 uppercase tracking-wider text-right">Riesgo Alto</th>
            </tr>
          </thead>
          <tbody>
            {cuilRanking.slice(0, 50).map((entry, i) => (
              <tr key={entry.cuil} className="border-t border-slate-800/60 hover:bg-slate-800/30 transition-colors">
                <td className="px-4 py-2 text-[11px] text-zinc-600 font-mono">{i + 1}</td>
                <td className="px-4 py-2 text-xs font-mono text-zinc-200">{entry.cuil}</td>
                <td className="px-4 py-2 text-right">
                  <span className="text-sm font-black text-blue-400">{entry.warnings}</span>
                </td>
                <td className="px-4 py-2 text-right">
                  {entry.riesgoAlto > 0
                    ? <span className="text-sm font-black text-rose-400">{entry.riesgoAlto}</span>
                    : <span className="text-zinc-700">—</span>
                  }
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  );
}
