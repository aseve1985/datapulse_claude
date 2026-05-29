import React, { useState, useMemo, useRef, useEffect } from 'react';
import { motion } from 'motion/react';
import { Database, Loader2, Download, Filter, X, RefreshCcw, FileText, ChevronLeft, ChevronRight } from 'lucide-react';

const PAGE_SIZE = 50;
const DATE_RE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:?\d{2})?)?$/;

function formatCell(value: any): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'boolean') return value ? 'Sí' : 'No';
  const s = String(value);
  if (DATE_RE.test(s)) return s.slice(0, 10);
  return s.length > 50 ? s.substring(0, 50) + '…' : s;
}

export default function RiExperianSubmodule() {
  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);

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
      setRecords(data.records || []);
      setLoaded(true);
      setPage(0);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const columns = useMemo(() => {
    if (!records.length) return [];
    return Object.keys(records[0]);
  }, [records]);

  const filteredRecords = useMemo(() => {
    if (!search.trim()) return records;
    const q = search.toLowerCase();
    return records.filter(r =>
      columns.some(col => String(r[col] ?? '').toLowerCase().includes(q))
    );
  }, [records, search, columns]);

  useEffect(() => { setPage(0); }, [search]);

  const totalPages = Math.ceil(filteredRecords.length / PAGE_SIZE);
  const pageRecords = filteredRecords.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  // Extrae la fecha del header (fila que empieza con 'H'): HHHHHHHHHHHHHHHHHH050193 05 20260430 M
  // posiciones 26-33 del string concatenado
  const periodo = useMemo(() => {
    const header = records.find(r => String(r.concatenado ?? '').startsWith('H'));
    if (!header) return null;
    const raw = String(header.concatenado).slice(26, 34);
    if (!/^\d{8}$/.test(raw)) return null;
    return raw; // "20260430"
  }, [records]);

  const handleExport = () => {
    if (!records.length) return;
    const content = records.map(r => r.concatenado ?? '').join('\n');

    // Último día del mes anterior
    const now = new Date();
    const lastDay = new Date(now.getFullYear(), now.getMonth(), 0);
    const yyyymmdd = lastDay.toISOString().slice(0, 10).replace(/-/g, '');
    const filename = `050193.${yyyymmdd}.T.txt`;

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

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
            {loading ? 'Cargando registros…' : 'Cargar Registros'}
          </button>
        </motion.div>
      </div>
    );
  }

  // ── Main view ────────────────────────────────────────────────────────────────
  return (
    <div className="flex-1 p-6 space-y-5 max-w-full overflow-hidden">

      {/* Stats + actions row */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex items-center gap-6">
          <div>
            <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1">Total registros</p>
            <span className="text-2xl font-black text-zinc-200">{records.length.toLocaleString('es-AR')}</span>
          </div>
          {periodo && (
            <>
              <div className="w-px h-8 bg-slate-700" />
              <div>
                <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1">Mes a presentar</p>
                <span className="text-2xl font-black text-emerald-400">{periodo}</span>
              </div>
            </>
          )}
          {search.trim() && filteredRecords.length !== records.length && (
            <>
              <div className="w-px h-8 bg-slate-700" />
              <div>
                <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1">Filtrados</p>
                <span className="text-2xl font-black text-indigo-400">{filteredRecords.length.toLocaleString('es-AR')}</span>
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
            disabled={!records.length}
            className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm rounded-xl transition-colors disabled:opacity-40 shadow-lg"
          >
            <Download className="w-4 h-4" />
            Exportar TXT
          </button>
        </div>
      </div>

      {/* Search filter */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 text-zinc-400">
            <Filter className="w-3.5 h-3.5" />
            <span className="text-xs font-bold uppercase tracking-wider">Filtrar</span>
          </div>
          {search && (
            <button
              onClick={() => setSearch('')}
              className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-200 transition-colors"
            >
              <X className="w-3 h-3" /> Limpiar
            </button>
          )}
        </div>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar en todos los campos…"
          className="w-full bg-slate-800 border border-slate-700 text-xs text-white rounded-lg px-3 py-2 focus:outline-none focus:border-zinc-500 placeholder-zinc-600"
        />
      </div>

      {/* Top phantom scrollbar */}
      <div
        ref={topScrollRef}
        className="overflow-x-auto"
        style={{ height: 12 }}
        onScroll={syncFromTop}
      >
        <div style={{ width: tableScrollWidth, height: 1 }} />
      </div>

      {/* Table */}
      <div
        ref={bottomScrollRef}
        className="overflow-x-auto rounded-2xl border border-slate-800"
        onScroll={syncFromBottom}
      >
        {pageRecords.length === 0 ? (
          <div className="text-center py-12 text-zinc-600 text-sm">Sin registros</div>
        ) : (
          <table ref={tableRef} className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-slate-900 border-b border-slate-800 sticky top-0 z-10">
                {columns.map(col => (
                  <th
                    key={col}
                    className="px-3 py-2.5 text-left text-[10px] font-bold text-zinc-500 uppercase tracking-wider whitespace-nowrap"
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pageRecords.map((row, i) => (
                <tr
                  key={i}
                  className={`border-b border-slate-800/50 ${i % 2 === 0 ? 'bg-slate-950' : 'bg-slate-900/40'} hover:bg-slate-800/50 transition-colors`}
                >
                  {columns.map(col => (
                    <td key={col} className="px-3 py-2 text-zinc-300 whitespace-nowrap">
                      {formatCell(row[col])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-zinc-500">
          <span>
            Pág. <span className="font-bold text-zinc-300">{page + 1}</span> de {totalPages} —{' '}
            <span className="font-bold text-zinc-300">{filteredRecords.length.toLocaleString('es-AR')}</span> registros
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(0)}
              disabled={page === 0}
              className="px-2 py-1 rounded hover:bg-slate-800 disabled:opacity-30 font-bold"
            >«</button>
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
              className="px-2 py-1 rounded hover:bg-slate-800 disabled:opacity-30"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="px-2 py-1 rounded hover:bg-slate-800 disabled:opacity-30"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setPage(totalPages - 1)}
              disabled={page >= totalPages - 1}
              className="px-2 py-1 rounded hover:bg-slate-800 disabled:opacity-30 font-bold"
            >»</button>
          </div>
        </div>
      )}
    </div>
  );
}
