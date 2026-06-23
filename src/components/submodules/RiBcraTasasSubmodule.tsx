import { useState, useEffect, useRef, useCallback } from 'react';
import { Download, Loader2, RefreshCcw, AlertCircle } from 'lucide-react';

const COLUMNS: { key: string; label: string }[] = [
  { key: 'nombre_largo', label: 'Nombre Largo' },
  { key: 'nombre_corto', label: 'Nombre Corto' },
  { key: 'denominacion', label: 'Denominación' },
  { key: 'maximo_capital_desembolsado', label: 'Máx. Capital' },
  { key: 'minimo_capital_desembolsado', label: 'Mín. Capital' },
  { key: 'maximo_plazo', label: 'Máx. Plazo' },
  { key: 'ingreso_minimo_mensual_solicitado', label: 'Ingreso Mín.' },
  { key: 'antiguedad_laboral_minima', label: 'Antigüedad Mín.' },
  { key: 'edad_maxima_solicitada', label: 'Edad Máx.' },
  { key: 'relacion_cuota_ingreso', label: 'Rel. Cuota/Ingreso' },
  { key: 'todos_los_beneficiarios', label: 'Todos Beneficiarios' },
  { key: 'cancelacion_anticipada', label: 'Cancelación Anticipada' },
  { key: 'tea_maxima', label: 'TEA Máx.' },
  { key: 'tipo_de_tasa', label: 'Tipo de Tasa' },
  { key: 'cft_maxima', label: 'CFT Máx.' },
  { key: 'cuota_cada_1000000', label: 'Cuota c/1.000.000' },
  { key: 'territorio_nacional', label: 'Territorio Nacional' },
  { key: 'mas_informacion', label: 'Más Información' },
];

function DualScroll({ children, minWidth = '2400px', maxHeight = '500px' }: { children: React.ReactNode; minWidth?: string; maxHeight?: string }) {
  const topRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const syncing = useRef(false);

  useEffect(() => {
    if (!bodyRef.current || !topRef.current) return;
    requestAnimationFrame(() => {
      if (!bodyRef.current || !topRef.current) return;
      const inner = topRef.current.querySelector('div');
      if (inner) inner.style.minWidth = `${bodyRef.current.scrollWidth}px`;
      topRef.current.style.marginRight = `${bodyRef.current.offsetWidth - bodyRef.current.clientWidth}px`;
    });
  }, [children]);

  const onTop = () => { if (syncing.current || !bodyRef.current || !topRef.current) return; syncing.current = true; bodyRef.current.scrollLeft = topRef.current.scrollLeft; syncing.current = false; };
  const onBody = () => { if (syncing.current || !topRef.current || !bodyRef.current) return; syncing.current = true; topRef.current.scrollLeft = bodyRef.current.scrollLeft; syncing.current = false; };

  return (
    <div>
      <div ref={topRef} onScroll={onTop} className="overflow-x-auto overflow-y-hidden [&::-webkit-scrollbar]:h-3 [&::-webkit-scrollbar-thumb]:rounded [&::-webkit-scrollbar-thumb]:bg-blue-500 [&::-webkit-scrollbar-track]:bg-slate-800">
        <div style={{ minWidth, height: '1px' }} />
      </div>
      <div ref={bodyRef} onScroll={onBody} style={{ maxHeight }} className="overflow-x-auto overflow-y-scroll [&::-webkit-scrollbar]:h-3 [&::-webkit-scrollbar-thumb]:rounded [&::-webkit-scrollbar-thumb]:bg-blue-500 [&::-webkit-scrollbar-track]:bg-slate-800">
        {children}
      </div>
    </div>
  );
}

export default function RiBcraTasasSubmodule() {
  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/ri-bcra-tasas');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setRecords(json.records);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await fetch('/api/ri-bcra-tasas/export');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const cd = res.headers.get('Content-Disposition') ?? '';
      const match = cd.match(/filename="([^"]+)"/);
      const filename = match ? match[1] : 'PERSONALES.txt';
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename; a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      alert(`Error al exportar: ${e.message}`);
    } finally {
      setExporting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 min-h-[50vh]">
        <Loader2 className="w-10 h-10 animate-spin text-blue-400" />
        <p className="text-zinc-400 text-sm font-semibold animate-pulse">Cargando tasas...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 min-h-[50vh]">
        <AlertCircle className="w-10 h-10 text-rose-400" />
        <p className="text-zinc-400 text-sm">{error}</p>
        <button onClick={fetchData} className="flex items-center gap-2 px-4 py-2 bg-slate-800 rounded-xl text-zinc-300 text-sm font-bold hover:bg-slate-700 transition-colors">
          <RefreshCcw className="w-4 h-4" /> Reintentar
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-1">
      {/* Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-white">RI-BCRA Tasas</h2>
          <p className="text-xs text-zinc-500 mt-0.5">{records.length} producto{records.length !== 1 ? 's' : ''} · Régimen Informativo BCRA</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={fetchData} className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-zinc-400 transition-colors" title="Actualizar">
            <RefreshCcw className="w-4 h-4" />
          </button>
          <button
            onClick={handleExport}
            disabled={exporting || records.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl text-sm font-bold transition-colors"
          >
            {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            Exportar PERSONALES
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
        <DualScroll minWidth="2400px" maxHeight="500px">
          <table className="w-full text-left border-collapse min-w-[2400px]">
            <thead className="sticky top-0 z-10 bg-slate-800">
              <tr>
                {COLUMNS.map(col => (
                  <th key={col.key} className="px-4 py-3 text-[10px] font-bold text-zinc-400 uppercase tracking-wider border-b border-slate-700 whitespace-nowrap">
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {records.length === 0 ? (
                <tr>
                  <td colSpan={COLUMNS.length} className="px-6 py-12 text-center text-zinc-500 text-sm">
                    No hay datos disponibles.
                  </td>
                </tr>
              ) : records.map((row, i) => (
                <tr key={i} className="hover:bg-slate-800/50 transition-colors">
                  {COLUMNS.map(col => (
                    <td key={col.key} className="px-4 py-3 text-xs text-zinc-300 whitespace-nowrap">
                      {row[col.key] === null || row[col.key] === undefined ? <span className="text-zinc-600">—</span> : String(row[col.key])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </DualScroll>
      </div>
    </div>
  );
}
