import React, { useState, useMemo, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Save, ChevronLeft, ChevronRight, AlertCircle, CheckCircle2, Clock } from 'lucide-react';

export interface AuditUpdate {
  record: Record<string, any>;
  value: string;
}

interface AuditInboxProps {
  records: Record<string, any>[];
  keyColumns: string[];
  auditColumn: string;
  priorityColumns?: string[];
  pageSize?: number;
  onSave: (updates: AuditUpdate[]) => Promise<void>;
  saving?: boolean;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:?\d{2})?)?$/;

function formatCell(value: any): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'boolean') return value ? 'Sí' : 'No';
  if (value instanceof Date) return value.toLocaleDateString('es-AR');
  const s = String(value);
  if (DATE_RE.test(s)) return s.slice(0, 10);
  return s.length > 40 ? s.substring(0, 40) + '…' : s;
}

export default function AuditInbox({
  records,
  keyColumns,
  auditColumn,
  priorityColumns = [],
  pageSize = 50,
  onSave,
  saving = false,
}: AuditInboxProps) {
  const [pendingEdits, setPendingEdits] = useState<Record<string, string>>({});
  const [page, setPage] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const topScrollRef = useRef<HTMLDivElement>(null);
  const bottomScrollRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLTableElement>(null);
  const [tableScrollWidth, setTableScrollWidth] = useState(0);

  useEffect(() => {
    if (!tableRef.current) return;
    const observer = new ResizeObserver(() => {
      setTableScrollWidth(tableRef.current?.scrollWidth ?? 0);
    });
    observer.observe(tableRef.current);
    return () => observer.disconnect();
  }, [records, page]);

  const syncFromTop = () => {
    if (bottomScrollRef.current && topScrollRef.current)
      bottomScrollRef.current.scrollLeft = topScrollRef.current.scrollLeft;
  };
  const syncFromBottom = () => {
    if (topScrollRef.current && bottomScrollRef.current)
      topScrollRef.current.scrollLeft = bottomScrollRef.current.scrollLeft;
  };

  const getKey = (record: Record<string, any>) =>
    JSON.stringify(keyColumns.map(k => record[k]));

  const columns = useMemo(() => {
    if (records.length === 0) return [];
    const all = Object.keys(records[0]);
    const priority = priorityColumns.filter(c => all.includes(c));
    const rest = all.filter(c => !priority.includes(c) && c !== auditColumn).sort();
    return [...priority, ...rest];
  }, [records, priorityColumns, auditColumn]);

  const totalPages = Math.ceil(records.length / pageSize);
  const pageRecords = records.slice(page * pageSize, (page + 1) * pageSize);
  const pendingCount = Object.keys(pendingEdits).length;

  const handleEdit = (record: Record<string, any>, value: string) => {
    const key = getKey(record);
    setPendingEdits(prev => ({ ...prev, [key]: value }));
    setSaveSuccess(false);
  };

  const handleSave = async () => {
    setError(null);
    const updates: AuditUpdate[] = Object.entries(pendingEdits).map(([key, value]) => {
      const record = records.find(r => getKey(r) === key)!;
      return { record, value };
    });
    try {
      await onSave(updates);
      setPendingEdits({});
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 4000);
    } catch (err: any) {
      setError(err.message || 'Error al guardar');
    }
  };

  const getDisplayValue = (record: Record<string, any>) => {
    const key = getKey(record);
    return key in pendingEdits ? pendingEdits[key] : (record[auditColumn] || '');
  };

  const getRowState = (record: Record<string, any>): 'pending' | 'audited' | 'empty' => {
    const key = getKey(record);
    if (key in pendingEdits) return 'pending';
    if (record[auditColumn]) return 'audited';
    return 'empty';
  };

  if (records.length === 0) {
    return (
      <div className="flex items-center justify-center py-16 text-zinc-500 text-sm">
        No hay registros que coincidan con los filtros aplicados.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Control bar */}
      <div className="flex items-center justify-between flex-wrap gap-3 px-1">
        <div className="flex items-center gap-4 flex-wrap">
          <span className="text-sm text-zinc-400 font-medium">
            {records.length.toLocaleString('es-AR')} registro{records.length !== 1 ? 's' : ''}
          </span>
          <AnimatePresence>
            {pendingCount > 0 && (
              <motion.span
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -8 }}
                className="flex items-center gap-1.5 text-xs font-bold text-amber-400"
              >
                <Clock className="w-3.5 h-3.5" />
                {pendingCount} cambio{pendingCount !== 1 ? 's' : ''} sin guardar
              </motion.span>
            )}
          </AnimatePresence>
          <AnimatePresence>
            {saveSuccess && (
              <motion.span
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }}
                className="flex items-center gap-1.5 text-xs font-bold text-emerald-400"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                Guardado correctamente
              </motion.span>
            )}
          </AnimatePresence>
          {error && (
            <span className="flex items-center gap-1.5 text-xs font-bold text-red-400">
              <AlertCircle className="w-3.5 h-3.5" />
              {error}
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          {totalPages > 1 && (
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
                className="p-1 rounded-lg hover:bg-slate-800 disabled:opacity-30 text-zinc-400 transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-xs text-zinc-500 font-bold px-1">
                {page + 1} / {totalPages}
              </span>
              <button
                onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={page === totalPages - 1}
                className="p-1 rounded-lg hover:bg-slate-800 disabled:opacity-30 text-zinc-400 transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
          <AnimatePresence>
            {pendingCount > 0 && (
              <motion.button
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition-colors shadow-lg shadow-emerald-900/30"
              >
                <Save className="w-3.5 h-3.5" />
                Guardar Auditoría ({pendingCount})
              </motion.button>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Top scroll mirror */}
      <div
        ref={topScrollRef}
        onScroll={syncFromTop}
        className="overflow-x-auto overflow-y-hidden rounded-t-xl border border-b-0 border-slate-800"
        style={{ height: 12 }}
      >
        <div style={{ width: tableScrollWidth, height: 1 }} />
      </div>

      {/* Table */}
      <div
        ref={bottomScrollRef}
        onScroll={syncFromBottom}
        className="overflow-x-auto rounded-b-xl border border-t-0 border-slate-800 shadow-sm"
      >
        <table ref={tableRef} className="w-full text-sm border-collapse min-w-max">
          <thead>
            <tr className="bg-slate-900 border-b border-slate-700">
              {columns.map(col => (
                <th
                  key={col}
                  className={`px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider whitespace-nowrap ${
                    col === 'auditor_legal' ? 'text-amber-400' : 'text-zinc-500'
                  }`}
                >
                  {col.replace(/_/g, ' ')}
                </th>
              ))}
              <th className="px-3 py-2.5 text-left text-[10px] font-bold text-emerald-500 uppercase tracking-wider whitespace-nowrap min-w-[240px] sticky right-0 bg-slate-900 border-l border-slate-700">
                {auditColumn.replace(/_/g, ' ')}
              </th>
            </tr>
          </thead>
          <tbody>
            {pageRecords.map((record, idx) => {
              const state = getRowState(record);
              return (
                <tr
                  key={idx}
                  className={`border-b border-slate-800/50 transition-colors ${
                    state === 'pending'
                      ? 'bg-amber-950/10'
                      : idx % 2 === 0
                      ? 'bg-slate-950'
                      : 'bg-slate-900/30'
                  }`}
                >
                  {columns.map(col => (
                    <td key={col} className="px-3 py-2 text-xs text-zinc-300 whitespace-nowrap max-w-[160px] truncate">
                      {col.startsWith('aviso_') ? (
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          record[col] ? 'bg-red-900/40 text-red-400 border border-red-800/50' : 'bg-slate-800 text-zinc-600'
                        }`}>
                          {record[col] ? 'SI' : 'NO'}
                        </span>
                      ) : col === 'auditor_legal' ? (
                        <span className="font-bold text-amber-400" title={String(record[col] ?? '')}>
                          {formatCell(record[col])}
                        </span>
                      ) : (
                        <span title={String(record[col] ?? '')}>{formatCell(record[col])}</span>
                      )}
                    </td>
                  ))}
                  <td className="px-3 py-2 min-w-[240px] sticky right-0 border-l border-slate-800/50 bg-inherit">
                    <textarea
                      value={getDisplayValue(record)}
                      onChange={e => handleEdit(record, e.target.value)}
                      rows={2}
                      placeholder="Escribir auditoría..."
                      className={`w-full bg-slate-800/70 text-xs text-zinc-200 rounded-lg px-2.5 py-2 resize-none focus:outline-none focus:ring-1 placeholder-zinc-600 transition-all ${
                        state === 'pending'
                          ? 'border border-amber-500/60 focus:ring-amber-500/30 bg-amber-950/20'
                          : state === 'audited'
                          ? 'border border-emerald-700/50 focus:ring-emerald-500/20'
                          : 'border border-slate-700 focus:ring-zinc-500/20'
                      }`}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
