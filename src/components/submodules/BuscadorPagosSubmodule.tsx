import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Search, Download, RotateCcw, Loader2, AlertCircle } from 'lucide-react';
import * as XLSX from 'xlsx';

type Country = 'ARG' | 'COL';

export default function BuscadorPagosSubmodule() {
  const [country, setCountry] = useState<Country>('ARG');
  const [inputValue, setInputValue] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  const label = country === 'ARG' ? 'CUIL' : 'Cédula';

  const handleCountryChange = (c: Country) => {
    setCountry(c);
    setInputValue('');
    setResults([]);
    setSearched(false);
    setError(null);
  };

  const handleSearch = async () => {
    if (!inputValue.trim()) return;
    setLoading(true);
    setError(null);
    setSearched(false);
    setResults([]);

    try {
      const response = await fetch('/api/collections-s3');
      if (!response.ok) throw new Error('Error al cargar los datos del servidor.');
      const data: any[] = await response.json();

      const countryKey = country === 'ARG' ? 'ARGENTIN' : 'COLOMB';

      const filtered = data
        .filter(row => String(row.pais || '').toUpperCase().includes(countryKey))
        .filter(row => String(row.identificacion_cliente || '') === inputValue)
        .sort((a, b) => {
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

      setResults(filtered);
      setSearched(true);
    } catch (e: any) {
      setError(e.message || 'Error desconocido');
    } finally {
      setLoading(false);
    }
  };

  const handleExport = () => {
    if (!results.length) return;
    const ws = XLSX.utils.json_to_sheet(results);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Pagos');
    const today = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `buscador_pagos_${inputValue}_${today}.xlsx`);
  };

  const handleReset = () => {
    setInputValue('');
    setResults([]);
    setSearched(false);
    setError(null);
  };

  const columns = results.length > 0 ? Object.keys(results[0]) : [];

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
          {/* Country selector */}
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

          {/* Identifier input */}
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

          {/* Search button */}
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

      {/* Error */}
      {error && (
        <div className="flex items-center gap-3 p-4 bg-red-900/30 border border-red-700/50 rounded-xl text-red-400 text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {/* No results */}
      {searched && !loading && results.length === 0 && !error && (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <Search className="w-10 h-10 text-zinc-700" />
          <p className="text-zinc-500 text-sm">
            No se encontraron registros para ese identificador en {country === 'ARG' ? 'Argentina' : 'Colombia'}.
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

      {/* Results */}
      {results.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col gap-3"
        >
          <div className="flex items-center justify-between">
            <span className="text-sm text-zinc-400">
              <span className="font-bold text-white">{results.length}</span>{' '}
              registro{results.length !== 1 ? 's' : ''} encontrado{results.length !== 1 ? 's' : ''}
            </span>
            <div className="flex gap-2">
              <button
                onClick={handleReset}
                className="flex items-center gap-2 px-4 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-zinc-300 font-bold text-xs rounded-xl transition-all"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Nueva búsqueda
              </button>
              <button
                onClick={handleExport}
                className="flex items-center gap-2 px-4 py-1.5 bg-emerald-800/60 hover:bg-emerald-700/60 border border-emerald-700/50 text-emerald-300 font-bold text-xs rounded-xl transition-all"
              >
                <Download className="w-3.5 h-3.5" />
                Exportar Excel
              </button>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-700">
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
                {results.map((row, i) => (
                  <tr key={i} className={i % 2 === 0 ? 'bg-slate-900' : 'bg-slate-800/30'}>
                    {columns.map(col => (
                      <td
                        key={col}
                        className="px-3 py-2 text-zinc-300 whitespace-nowrap border-b border-slate-800/60"
                      >
                        {row[col] != null ? String(row[col]) : '—'}
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
