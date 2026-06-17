import React, { useState, useRef, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Search, RotateCcw, Loader2, AlertCircle } from 'lucide-react';

type Country = 'ARG' | 'COL';

const FILTER_FIELDS: { key: string; label: string }[] = [
  { key: 'fecha_pago', label: 'Fecha de Pago' },
  { key: 'metodo_pago', label: 'Método Pago' },
  { key: 'medio_pago', label: 'Medio Pago' },
  { key: 'agencia_cobranzas', label: 'Agencia' },
  { key: 'concepto_imputacion_detallado', label: 'Concepto' },
];

const EMPTY_FILTERS: Record<string, string> = Object.fromEntries(FILTER_FIELDS.map(f => [f.key, '']));

function formatCurrency(num: number): string {
  const [intPart, decPart] = num.toFixed(2).split('.');
  return '$ ' + intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + decPart;
}

function formatCell(col: string, val: any): string {
  if (val == null || val === '') return '—';
  if (col === 'monto_pago') {
    const num = parseFloat(val);
    return isNaN(num) ? '—' : formatCurrency(num);
  }
  if (col.toLowerCase().includes('fecha')) {
    try {
      const d = new Date(val);
      if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    } catch {}
  }
  return String(val);
}

export default function BuscadorPagosSubmodule() {
  const [country, setCountry] = useState<Country>('ARG');
  const [inputValue, setInputValue] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const [filters, setFilters] = useState<Record<string, string>>(EMPTY_FILTERS);
  const [tableContentWidth, setTableContentWidth] = useState(0);

  const topScrollRef = useRef<HTMLDivElement>(null);
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const isSyncingRef = useRef(false);

  const label = country === 'ARG' ? 'CUIL' : 'Cédula';
  const columns = results.length > 0 ? Object.keys(results[0]) : [];

  useEffect(() => {
    requestAnimationFrame(() => {
      if (tableScrollRef.current) {
        setTableContentWidth(tableScrollRef.current.scrollWidth);
      }
    });
  }, [results, filters]);

  const handleTopScroll = () => {
    if (isSyncingRef.current) return;
    isSyncingRef.current = true;
    if (tableScrollRef.current && topScrollRef.current) {
      tableScrollRef.current.scrollLeft = topScrollRef.current.scrollLeft;
    }
    isSyncingRef.current = false;
  };

  const handleTableScroll = () => {
    if (isSyncingRef.current) return;
    isSyncingRef.current = true;
    if (topScrollRef.current && tableScrollRef.current) {
      topScrollRef.current.scrollLeft = tableScrollRef.current.scrollLeft;
    }
    isSyncingRef.current = false;
  };

  const filterOptions = useMemo(() => {
    const opts: Record<string, string[]> = {};
    for (const { key } of FILTER_FIELDS) {
      opts[key] = [...new Set(results.map(r => formatCell(key, r[key])).filter(v => v !== '—'))].sort();
    }
    return opts;
  }, [results]);

  const displayResults = useMemo(() => {
    return results.filter(row => {
      for (const { key } of FILTER_FIELDS) {
        const filterVal = filters[key];
        if (!filterVal) continue;
        if (formatCell(key, row[key]) !== filterVal) return false;
      }
      return true;
    });
  }, [results, filters]);

  const totalMontoPago = useMemo(() =>
    displayResults.reduce((sum, row) => {
      const val = parseFloat(row['monto_pago']);
      return sum + (isNaN(val) ? 0 : val);
    }, 0)
  , [displayResults]);

  const activeFiltersCount = Object.values(filters).filter(Boolean).length;

  const handleCountryChange = (c: Country) => {
    setCountry(c);
    setInputValue('');
    setResults([]);
    setSearched(false);
    setError(null);
    setFilters(EMPTY_FILTERS);
  };

  const handleSearch = async () => {
    if (!inputValue.trim()) return;
    setLoading(true);
    setError(null);
    setSearched(false);
    setResults([]);
    setFilters(EMPTY_FILTERS);

    try {
      const params = new URLSearchParams({ identificacion_cliente: inputValue });
      const response = await fetch(`/api/collections-s3?${params}`);
      if (!response.ok) throw new Error('Error al cargar los datos del servidor.');
      const json = await response.json();
      const data: any[] = Array.isArray(json) ? json : (json.records || []);

      const sorted = data.sort((a, b) => {
        const tipoA = String(a.tipo_producto || '');
        const tipoB = String(b.tipo_producto || '');
        if (tipoA !== tipoB) return tipoA.localeCompare(tipoB);

        const idA = String(a.id_producto || '');
        const idB = String(b.id_producto || '');
        if (idA !== idB) return idA.localeCompare(idB);

        const fechaA = String(a.fecha_pago || '');
        const fechaB = String(b.fecha_pago || '');
        return fechaA.localeCompare(fechaB);
      });

      setResults(sorted);
      setSearched(true);
    } catch (e: any) {
      setError(e.message || 'Error desconocido');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setInputValue('');
    setResults([]);
    setSearched(false);
    setError(null);
    setFilters(EMPTY_FILTERS);
  };

  return (
    <div className="flex-1 flex flex-col p-6 gap-6 overflow-auto">
      {/* Search form */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-slate-900 border border-slate-700 rounded-2xl p-6 space-y-4"
      >
        <div>
          <h2 className="text-lg font-bold text-white">Buscador de Pagos</h2>
          <p className="text-zinc-500 text-sm mt-0.5">Ingresá el identificador del cliente para ver todos sus registros en cobranzas.</p>
        </div>

        <div className="flex flex-wrap gap-4 items-end">
          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">País</span>
            <div className="flex gap-2">
              {(['ARG', 'COL'] as Country[]).map(c => (
                <button
                  key={c}
                  onClick={() => handleCountryChange(c)}
                  className={`px-4 py-1.5 rounded-lg text-sm font-bold border transition-all ${
                    country === c
                      ? 'bg-indigo-600 border-indigo-500 text-white'
                      : 'bg-slate-800 border-slate-700 text-zinc-400 hover:border-zinc-500 hover:text-white'
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1.5 flex-1 min-w-48">
            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">{label}</span>
            <input
              type="text"
              inputMode="numeric"
              value={inputValue}
              onChange={e => { if (/^\d*$/.test(e.target.value)) setInputValue(e.target.value); }}
              onKeyDown={e => { if (e.key === 'Enter' && !loading && inputValue) handleSearch(); }}
              placeholder={`Ingresar ${label}...`}
              className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-2 text-white text-sm focus:outline-none focus:border-indigo-500 transition-colors placeholder:text-zinc-600"
            />
          </div>

          <button
            onClick={handleSearch}
            disabled={loading || !inputValue}
            className="flex items-center gap-2 px-5 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-sm rounded-xl transition-all"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            {loading ? 'Buscando...' : 'Buscar'}
          </button>
        </div>
      </motion.div>

      {error && (
        <div className="flex items-center gap-3 p-4 bg-red-900/30 border border-red-700/50 rounded-xl text-red-400 text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {searched && !loading && results.length === 0 && !error && (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <Search className="w-10 h-10 text-zinc-700" />
          <p className="text-zinc-500 text-sm">
            No se encontraron registros para ese identificador.
          </p>
          <button
            onClick={handleReset}
            className="flex items-center gap-2 px-4 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-zinc-300 font-bold text-xs rounded-xl transition-all mt-2"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Nueva búsqueda
          </button>
        </div>
      )}

      {results.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col gap-3"
        >
          {/* Filters */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 p-4 bg-slate-900/50 border border-slate-700 rounded-xl">
            {FILTER_FIELDS.map(({ key, label: flabel }) => (
              <div key={key} className="flex flex-col gap-1">
                <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">{flabel}</span>
                <select
                  value={filters[key]}
                  onChange={e => setFilters(prev => ({ ...prev, [key]: e.target.value }))}
                  className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-white text-xs focus:outline-none focus:border-indigo-500 transition-colors"
                >
                  <option value="">Todos</option>
                  {filterOptions[key]?.map(opt => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          {/* Header */}
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-4 flex-wrap">
              <span className="text-sm text-zinc-400">
                <span className="font-bold text-white">{displayResults.length}</span>{' '}
                de <span className="font-bold text-white">{results.length}</span> registros
                {activeFiltersCount > 0 && (
                  <span className="text-indigo-400 ml-1.5">
                    · {activeFiltersCount} filtro{activeFiltersCount > 1 ? 's' : ''} activo{activeFiltersCount > 1 ? 's' : ''}
                  </span>
                )}
              </span>
              <div className="flex gap-3">
                <div className="px-3 py-1 bg-slate-800 border border-slate-700 rounded-lg">
                  <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Cantidad pagos</p>
                  <p className="text-sm font-bold text-white">{displayResults.length}</p>
                </div>
                <div className="px-3 py-1 bg-slate-800 border border-slate-700 rounded-lg">
                  <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Total monto</p>
                  <p className="text-sm font-bold text-emerald-400">{formatCurrency(totalMontoPago)}</p>
                </div>
              </div>
            </div>
            <button
              onClick={handleReset}
              className="flex items-center gap-2 px-4 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-zinc-300 font-bold text-xs rounded-xl transition-all"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Nueva búsqueda
            </button>
          </div>

          {/* Top scrollbar mirror */}
          <div
            ref={topScrollRef}
            onScroll={handleTopScroll}
            className="overflow-x-auto rounded-t-xl border-x border-t border-slate-700"
            style={{ height: '14px' }}
          >
            <div style={{ width: tableContentWidth > 0 ? tableContentWidth : '100%', height: '1px' }} />
          </div>

          {/* Table */}
          <div
            ref={tableScrollRef}
            onScroll={handleTableScroll}
            className="overflow-x-auto rounded-b-xl border border-t-0 border-slate-700"
          >
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-800/80">
                  {columns.map(col => (
                    <th
                      key={col}
                      className="px-3 py-2.5 text-left font-bold text-zinc-400 uppercase tracking-wider whitespace-nowrap border-b border-slate-700"
                    >
                      {col.replace(/_/g, ' ')}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {displayResults.map((row, i) => (
                  <tr key={i} className={i % 2 === 0 ? 'bg-slate-900' : 'bg-slate-800/30'}>
                    {columns.map(col => (
                      <td
                        key={col}
                        className="px-3 py-2 text-zinc-300 whitespace-nowrap border-b border-slate-800/60"
                      >
                        {formatCell(col, row[col])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>
      )}
    </div>
  );
}
