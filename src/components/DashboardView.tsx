import React, { useState, useEffect, useMemo, useRef, useDeferredValue } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  AreaChart, Area, Cell, PieChart, Pie,
  ScatterChart, Scatter, ZAxis
} from 'recharts';
import { PowerBIButton, ContactGrid } from './ContactSection';
import { 
  Calendar, TrendingUp, DollarSign, ShoppingBag,
  MessageSquare, Send, Loader2, RefreshCcw,
  ChevronRight, AlertCircle, Sparkles, User, Bot,
  Download, Filter, X, ArrowLeft, Database, ArrowRight,
  ChevronDown, Check, FileUp, Mic, MicOff, Copy, CheckCheck,
  BookmarkPlus, Bookmark, FolderOpen, Trash2, Activity
} from 'lucide-react';
import { 
  format, 
  parseISO, 
  subDays, 
  startOfMonth, 
  endOfMonth, 
  subMonths, 
  startOfQuarter 
} from 'date-fns';
import { es } from 'date-fns/locale';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import * as XLSX from 'xlsx';

import { ChatMessage } from '../types';
import { generateInsights, chatWithData } from '../services/gemini';
import { EXCHANGE_RATES } from '../constants';
import UifSubmodule from './submodules/UifSubmodule';
import ConsultasGeneralesModule from './submodules/ConsultasGeneralesModule';
import RiExperianSubmodule from './submodules/RiExperianSubmodule';
import BuscadorPagosSubmodule from './submodules/BuscadorPagosSubmodule';
import CarteraFideicomisoSubmodule from './submodules/CarteraFideicomisoSubmodule';
import RiBcraTasasSubmodule from './submodules/RiBcraTasasSubmodule';
import RiAnaliticoSubmodule from './submodules/RiAnaliticoSubmodule';
import RiAsistenteSubmodule from './submodules/RiAsistenteSubmodule';
import BiDocumentacionSubmodule from './submodules/BiDocumentacionSubmodule';
import BiObsidianSubmodule from './submodules/BiObsidianSubmodule';
import AdmGastosProveedoresSubmodule from './submodules/AdmGastosProveedoresSubmodule';
import MktComunicacionesSubmodule from './submodules/MktComunicacionesSubmodule';
import OperadoresVentasSubmodule from './submodules/OperadoresVentasSubmodule';
import MarketingFunnelCharts from './MarketingFunnelCharts';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
};

const parseNumericValue = (val: any): number => {
  if (val === null || val === undefined || val === '') return NaN;
  if (typeof val === 'number') return val;
  if (typeof val !== 'string') return NaN;
  
  // Clean string: remove currency symbols and spaces
  let clean = val.replace(/[$\s]/g, '');
  
  // Handle European/Latin American format (1.234,56) vs US format (1,234.56)
  const lastComma = clean.lastIndexOf(',');
  const lastDot = clean.lastIndexOf('.');
  
  if (lastComma > lastDot) {
    // Comma is likely the decimal separator
    clean = clean.replace(/\./g, '').replace(',', '.');
  } else if (lastDot > lastComma) {
    // Dot is likely the decimal separator
    clean = clean.replace(/,/g, '');
  } else if (lastComma !== -1) {
    // Only comma present
    clean = clean.replace(',', '.');
  }
  
  return parseFloat(clean);
};

// --- Sub-components (Restored from previous version) ---

const StatCard = React.memo(({ title, value, icon: Icon, trend, color, onConfigChange, availableFields, currentField, currentType, countryBreakdown }: any) => {
  const [isEditing, setIsEditing] = useState(false);

  const dynamicTitle = useMemo(() => {
    const fieldName = currentField ? currentField.replace(/_/g, ' ') : '...';
    switch (currentType) {
      case 'SUM': return `Total de ${fieldName}`;
      case 'AVG': return `Promedio de ${fieldName}`;
      case 'COUNT': return `Registros Totales`;
      case 'TOP': return `${fieldName} más frecuente`;
      case 'UNIQUE_COUNT': return `${fieldName} Únicos`;
      default: return 'Métrica';
    }
  }, [currentType, currentField]);

  const displayTitle = title || dynamicTitle;

  return (
    <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 shadow-sm hover:shadow-md transition-all group relative overflow-hidden">
      <div className="flex items-center justify-between mb-4">
        <div className={cn("p-2 rounded-lg shadow-lg shadow-blue-900/20", color)}>
          <Icon className="w-5 h-5 text-white" />
        </div>
        <div className="flex items-center gap-2">
          {trend && (
            <span className={cn("text-xs font-medium px-2 py-1 rounded-full", trend > 0 ? "bg-blue-900/30 text-blue-400" : "bg-rose-900/30 text-rose-400")}>
              {trend > 0 ? '+' : ''}{trend}%
            </span>
          )}
          <button 
            onClick={() => setIsEditing(!isEditing)}
            className="p-1 hover:bg-slate-800 rounded-md text-zinc-500 opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <Filter className="w-3 h-3" />
          </button>
        </div>
      </div>
      
      {isEditing ? (
        <div className="space-y-2 animate-in fade-in slide-in-from-top-1 duration-200">
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold text-zinc-400 uppercase">Título (Opcional)</label>
            <input 
              type="text"
              value={title}
              onChange={(e) => onConfigChange({ title: e.target.value })}
              placeholder={dynamicTitle}
              className="text-xs bg-slate-950 border border-slate-700 rounded px-2 py-1 focus:outline-none text-white placeholder:text-zinc-600"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold text-zinc-400 uppercase">Métrica</label>
            <select 
              value={currentType}
              onChange={(e) => onConfigChange({ type: e.target.value })}
              className="text-xs bg-slate-950 border border-slate-700 rounded px-2 py-1 focus:outline-none text-white"
            >
              <option value="SUM" className="bg-slate-900">Suma Total</option>
              <option value="AVG" className="bg-slate-900">Promedio</option>
              <option value="COUNT" className="bg-slate-900">Conteo Total</option>
              <option value="TOP" className="bg-slate-900">Valor más frecuente (Top)</option>
              <option value="UNIQUE_COUNT" className="bg-slate-900">Conteo Únicos</option>
            </select>
          </div>
          {currentType !== 'COUNT' && (
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold text-zinc-400 uppercase">Variable</label>
              <select 
                value={currentField}
                onChange={(e) => onConfigChange({ field: e.target.value })}
                className="text-xs bg-slate-950 border border-slate-700 rounded px-2 py-1 focus:outline-none text-white"
              >
                {availableFields.map((f: string) => (
                  <option key={f} value={f} className="bg-slate-900">{f.replace(/_/g, ' ')}</option>
                ))}
              </select>
            </div>
          )}
          <button 
            onClick={() => setIsEditing(false)}
            className="w-full py-1 bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-bold rounded uppercase mt-2 transition-colors"
          >
            Listo
          </button>
        </div>
      ) : (
        <>
          <p className="text-zinc-400 text-sm font-medium">{displayTitle}</p>
          {countryBreakdown && Object.keys(countryBreakdown).length > 1 ? (
            <div className="mt-2 space-y-1.5">
              {Object.entries(countryBreakdown).map(([country, amount]: [string, any]) => (
                <div key={country} className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">{country}</span>
                  <span className="text-base font-bold text-white">{amount}</span>
                </div>
              ))}
            </div>
          ) : (
            <h3 className="text-2xl font-bold text-white mt-1 truncate" title={String(value)}>{value}</h3>
          )}
          {!(countryBreakdown && Object.keys(countryBreakdown).length > 1) && (
            <p className="text-[10px] text-zinc-400 mt-1 uppercase font-bold tracking-wider">
              {currentType === 'COUNT' ? 'Registros Totales' : `${currentType} de ${currentField.replace(/_/g, ' ')}`}
            </p>
          )}
        </>
      )}
    </div>
  );
});

const ChartContainer = React.memo(({ title, children, icon: Icon, onConfigChange, availableFields, currentDimension, currentMetric, currentType }: any) => {
  const [isEditing, setIsEditing] = useState(false);

  return (
    <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 shadow-sm group relative overflow-hidden">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          {Icon && <Icon className="w-5 h-5 text-zinc-400" />}
          <h3 className="font-semibold text-zinc-100">{title}</h3>
        </div>
        <button 
          onClick={() => setIsEditing(!isEditing)}
          className="p-1.5 hover:bg-slate-800 rounded-lg text-zinc-500 opacity-0 group-hover:opacity-100 transition-all"
        >
          <Filter className="w-4 h-4" />
        </button>
      </div>

      {isEditing ? (
        <div className="h-[300px] flex flex-col justify-center space-y-4 p-4 bg-slate-800 rounded-xl border border-slate-700 animate-in fade-in zoom-in-95 duration-200">
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Dimensión (Eje X / Segmentos)</label>
            <select 
              value={currentDimension}
              onChange={(e) => onConfigChange({ dimension: e.target.value })}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs font-bold text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            >
              {availableFields.map((f: string) => (
                <option key={f} value={f} className="bg-slate-900">{f.replace(/_/g, ' ').toUpperCase()}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Métrica (Valores)</label>
            <select 
              value={currentMetric}
              onChange={(e) => onConfigChange({ metric: e.target.value })}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs font-bold text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            >
              {availableFields.map((f: string) => (
                <option key={f} value={f} className="bg-slate-900">{f.replace(/_/g, ' ').toUpperCase()}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Tipo de Gráfico</label>
            <div className="grid grid-cols-4 gap-2">
              {[
                { id: 'AREA', label: 'Líneas', icon: TrendingUp },
                { id: 'BAR', label: 'Barras', icon: ShoppingBag },
                { id: 'PIE', label: 'Torta', icon: Filter },
                { id: 'SCATTER', label: 'Dispersión', icon: Activity }
              ].map(t => (
                <button
                  key={t.id}
                  onClick={() => onConfigChange({ type: t.id })}
                  className={cn(
                    "flex flex-col items-center gap-1 p-2 rounded-lg border transition-all",
                    currentType === t.id 
                      ? "bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-900/20" 
                      : "bg-slate-900 border-slate-700 text-zinc-400 hover:border-slate-600"
                  )}
                >
                  <t.icon className="w-4 h-4" />
                  <span className="text-[9px] font-bold uppercase">{t.label}</span>
                </button>
              ))}
            </div>
          </div>

          <button 
            onClick={() => setIsEditing(false)}
            className="w-full py-2.5 bg-blue-600 text-white text-xs font-bold rounded-lg uppercase mt-2 hover:bg-blue-500 transition-colors shadow-lg shadow-blue-900/20"
          >
            Aplicar Cambios
          </button>
        </div>
      ) : (
        <div className="h-[300px] w-full">
          {children}
        </div>
      )}
    </div>
  );
});

const PAGE_SIZE = 100;

function DualScrollTable({ children, minWidth = '2000px', maxHeight = '600px' }: { children: React.ReactNode; minWidth?: string; maxHeight?: string }) {
  const topRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const syncing = useRef(false);

  useEffect(() => {
    if (!bodyRef.current || !topRef.current) return;
    requestAnimationFrame(() => {
      if (!bodyRef.current || !topRef.current) return;
      const innerDiv = topRef.current.querySelector('div');
      if (innerDiv) innerDiv.style.minWidth = `${bodyRef.current.scrollWidth}px`;
      const vScrollbarWidth = bodyRef.current.offsetWidth - bodyRef.current.clientWidth;
      topRef.current.style.marginRight = `${vScrollbarWidth}px`;
    });
  }, [children]);

  const onTopScroll = () => {
    if (syncing.current || !bodyRef.current || !topRef.current) return;
    syncing.current = true;
    bodyRef.current.scrollLeft = topRef.current.scrollLeft;
    syncing.current = false;
  };

  const onBodyScroll = () => {
    if (syncing.current || !topRef.current || !bodyRef.current) return;
    syncing.current = true;
    topRef.current.scrollLeft = bodyRef.current.scrollLeft;
    syncing.current = false;
  };

  return (
    <div>
      <div
        ref={topRef}
        onScroll={onTopScroll}
        className="overflow-x-auto overflow-y-hidden [&::-webkit-scrollbar]:h-3 [&::-webkit-scrollbar-thumb]:rounded [&::-webkit-scrollbar-thumb]:bg-blue-500 [&::-webkit-scrollbar-track]:bg-slate-800"
      >
        <div style={{ minWidth, height: '1px' }} />
      </div>
      <div
        ref={bodyRef}
        onScroll={onBodyScroll}
        style={{ maxHeight }}
        className="overflow-x-auto overflow-y-scroll [&::-webkit-scrollbar]:h-3 [&::-webkit-scrollbar-thumb]:rounded [&::-webkit-scrollbar-thumb]:bg-blue-500 [&::-webkit-scrollbar-track]:bg-slate-800"
      >
        {children}
      </div>
    </div>
  );
}

const SalesTable = React.memo(({ sales }: { sales: any[] }) => {
  const [page, setPage] = useState(0);

  useEffect(() => { setPage(0); }, [sales]);

  const headers = useMemo(() => {
    if (sales.length === 0) return [];
    return Object.keys(sales[0]);
  }, [sales]);

  const totalPages = Math.ceil(sales.length / PAGE_SIZE);
  const pageRows = sales.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const from = page * PAGE_SIZE + 1;
  const to = Math.min((page + 1) * PAGE_SIZE, sales.length);

  return (
    <div className="flex flex-col">
      <DualScrollTable minWidth="2000px" maxHeight="600px">
        <table className="w-full text-left border-collapse min-w-[2000px]">
          <thead className="sticky top-0 z-10 bg-slate-800">
            <tr>
              {headers.map((key) => (
                <th key={key} className="px-4 py-3 text-[10px] font-bold text-zinc-400 uppercase tracking-wider border-b border-slate-700 whitespace-nowrap">
                  {key.replace(/_/g, ' ')}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {pageRows.length > 0 ? (
              pageRows.map((sale: any, idx) => (
                <tr key={sale.id || idx} className="hover:bg-slate-800/50 transition-colors">
                  {headers.map((key) => {
                    const value = sale[key];
                    const numericValue = parseNumericValue(value);
                    const isNumeric = !isNaN(numericValue);
                    const isCurrency = isNumeric && (
                      key.toLowerCase().includes('monto') ||
                      key.toLowerCase().includes('capital') ||
                      key.toLowerCase().includes('total') ||
                      key.toLowerCase().includes('precio') ||
                      key.toLowerCase().includes('importe') ||
                      key.toLowerCase().includes('k_mas_i') ||
                      key.toLowerCase().includes('interest')
                    );
                    return (
                      <td key={key} className={cn("px-4 py-3 text-xs", isCurrency ? "font-bold text-blue-400" : "text-zinc-400")}>
                        {isCurrency ? formatCurrency(numericValue) : String(value ?? '-')}
                      </td>
                    );
                  })}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={headers.length || 1} className="px-6 py-12 text-center text-zinc-500 text-sm">
                  No hay datos disponibles para mostrar.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </DualScrollTable>
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-6 py-3 border-t border-slate-800 bg-slate-900">
          <span className="text-xs text-zinc-500">
            Mostrando {from.toLocaleString()}–{to.toLocaleString()} de {sales.length.toLocaleString()} registros
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(p => p - 1)}
              disabled={page === 0}
              className="px-3 py-1.5 text-xs font-bold rounded-lg bg-slate-800 text-zinc-300 hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              ← Anterior
            </button>
            <span className="text-xs text-zinc-400 font-bold">
              {page + 1} / {totalPages}
            </span>
            <button
              onClick={() => setPage(p => p + 1)}
              disabled={page === totalPages - 1}
              className="px-3 py-1.5 text-xs font-bold rounded-lg bg-slate-800 text-zinc-300 hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              Siguiente →
            </button>
          </div>
        </div>
      )}
    </div>
  );
});

const MultiSelect = ({ options, selected, onChange, placeholder }: any) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleOption = (option: string) => {
    const newSelected = selected.includes(option)
      ? selected.filter((o: string) => o !== option)
      : [...selected, option];
    onChange(newSelected);
  };

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs font-bold text-white flex items-center justify-between hover:border-slate-600 transition-all"
      >
        <span className="truncate">
          {selected.length === 0 
            ? placeholder 
            : `${selected.length} seleccionado${selected.length > 1 ? 's' : ''}`}
        </span>
        <ChevronDown className={cn("w-3 h-3 text-zinc-500 transition-transform", isOpen && "rotate-180")} />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="absolute z-50 w-full mt-2 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl max-h-60 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-800"
          >
            <div className="p-2 space-y-1">
              <button
                onClick={() => onChange([])}
                className="w-full text-left px-3 py-2 text-[10px] font-bold text-zinc-500 hover:text-zinc-300 transition-colors uppercase"
              >
                Limpiar Selección
              </button>
              {options.map((option: string) => (
                <button
                  key={option}
                  onClick={() => toggleOption(option)}
                  className="w-full flex items-center justify-between px-3 py-2 text-xs text-zinc-300 hover:bg-slate-800 rounded-lg transition-colors group"
                >
                  <span className="truncate">{option}</span>
                  {selected.includes(option) && (
                    <Check className="w-3 h-3 text-blue-500" />
                  )}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const InsightsPanel = ({ insights }: { insights: any }) => {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const fullText = [
    `Resumen Ejecutivo:\n${insights.summary}`,
    `\nHallazgos Clave:\n${(insights.insights || []).map((i: string, n: number) => `${n + 1}. ${i}`).join('\n')}`,
    `\nRecomendación:\n${insights.recommendation}`
  ].join('');

  return (
    <div className="space-y-8">
      <div className="relative group space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-blue-400 text-xs font-bold uppercase tracking-widest">Resumen Ejecutivo</p>
          <button onClick={() => handleCopy(insights.summary, 'summary')} className="opacity-0 group-hover:opacity-100 transition-opacity p-1 bg-slate-800 hover:bg-slate-700 rounded-md" title="Copiar">
            {copiedId === 'summary' ? <CheckCheck className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3 text-zinc-500" />}
          </button>
        </div>
        <p className="text-zinc-300 text-sm leading-relaxed">{insights.summary}</p>
      </div>
      <div className="space-y-3">
        <p className="text-blue-400 text-xs font-bold uppercase tracking-widest">Hallazgos Clave</p>
        <div className="space-y-2">
          {Array.isArray(insights.insights) && insights.insights.map((insight: string, idx: number) => (
            <div key={idx} className="relative group flex gap-2 items-start">
              <ChevronRight className="w-3 h-3 text-blue-500 mt-1 flex-shrink-0" />
              <p className="text-zinc-400 text-xs leading-tight flex-1">{insight}</p>
              <button onClick={() => handleCopy(insight, `insight-${idx}`)} className="opacity-0 group-hover:opacity-100 transition-opacity p-1 bg-slate-800 hover:bg-slate-700 rounded-md flex-shrink-0" title="Copiar">
                {copiedId === `insight-${idx}` ? <CheckCheck className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3 text-zinc-500" />}
              </button>
            </div>
          ))}
        </div>
      </div>
      <div className="relative group bg-blue-900/20 p-4 rounded-xl border border-blue-800/30">
        <div className="flex items-center justify-between mb-2">
          <p className="text-blue-400 text-xs font-bold uppercase tracking-widest">Recomendación Estratégica</p>
          <button onClick={() => handleCopy(insights.recommendation, 'rec')} className="opacity-0 group-hover:opacity-100 transition-opacity p-1 bg-blue-900/40 hover:bg-blue-900/60 rounded-md" title="Copiar">
            {copiedId === 'rec' ? <CheckCheck className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3 text-blue-400" />}
          </button>
        </div>
        <p className="text-zinc-300 text-sm italic">"{insights.recommendation}"</p>
      </div>
      <button onClick={() => handleCopy(fullText, 'all')} className="w-full flex items-center justify-center gap-2 py-2 bg-slate-800 hover:bg-slate-700 rounded-xl border border-slate-700 text-zinc-500 hover:text-zinc-300 text-xs transition-colors">
        {copiedId === 'all' ? <><CheckCheck className="w-3 h-3 text-emerald-400" /><span className="text-emerald-400">Copiado</span></> : <><Copy className="w-3 h-3" />Copiar todo</>}
      </button>
    </div>
  );
};

const InsightsBlock = ({ insights }: { insights: any }) => {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      <div className="md:col-span-3">
        <div className="relative group bg-blue-600 p-6 rounded-2xl shadow-lg shadow-blue-900/20">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="w-5 h-5 text-white" />
            <h3 className="font-bold text-white uppercase tracking-wider text-xs">Resumen Ejecutivo</h3>
          </div>
          <p className="text-blue-50 text-sm leading-relaxed">{insights.summary}</p>
          <button
            onClick={() => handleCopy(insights.summary, 'summary')}
            className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity p-1.5 bg-blue-500/50 hover:bg-blue-500 rounded-lg"
            title="Copiar resumen"
          >
            {copiedId === 'summary' ? <CheckCheck className="w-3.5 h-3.5 text-white" /> : <Copy className="w-3.5 h-3.5 text-white" />}
          </button>
        </div>
      </div>
      {insights.insights.map((insight: string, idx: number) => (
        <div key={idx} className="relative group bg-slate-900 p-6 rounded-2xl border border-slate-800">
          <div className="w-8 h-8 bg-slate-800 rounded-lg flex items-center justify-center mb-4 text-blue-500 font-bold">
            {idx + 1}
          </div>
          <p className="text-zinc-300 text-sm leading-relaxed">{insight}</p>
          <button
            onClick={() => handleCopy(insight, `insight-${idx}`)}
            className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity p-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg border border-slate-700"
            title="Copiar insight"
          >
            {copiedId === `insight-${idx}` ? <CheckCheck className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-zinc-400" />}
          </button>
        </div>
      ))}
    </div>
  );
};

const ChatPanel = React.memo(({ chatMessages, chatLoading, onSendMessage, height = "500px" }: any) => {
  const [inputMessage, setInputMessage] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);

  const handleCopy = (text: string, idx: number) => {
    navigator.clipboard.writeText(text);
    setCopiedId(idx);
    setTimeout(() => setCopiedId(null), 2000);
  };

  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({
        top: scrollContainerRef.current.scrollHeight,
        behavior: 'smooth'
      });
    }
  }, [chatMessages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputMessage.trim() || chatLoading) return;
    onSendMessage(inputMessage);
    setInputMessage('');
  };

  const toggleMic = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    if (isListening) {
      recognitionRef.current?.stop();
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'es-AR';
    recognition.interimResults = false;
    recognition.continuous = false;
    recognitionRef.current = recognition;

    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);
    recognition.onerror = () => setIsListening(false);
    recognition.onresult = (event: any) => {
      setInputMessage(event.results[0][0].transcript);
    };

    recognition.start();
  };

  return (
    <div className={cn("bg-slate-900 rounded-2xl border border-slate-800 shadow-sm flex flex-col", height === "500px" ? "h-[500px]" : "h-[800px]")}>
      <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/50 rounded-t-2xl">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-blue-500" />
          <h3 className="font-semibold text-zinc-100">Asistente de Análisis</h3>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
          <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">AI Expert</span>
        </div>
      </div>

      <div 
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin scrollbar-thumb-slate-800"
      >
        {chatMessages.length === 0 && (
          <div className="text-center py-8 px-4">
            <div className="w-12 h-12 bg-blue-900/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <Bot className="w-6 h-6 text-blue-500" />
            </div>
            <p className="text-zinc-100 font-bold text-sm mb-1">¡Hola! Soy tu experto en datos.</p>
            <p className="text-zinc-500 text-xs">Pídeme analizar tendencias, comparar periodos o identificar hallazgos clave en tus datos.</p>
          </div>
        )}
        
        <AnimatePresence initial={false}>
          {chatMessages.map((msg: any, idx: number) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={cn(
                "flex gap-3 max-w-[85%]",
                msg.role === 'user' ? "ml-auto flex-row-reverse" : "mr-auto"
              )}
            >
              <div className={cn(
                "w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0",
                msg.role === 'user' ? "bg-slate-800" : "bg-blue-900/30"
              )}>
                {msg.role === 'user' ? <User className="w-4 h-4 text-zinc-400" /> : <Bot className="w-4 h-4 text-blue-400" />}
              </div>
              <div className="relative group">
                <div className={cn(
                  "p-3 rounded-2xl text-sm leading-relaxed",
                  msg.role === 'user'
                    ? "bg-blue-600 text-white rounded-tr-none shadow-lg shadow-blue-900/20"
                    : "bg-slate-800 text-zinc-300 rounded-tl-none border border-slate-700"
                )}>
                  <ReactMarkdown>{msg.content}</ReactMarkdown>
                </div>
                {msg.role === 'model' && (
                  <button
                    onClick={() => handleCopy(msg.content, idx)}
                    className="absolute -bottom-2 right-1 opacity-0 group-hover:opacity-100 transition-opacity p-1 bg-slate-700 hover:bg-slate-600 rounded-md"
                    title="Copiar respuesta"
                  >
                    {copiedId === idx ? <CheckCheck className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3 text-zinc-400" />}
                  </button>
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
        
        {chatLoading && (
          <div className="flex gap-3 mr-auto max-w-[85%]">
            <div className="w-8 h-8 rounded-lg bg-blue-900/30 flex items-center justify-center flex-shrink-0">
              <Bot className="w-4 h-4 text-blue-400" />
            </div>
            <div className="p-3 rounded-2xl bg-slate-800 text-zinc-300 rounded-tl-none flex items-center gap-2 border border-slate-700">
              <div className="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-bounce" />
              <div className="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-bounce [animation-delay:0.2s]" />
              <div className="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-bounce [animation-delay:0.4s]" />
            </div>
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="p-4 border-t border-slate-800 bg-slate-900/50 rounded-b-2xl relative z-30">
        <div className="relative">
          <input
            type="text"
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            placeholder={isListening ? 'Escuchando...' : 'Haz una pregunta sobre los datos...'}
            className={cn(
              "w-full bg-slate-800 border border-slate-700 rounded-xl pl-4 pr-20 py-2.5 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:border-blue-500 transition-all",
              isListening ? "ring-2 ring-emerald-500/30 border-emerald-500/50" : "focus:ring-blue-500/20"
            )}
          />
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
            <button
              type="button"
              onClick={toggleMic}
              className={cn(
                "p-1.5 rounded-lg transition-colors",
                isListening ? "bg-emerald-500 text-white animate-pulse" : "bg-slate-700 text-zinc-400 hover:bg-slate-600 hover:text-zinc-200"
              )}
              title={isListening ? 'Detener' : 'Hablar'}
            >
              {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </button>
            <button
              type="submit"
              disabled={!inputMessage.trim() || chatLoading}
              className="p-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-500 disabled:opacity-50 transition-colors shadow-lg shadow-blue-900/20"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      </form>
    </div>
  );
});

// --- Main DashboardView ---

export default function DashboardView({
  title,
  moduleId,
  moduleType,
  moduleSheetUrl,
  sheetsList,
  onSwitchSheet,
  data,
  onBack,
  loading: initialLoading,
  onFetchData,
  onOpenTerms,
  onOpenFeatureRequest,
  exchangeRates,
  savedReports = [],
  onSaveReport,
  userEmail,
  initialReport,
  submodules = []
}: any) {
  const [activeTab, setActiveTab] = useState<'overview' | 'data'>('overview');
  const [activeSubmodule, setActiveSubmodule] = useState<any>(null);
  const [sales, setSales] = useState<any[]>(data || []);
  const [loading, setLoading] = useState(initialLoading);
  const [insights, setInsights] = useState<any>(null);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [saveReportName, setSaveReportName] = useState('');
  const [savingReport, setSavingReport] = useState(false);
  const [loadBannerOpen, setLoadBannerOpen] = useState(true);
  const [loadMenuOpen, setLoadMenuOpen] = useState(false);
  const [activeReportName, setActiveReportName] = useState<string | null>(null);
  const restoredFromReport = useRef(false);

  const isRawText = useMemo(() => {
    return data && data.length === 1 && data[0].rawText;
  }, [data]);

  // Date range state — initialize from report if provided
  const [startDate, setStartDate] = useState(initialReport?.filtros?.startDate || format(subDays(new Date(), 10), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(initialReport?.filtros?.endDate || format(subDays(new Date(), 1), 'yyyy-MM-dd'));

  const setDateRange = (type: 'current_month' | 'last_month' | 'last_quarter') => {
    const now = new Date();
    let start, end;
    
    switch (type) {
      case 'current_month':
        start = startOfMonth(now);
        end = now;
        break;
      case 'last_month':
        start = startOfMonth(subMonths(now, 1));
        end = endOfMonth(subMonths(now, 1));
        break;
      case 'last_quarter':
        start = startOfQuarter(subMonths(now, 2));
        end = now;
        break;
      default:
        return;
    }
    
    setStartDate(format(start, 'yyyy-MM-dd'));
    setEndDate(format(end, 'yyyy-MM-dd'));
  };

  const LOADING_MESSAGES = [
    'Cargando datos...',
    'Conectando con la fuente...',
    'Procesando registros...',
    'Ya falta poco...',
    'Organizando la información...',
    'Casi lo tenemos...',
    'Un momento más...',
  ];
  const [loadingMsgIdx, setLoadingMsgIdx] = useState(0);
  const [showSpinner, setShowSpinner] = useState(loading);
  const hadLoadingRef = useRef(false);

  useEffect(() => {
    if (loading) { hadLoadingRef.current = true; setShowSpinner(true); }
    else if (sales.length > 0 || !hadLoadingRef.current) { setShowSpinner(false); }
  }, [loading, sales.length]);

  useEffect(() => {
    if (!showSpinner) return;
    const t = setInterval(() => setLoadingMsgIdx(i => (i + 1) % LOADING_MESSAGES.length), 1800);
    return () => clearInterval(t);
  }, [showSpinner]);

  // Auto-fetch when opening from a saved report — only for API modules
  const didAutoFetch = useRef(false);
  useEffect(() => {
    if (initialReport && moduleType === 'api' && onFetchData && moduleId && !didAutoFetch.current) {
      didAutoFetch.current = true;
      const from = initialReport.filtros?.startDate || startDate;
      const to = initialReport.filtros?.endDate || endDate;
      setLoading(true);
      onFetchData(moduleId, from, to).catch(() => {}).finally(() => setLoading(false));
    }
  }, []);

  const handleFetch = async () => {
    if (!onFetchData || !moduleId) return;
    setLoading(true);
    try {
      await onFetchData(moduleId, startDate, endDate);
    } catch (err) {
      console.error('Fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  const availableFields = useMemo(() => {
    if (sales.length === 0) return [];
    const exclude = ['id'];
    return Object.keys(sales[0]).filter(key => !exclude.includes(key)).sort();
  }, [sales]);

  const [cardConfigs, setCardConfigs] = useState([
    { id: 0, title: '', type: 'SUM', field: '', icon: DollarSign, color: 'bg-blue-600' },
    { id: 1, title: '', type: 'COUNT', field: '', icon: ShoppingBag, color: 'bg-indigo-600' },
    { id: 2, title: '', type: 'AVG', field: '', icon: TrendingUp, color: 'bg-violet-600' },
    { id: 3, title: '', type: 'TOP', field: '', icon: Sparkles, color: 'bg-cyan-600' }
  ]);

  const [chartConfigs, setChartConfigs] = useState([
    { id: 'evolution', title: 'Evolución Temporal', type: 'AREA', dimension: '', metric: '', icon: TrendingUp },
    { id: 'distribution', title: 'Distribución de Datos', type: 'PIE', dimension: '', metric: '', icon: Filter },
    { id: 'ranking', title: 'Ranking Comparativo', type: 'BAR', dimension: '', metric: '', icon: ShoppingBag },
    { id: 'scatter', title: 'Dispersión', type: 'SCATTER', dimension: '', metric: '', icon: Activity }
  ]);

  const [filterSlots, setFilterSlots] = useState<{ field: string; values: string[] }[]>([]);
  const deferredFilterSlots = useDeferredValue(filterSlots);
  const isFiltering = filterSlots !== deferredFilterSlots;

  useEffect(() => {
    if (availableFields.length === 0) return;

    // Cards & charts auto-assign (skip if restored from report)
    if (!restoredFromReport.current) {
      const numericField = availableFields.find(f =>
        f.toLowerCase().includes('monto') ||
        f.toLowerCase().includes('capital') ||
        f.toLowerCase().includes('total') ||
        f.toLowerCase().includes('k_mas_i') ||
        f.toLowerCase().includes('importe') ||
        f.toLowerCase().includes('valor')
      ) || availableFields[0];

      const categoryField = availableFields.find(f =>
        f.toLowerCase().includes('categoria') ||
        f.toLowerCase().includes('producto') ||
        f.toLowerCase().includes('tipo') ||
        f.toLowerCase().includes('cliente') ||
        f.toLowerCase().includes('nombre') ||
        f.toLowerCase().includes('estado')
      ) || availableFields[0];

      const dateField = availableFields.find(f =>
        f.toLowerCase().includes('fecha') ||
        f.toLowerCase().includes('date') ||
        f.toLowerCase().includes('periodo')
      ) || availableFields[0];

      setCardConfigs(prev => prev.map((c, i) => {
        if (i === 0) return { ...c, field: numericField };
        if (i === 2) return { ...c, field: numericField };
        if (i === 3) return { ...c, field: categoryField };
        return c;
      }));

      setChartConfigs(prev => prev.map((c, i) => {
        if (i === 0) return { ...c, dimension: dateField, metric: numericField };
        if (i === 1) return { ...c, dimension: categoryField, metric: numericField };
        if (i === 2) return { ...c, dimension: categoryField, metric: numericField };
        if (i === 3) return { ...c, dimension: categoryField, metric: numericField };
        return c;
      }));

      // Filter slots: 4 slots, module-specific defaults
      if (filterSlots.length === 0) {
        const defaultSlots = moduleId === 'marketing'
          ? [
              { field: 'pais', values: [] },
              { field: 'tipo_cliente', values: [] },
              { field: 'vendedor', values: [] },
              { field: 'agrupacion_source_ultimo', values: [] },
            ]
          : [
              { field: 'pais', values: [] },
              { field: '', values: [] },
              { field: '', values: [] },
              { field: '', values: [] },
            ];
        setFilterSlots(defaultSlots);
      }
    } else {
      restoredFromReport.current = false;
      // Filter slots: 4 slots, module-specific defaults
      if (filterSlots.length === 0) {
        const defaultSlots = moduleId === 'marketing'
          ? [
              { field: 'pais', values: [] },
              { field: 'tipo_cliente', values: [] },
              { field: 'vendedor', values: [] },
              { field: 'agrupacion_source_ultimo', values: [] },
            ]
          : [
              { field: 'pais', values: [] },
              { field: '', values: [] },
              { field: '', values: [] },
              { field: '', values: [] },
            ];
        setFilterSlots(defaultSlots);
      }
    }
  }, [availableFields]);

  useEffect(() => {
    if (data && data.length > 0) {
      setSales(data);
      // Auto-apply report config when opening from saved reports
      if (initialReport) {
        // Only block auto-assignment if there are actually saved configs to restore
        const hasCardConfigs = initialReport.filtros?.cardConfigs?.length > 0;
        const hasChartConfigs = initialReport.filtros?.chartConfigs?.length > 0;
        if (hasCardConfigs || hasChartConfigs) restoredFromReport.current = true;
        // Only restore filterSlots if they were actually saved (non-empty)
        if (initialReport.filtros?.filterSlots?.length > 0) setFilterSlots(initialReport.filtros.filterSlots);
        if (initialReport.filtros?.cardConfigs) {
          setCardConfigs(prev => prev.map((c, i) => {
            const saved = initialReport.filtros.cardConfigs[i];
            return saved ? { ...c, ...saved, icon: c.icon } : c;
          }));
        }
        if (initialReport.filtros?.chartConfigs) {
          setChartConfigs(prev => prev.map(c => {
            const saved = initialReport.filtros.chartConfigs.find((s: any) => s.id === c.id);
            return saved ? { ...c, ...saved, icon: c.icon } : c;
          }));
        }
        setActiveReportName(initialReport.nombre);
      }
      const fetchInsights = async () => {
        setInsightsLoading(true);
        try {
          const aiInsights = await generateInsights(data, { from: startDate, to: endDate }, [], userEmail, moduleId);
          setInsights(aiInsights);
        } catch (e) {} finally { setInsightsLoading(false); }
      };
      fetchInsights();
    } else {
      setSales([]);
      setInsights(null);
    }
  }, [data]);

  const filteredSales = useMemo(() => {
    return sales.filter(s => {
      return deferredFilterSlots.every(slot => {
        if (slot.values.length === 0) return true;
        return slot.values.includes(String(s[slot.field]));
      });
    });
  }, [sales, deferredFilterSlots]);

  // Only recompute options when the selected FIELDS change, not when values change
  const filterFieldKey = filterSlots.map(s => s.field).join('|');
  const filterOptions = useMemo(() => {
    const options: Record<string, string[]> = {};
    filterSlots.forEach(slot => {
      if (!slot.field) return;
      const values = new Set<string>();
      sales.forEach(s => {
        if (s[slot.field] !== undefined && s[slot.field] !== null && s[slot.field] !== '') {
          values.add(String(s[slot.field]));
        }
      });
      options[slot.field] = Array.from(values).sort();
    });
    return options;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sales, filterFieldKey]);

  const stats = useMemo(() => {
    if (!filteredSales.length) return cardConfigs.map(() => 'N/A');
    return cardConfigs.map(config => {
      const { type, field } = config;
      if (type === 'COUNT') return filteredSales.length.toLocaleString();
      if (!field) return 'N/A';
      if (type === 'UNIQUE_COUNT') {
        const uniqueValues = new Set(filteredSales.map(s => s[field]).filter(v => v !== undefined && v !== null && v !== ''));
        return uniqueValues.size.toLocaleString();
      }

      const values = filteredSales.map(s => parseNumericValue(s[field])).filter(v => !isNaN(v));
      if (type === 'SUM' || type === 'AVG') {
        if (values.length === 0) return '0';
        const sum = values.reduce((acc, v) => acc + v, 0);
        const result = type === 'SUM' ? sum : sum / values.length;
        if (field.toLowerCase().includes('monto') || field.toLowerCase().includes('capital') || field.toLowerCase().includes('total') || field.toLowerCase().includes('k_mas_i')) return formatCurrency(result);
        return result.toLocaleString(undefined, { maximumFractionDigits: 2 });
      }
      if (type === 'TOP') {
        const counts: any = {};
        filteredSales.forEach(s => {
          const val = s[field];
          if (val) counts[val] = (counts[val] || 0) + 1;
        });
        const sorted = Object.entries(counts).sort((a: any, b: any) => b[1] - a[1]);
        return sorted[0]?.[0] || 'N/A';
      }
      return 'N/A';
    });
  }, [filteredSales, cardConfigs]);

  const countryBreakdowns = useMemo(() => {
    return cardConfigs.map(config => {
      const { type, field } = config;
      if (type !== 'SUM' || !field) return null;
      const countries = [...new Set(filteredSales.map((s: any) => s['pais']).filter(Boolean))] as string[];
      if (countries.length <= 1) return null;
      const isCurrencyField = field.toLowerCase().includes('monto') ||
        field.toLowerCase().includes('capital') ||
        field.toLowerCase().includes('total') ||
        field.toLowerCase().includes('k_mas_i');
      const breakdown: Record<string, string> = {};
      countries.forEach(country => {
        const rows = filteredSales.filter((s: any) => s['pais'] === country);
        const sum = rows.reduce((acc: number, s: any) => {
          const v = parseNumericValue(s[field]);
          return acc + (isNaN(v) ? 0 : v);
        }, 0);
        breakdown[country] = isCurrencyField
          ? formatCurrency(sum)
          : sum.toLocaleString(undefined, { maximumFractionDigits: 2 });
      });
      return breakdown;
    });
  }, [filteredSales, cardConfigs]);

  const processedChartData = useMemo(() => {
    return chartConfigs.map(config => {
      const { dimension, metric, type } = config;
      if (!dimension || !metric) return [];

      // Scatter: one point per row with x=index, y=metric, name=dimension value
      if (type === 'SCATTER') {
        const MAX_SCATTER = 2000;
        const step = filteredSales.length > MAX_SCATTER ? Math.ceil(filteredSales.length / MAX_SCATTER) : 1;
        return filteredSales
          .filter((_, i) => i % step === 0)
          .map((s, i) => ({
            x: i + 1,
            y: parseNumericValue(s[metric]) || 0,
            name: String(s[dimension] || 'N/A'),
          }));
      }

      const dataMap: any = {};
      filteredSales.forEach(s => {
        let dimVal = String(s[dimension] || 'N/A');
        const metVal = parseNumericValue(s[metric]) || 0;
        if (type === 'AREA' && (dimension.toLowerCase().includes('fecha') || dimension.toLowerCase().includes('date'))) {
          try { dimVal = format(parseISO(dimVal), 'yyyy-MM-dd'); } catch (e) {}
        }
        dataMap[dimVal] = (dataMap[dimVal] || 0) + metVal;
      });
      let result = Object.entries(dataMap).map(([name, value]) => ({ name, value }));
      if (type === 'AREA' && (dimension.toLowerCase().includes('fecha') || dimension.toLowerCase().includes('date'))) {
        result.sort((a: any, b: any) => a.name.localeCompare(b.name));
        result = result.map(d => ({
          ...d,
          name: (() => {
            try { return format(parseISO(d.name), 'dd MMM', { locale: es }); }
            catch(e) { return d.name; }
          })()
        }));
      } else {
        result.sort((a: any, b: any) => b.value - a.value);
        result = result.slice(0, 15);
      }
      return result;
    });
  }, [filteredSales, chartConfigs]);

  const handleUpdateInsights = async () => {
    if (filteredSales.length === 0) return;
    setInsightsLoading(true);
    try {
      const aiInsights = await generateInsights(filteredSales, { from: startDate, to: endDate }, filterSlots, userEmail, moduleId);
      setInsights(aiInsights);
    } catch (e) {
      console.error('Error generating insights:', e);
    } finally {
      setInsightsLoading(false);
    }
  };

  const handleSendMessage = async (message: string) => {
    const userMsg: ChatMessage = { role: 'user', content: message };
    setChatMessages(prev => [...prev, userMsg]);
    setChatLoading(true);
    try {
      const response = await chatWithData([...chatMessages, userMsg], filteredSales, filterSlots, userEmail, moduleId);
      setChatMessages(prev => [...prev, { role: 'model', content: response || 'No pude procesar tu solicitud.' }]);
    } catch (err) {
      setChatMessages(prev => [...prev, { role: 'model', content: 'Hubo un error al procesar tu pregunta.' }]);
    } finally { setChatLoading(false); }
  };

  const handleExportCSV = () => {
    if (filteredSales.length === 0) return;
    const headers = Object.keys(filteredSales[0]).join(',');
    const rows = filteredSales.map(row => Object.values(row).map(val => `"${String(val ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([`${headers}\n${rows}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `reporte_${title.toLowerCase().replace(/\s/g, '_')}.csv`;
    link.click();
  };

  const handleExportExcel = () => {
    if (filteredSales.length === 0) return;
    const ws = XLSX.utils.json_to_sheet(filteredSales);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Data");
    XLSX.writeFile(wb, `reporte_${title.toLowerCase().replace(/\s/g, '_')}.xlsx`);
  };

  const handleSave = async () => {
    if (!saveReportName.trim() || !onSaveReport) return;
    setSavingReport(true);
    // Strip non-serializable icon/color refs — keep only data
    const serializableCards = cardConfigs.map(({ id, title, type, field, color }) => ({ id, title, type, field, color }));
    const serializableCharts = chartConfigs.map(({ id, title, type, dimension, metric }) => ({ id, title, type, dimension, metric }));
    await onSaveReport(saveReportName.trim(), moduleId, {
      startDate, endDate, filterSlots,
      cardConfigs: serializableCards,
      chartConfigs: serializableCharts,
      ...(moduleSheetUrl ? { sheetUrl: moduleSheetUrl } : {})
    });
    setSavingReport(false);
    setSaveModalOpen(false);
    setSaveReportName('');
  };

  const handleLoadReport = (report: any) => {
    setStartDate(report.filtros.startDate);
    setEndDate(report.filtros.endDate);
    // Only restore filterSlots if they were actually saved (non-empty)
    if (report.filtros.filterSlots?.length > 0) setFilterSlots(report.filtros.filterSlots);
    // Restore card configs preserving icons from current state
    if (report.filtros.cardConfigs) {
      restoredFromReport.current = true;
      setCardConfigs(prev => prev.map((c, i) => {
        const saved = report.filtros.cardConfigs[i];
        return saved ? { ...c, ...saved, icon: c.icon } : c;
      }));
    }
    // Restore chart configs preserving icons from current state
    if (report.filtros.chartConfigs) {
      restoredFromReport.current = true;
      setChartConfigs(prev => prev.map(c => {
        const saved = report.filtros.chartConfigs.find((s: any) => s.id === c.id);
        return saved ? { ...c, ...saved, icon: c.icon } : c;
      }));
    }
    setActiveReportName(report.nombre);
    setLoadMenuOpen(false);
    setLoadBannerOpen(false);
  };

  const COLORS = ['#3b82f6', '#6366f1', '#8b5cf6', '#0ea5e9', '#06b6d4', '#2dd4bf', '#10b981', '#f59e0b'];

  return (
    <div className="min-h-screen bg-slate-950 pb-12 flex flex-col text-zinc-100">
      <header className="sticky top-0 z-30 bg-slate-900/95 backdrop-blur-md border-b border-slate-800 px-6">

        {/* Fila 1: título */}
        <div className="max-w-7xl mx-auto flex items-center gap-3 pt-3 pb-2">
          <button
            onClick={activeSubmodule ? () => setActiveSubmodule(null) : onBack}
            className="p-1.5 hover:bg-slate-800 rounded-lg text-zinc-500 transition-colors shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <button onClick={onBack} className="leading-tight text-left hover:opacity-80 transition-opacity">
            <h1 className="text-base font-bold text-white">DataPulse <span className="text-blue-400">Libgot</span></h1>
            <p className="text-[10px] text-zinc-500 font-semibold uppercase tracking-widest">
              {activeSubmodule ? `${title} › ${activeSubmodule.title}` : title}
            </p>
          </button>
        </div>

        {/* Hojas del Google Sheet — solo cuando hay múltiples */}
        {moduleType === 'sheet' && sheetsList && sheetsList.length > 1 && (
          <div className="max-w-7xl mx-auto flex items-center gap-1 pb-2 overflow-x-auto no-scrollbar">
            {sheetsList.map((sheet: any) => {
              const isActive = sheet.title === title;
              return (
                <button
                  key={sheet.sheetId}
                  onClick={() => !isActive && onSwitchSheet?.(sheet.title)}
                  disabled={loading || isActive}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold transition-all whitespace-nowrap shrink-0',
                    isActive
                      ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 cursor-default'
                      : 'text-zinc-500 hover:text-zinc-200 hover:bg-slate-800 border border-transparent'
                  )}
                >
                  {isActive && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />}
                  {sheet.title}
                </button>
              );
            })}
          </div>
        )}

        {/* Fila 2: todos los controles alineados a la derecha */}
        <div className="max-w-7xl mx-auto flex items-center justify-end gap-2 pb-2 flex-wrap">

          {/* Shortcuts de período */}
          {moduleType === 'api' && submodules.length === 0 && moduleId !== 'consultas' && (
            <div className="flex items-center gap-0.5 bg-slate-800/60 p-0.5 rounded-lg">
              {(['current_month', 'last_month', 'last_quarter'] as const).map((key, i) => (
                <button key={key} onClick={() => setDateRange(key)}
                  className="px-2.5 py-1 text-[11px] font-semibold text-zinc-400 hover:text-blue-400 hover:bg-blue-500/10 rounded transition-all whitespace-nowrap">
                  {['Mes Actual', 'Mes Anterior', 'Trimestre'][i]}
                </button>
              ))}
            </div>
          )}

          {/* Rango de fechas */}
          {moduleType === 'api' && submodules.length === 0 && moduleId !== 'consultas' && (
            <div className="flex items-center gap-2 bg-slate-800 px-3 py-1 rounded-lg border border-slate-700">
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
                className="text-xs font-bold text-white focus:outline-none bg-transparent w-[100px] [color-scheme:dark]" />
              <span className="text-zinc-600 text-xs">→</span>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)}
                className="text-xs font-bold text-white focus:outline-none bg-transparent w-[100px] [color-scheme:dark]" />
            </div>
          )}

          {/* Separador visual — solo si hay controles de fecha */}
          {submodules.length === 0 && moduleId !== 'consultas' && <div className="w-px h-5 bg-slate-700 mx-1" />}

          {/* Tabs Overview / Datos — oculto en módulos con sub-módulos */}
          {submodules.length === 0 && moduleId !== 'consultas' && (
            <div className="flex bg-slate-800 p-0.5 rounded-lg">
              <button onClick={() => setActiveTab('overview')}
                className={cn("px-4 py-1 text-xs font-bold rounded-md transition-all", activeTab === 'overview' ? "bg-slate-700 text-blue-400" : "text-zinc-500 hover:text-zinc-300")}>
                Overview
              </button>
              <button onClick={() => setActiveTab('data')}
                className={cn("px-4 py-1 text-xs font-bold rounded-md transition-all", activeTab === 'data' ? "bg-slate-700 text-blue-400" : "text-zinc-500 hover:text-zinc-300")}>
                Datos
              </button>
            </div>
          )}

          {/* CTA Cargar/Actualizar */}
          {moduleType === 'api' && submodules.length === 0 && (
            <button onClick={handleFetch} disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-bold rounded-lg transition-colors">
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCcw className="w-3.5 h-3.5" />}
              {sales.length > 0 ? 'Actualizar' : 'Cargar Datos'}
            </button>
          )}

          {/* Guardar */}
          {sales.length > 0 && (
            <button onClick={() => setSaveModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-zinc-300 rounded-lg text-xs font-bold transition-colors">
              <BookmarkPlus className="w-3.5 h-3.5" />
              Guardar
            </button>
          )}

          {/* Mis reportes */}
          {savedReports.length > 0 && (
            <div className="relative">
              <button onClick={() => setLoadMenuOpen(v => !v)}
                className="flex items-center gap-1.5 px-3 py-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-zinc-400 rounded-lg text-xs font-bold transition-colors">
                <FolderOpen className="w-3.5 h-3.5" />
                {activeReportName ?? 'Mis reportes'}
                <span className="bg-blue-600 text-white text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center">{savedReports.length}</span>
              </button>
              {loadMenuOpen && (
                <div className="absolute right-0 top-full mt-2 w-64 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl z-50 overflow-hidden">
                  <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest px-4 pt-3 pb-1">Mis Reportes</p>
                  {savedReports.map((r: any) => (
                    <button key={r.id} onClick={() => handleLoadReport(r)}
                      className="w-full text-left px-4 py-2.5 hover:bg-slate-800 transition-colors flex items-center justify-between group">
                      <div>
                        <p className="text-sm text-zinc-200 font-medium">{r.nombre}</p>
                        <p className="text-[10px] text-zinc-500">{r.fecha}</p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-zinc-600 group-hover:text-blue-400 transition-colors" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

        </div>
      </header>

      {/* Banner: reportes guardados disponibles */}
      <AnimatePresence>
        {loadBannerOpen && savedReports.length > 0 && sales.length === 0 && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="bg-blue-600/10 border-b border-blue-500/20 px-6 py-2.5"
          >
            <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <FolderOpen className="w-4 h-4 text-blue-400 shrink-0" />
                <p className="text-sm text-blue-300">
                  Tenés <span className="font-bold">{savedReports.length}</span> reporte{savedReports.length > 1 ? 's' : ''} guardado{savedReports.length > 1 ? 's' : ''} en este módulo.
                </p>
                <div className="flex items-center gap-2">
                  {savedReports.map((r: any) => (
                    <button
                      key={r.id}
                      onClick={() => handleLoadReport(r)}
                      className="px-3 py-1 bg-blue-600/30 hover:bg-blue-600/50 border border-blue-500/30 text-blue-300 rounded-lg text-xs font-bold transition-colors"
                    >
                      {r.nombre}
                    </button>
                  ))}
                </div>
              </div>
              <button onClick={() => setLoadBannerOpen(false)} className="text-blue-400/60 hover:text-blue-300 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modal: guardar reporte */}
      <AnimatePresence>
        {saveModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setSaveModalOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-sm shadow-2xl"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center gap-3 mb-5">
                <div className="p-2 bg-blue-600/20 rounded-xl">
                  <BookmarkPlus className="w-5 h-5 text-blue-400" />
                </div>
                <div>
                  <h3 className="font-bold text-white">Guardar Reporte</h3>
                  <p className="text-xs text-zinc-500">Se guardarán los filtros actuales</p>
                </div>
              </div>
              <input
                type="text"
                value={saveReportName}
                onChange={e => setSaveReportName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSave()}
                placeholder="Ej: Ventas Marzo 2026"
                autoFocus
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-all mb-4"
              />
              <div className="flex gap-3">
                <button
                  onClick={() => setSaveModalOpen(false)}
                  className="flex-1 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-zinc-400 rounded-xl text-sm font-bold transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSave}
                  disabled={!saveReportName.trim() || savingReport}
                  className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-bold transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {savingReport ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  Guardar
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Indicador reporte activo */}
      <AnimatePresence>
        {activeReportName && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="bg-blue-600/10 border-b border-blue-500/20 px-6 py-2"
          >
            <div className="max-w-7xl mx-auto flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bookmark className="w-3.5 h-3.5 text-blue-400" />
                <span className="text-[11px] font-bold text-blue-300 uppercase tracking-wider">Reporte activo:</span>
                <span className="text-[11px] text-blue-200 font-medium">{activeReportName}</span>
              </div>
              <button onClick={() => setActiveReportName(null)} className="text-blue-400/50 hover:text-blue-300 transition-colors">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <main className="max-w-7xl mx-auto px-6 py-8 w-full flex-1 flex flex-col">
        {showSpinner ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-6 min-h-[70vh]">
            <div className="relative">
              <Loader2 className="w-16 h-16 animate-spin text-blue-500" />
              <div className="absolute inset-0 w-16 h-16 rounded-full bg-blue-500/10 animate-ping" />
            </div>
            <div className="text-center space-y-2">
              <p key={loadingMsgIdx} className="text-white text-base font-semibold transition-all">
                {LOADING_MESSAGES[loadingMsgIdx]}
              </p>
              <p className="text-zinc-500 text-xs">DataPulse está procesando tu consulta</p>
            </div>
          </div>
        ) : isRawText ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-8">
              <div className="bg-slate-900 p-8 rounded-3xl border border-slate-800 shadow-xl relative overflow-hidden">
                <div className="absolute top-0 right-0 p-8 opacity-10">
                  <Database size={120} className="text-blue-500" />
                </div>
                <div className="relative z-10">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="p-3 bg-red-500/20 rounded-2xl">
                      <FileUp className="text-red-500" size={24} />
                    </div>
                    <div>
                      <h2 className="text-2xl font-bold text-white">Análisis de Documento</h2>
                      <p className="text-zinc-500 text-sm">Contenido extraído del PDF para análisis con IA</p>
                    </div>
                  </div>
                  
                  <div className="bg-slate-950/50 rounded-2xl p-6 border border-slate-800/50 max-h-[400px] overflow-y-auto scrollbar-thin scrollbar-thumb-slate-800">
                    <p className="text-zinc-400 text-sm leading-relaxed whitespace-pre-wrap">
                      {data[0].rawText}
                    </p>
                  </div>
                </div>
              </div>

              {insights && (
                <InsightsBlock insights={insights} />
              )}
            </div>

            <div className="lg:col-span-1">
              <ChatPanel 
                chatMessages={chatMessages} 
                chatLoading={chatLoading} 
                onSendMessage={handleSendMessage}
                height="800px"
              />
            </div>
          </div>
        ) : moduleId === 'consultas' ? (
          <ConsultasGeneralesModule userEmail={userEmail} />
        ) : sales.length === 0 && moduleType === 'api' && submodules.length > 0 && !activeSubmodule ? (
          /* Pantalla de selección de sub-módulos */
          <div className="flex-1 flex flex-col items-center justify-center py-20 px-6">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="max-w-2xl w-full space-y-10"
            >
              <div className="text-center space-y-3">
                <div className="w-16 h-16 bg-zinc-800/60 rounded-3xl flex items-center justify-center mx-auto shadow-inner border border-zinc-700/50">
                  <Database className="w-8 h-8 text-zinc-400" />
                </div>
                <h2 className="text-2xl font-bold tracking-tight text-white">{title}</h2>
                <p className="text-zinc-400 text-sm">Seleccioná el sub-módulo al que querés acceder.</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {submodules.map((sub: any, idx: number) => {
                  const isLive = ['uif', 'ri-experian', 'buscador-pagos', 'ri-bcra-tasas', 'cartera-fideicomiso-arg', 'ri-asistente', 'bi-documentacion', 'bi-obsidian', 'admin-gastos', 'marketing-kpis', 'marketing-comunicaciones', 'callcenter-operadores'].includes(sub.id);
                  const isDisabled = ['ri-analitico', 'bi-tools', 'marketing-estrategia'].includes(sub.id);
                  return (
                    <motion.button
                      key={sub.id}
                      initial={{ opacity: 0, y: 16 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.07 }}
                      onClick={() => !isDisabled && setActiveSubmodule(sub)}
                      disabled={isDisabled}
                      className={`group flex flex-col items-start gap-3 p-5 rounded-2xl text-left transition-all shadow-sm hover:shadow-md border ${
                        isDisabled
                          ? 'bg-slate-900/50 border-slate-800 opacity-50 cursor-not-allowed'
                          : isLive
                          ? 'bg-blue-950/40 hover:bg-blue-900/40 border-blue-700/50 hover:border-blue-500'
                          : 'bg-slate-900 hover:bg-slate-800 border-slate-700 hover:border-zinc-500'
                      }`}
                    >
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors border ${
                        isDisabled
                          ? 'bg-zinc-900 border-zinc-800'
                          : isLive
                          ? 'bg-blue-900/60 border-blue-600/50 group-hover:bg-blue-800/60'
                          : 'bg-zinc-800 border-zinc-700 group-hover:bg-zinc-700'
                      }`}>
                        <ChevronRight className={`w-5 h-5 transition-colors ${isDisabled ? 'text-zinc-700' : isLive ? 'text-blue-400 group-hover:text-blue-300' : 'text-zinc-400 group-hover:text-white'}`} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <p className={`font-bold text-sm ${isDisabled ? 'text-zinc-600' : 'text-white'}`}>{sub.title}</p>
                          {isDisabled && <span className="px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider bg-slate-800 text-zinc-600 rounded-md border border-slate-700">Próximamente</span>}
                          {!isDisabled && isLive && <span className="px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider bg-blue-500/20 text-blue-400 rounded-md border border-blue-500/30">Activo</span>}
                        </div>
                        <p className="text-zinc-500 text-xs leading-relaxed">{sub.description}</p>
                      </div>
                    </motion.button>
                  );
                })}
              </div>
            </motion.div>
          </div>

        ) : moduleType === 'api' && submodules.length > 0 && activeSubmodule && activeSubmodule.id !== 'marketing-kpis' ? (
          /* Sub-módulo activo — cada uno renderiza su propio componente */
          activeSubmodule.id === 'uif' ? (
            <UifSubmodule userEmail={userEmail} />
          ) : activeSubmodule.id === 'ri-experian' ? (
            <RiExperianSubmodule />
          ) : activeSubmodule.id === 'buscador-pagos' ? (
            <BuscadorPagosSubmodule />
          ) : activeSubmodule.id === 'ri-bcra-tasas' ? (
            <RiBcraTasasSubmodule />
          ) : activeSubmodule.id === 'cartera-fideicomiso-arg' ? (
            <CarteraFideicomisoSubmodule />
          ) : activeSubmodule.id === 'ri-analitico' ? (
            <RiAnaliticoSubmodule />
          ) : activeSubmodule.id === 'ri-asistente' ? (
            <RiAsistenteSubmodule />
          ) : activeSubmodule.id === 'bi-documentacion' ? (
            <BiDocumentacionSubmodule />
          ) : activeSubmodule.id === 'bi-obsidian' ? (
            <BiObsidianSubmodule />
          ) : activeSubmodule.id === 'admin-gastos' ? (
            <AdmGastosProveedoresSubmodule userEmail={userEmail} />
          ) : activeSubmodule.id === 'marketing-comunicaciones' ? (
            <MktComunicacionesSubmodule userEmail={userEmail} />
          ) : activeSubmodule.id === 'callcenter-operadores' ? (
            <OperadoresVentasSubmodule userEmail={userEmail} />
          ) : (
            /* Placeholder para sub-módulos aún sin implementar */
            <div className="flex-1 flex flex-col items-center justify-center py-20">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="max-w-md w-full text-center space-y-6"
              >
                <div className="w-16 h-16 bg-zinc-800/60 rounded-3xl flex items-center justify-center mx-auto border border-zinc-700/50">
                  <Database className="w-8 h-8 text-zinc-400" />
                </div>
                <div className="space-y-2">
                  <h2 className="text-2xl font-bold text-white">{activeSubmodule.title}</h2>
                  <p className="text-zinc-400 text-sm leading-relaxed">{activeSubmodule.description}</p>
                </div>
                <div className="inline-flex items-center gap-2 px-4 py-2 bg-zinc-800/60 border border-zinc-700 rounded-xl text-zinc-500 text-xs font-bold uppercase tracking-widest">
                  <Sparkles className="w-3.5 h-3.5" />
                  Lógica en desarrollo
                </div>
              </motion.div>
            </div>
          )

        ) : sales.length === 0 && moduleType === 'api' ? (
          <div className="flex-1 flex flex-col items-center justify-center py-20">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="max-w-md w-full text-center space-y-8"
            >
            <div className="w-20 h-20 bg-blue-900/20 rounded-3xl flex items-center justify-center mx-auto shadow-inner">
              <Database className="w-10 h-10 text-blue-500" />
            </div>
            
            <div className="space-y-3">
              <h2 className="text-3xl font-bold tracking-tight text-white">Bienvenido al {title}</h2>
              <p className="text-zinc-400 text-sm leading-relaxed">
                Para comenzar el análisis, por favor selecciona el rango de fechas que deseas consultar y presiona el botón de carga.
              </p>
            </div>

            <div className="p-6 bg-slate-900 border border-slate-800 rounded-2xl shadow-sm space-y-6">
              <div className="flex flex-wrap items-center justify-center gap-2">
                <button 
                  onClick={() => setDateRange('current_month')}
                  className="px-4 py-2 text-xs font-bold text-zinc-400 bg-slate-800 hover:bg-blue-900/30 hover:text-blue-400 rounded-xl border border-slate-700 transition-all"
                >
                  Mes Actual
                </button>
                <button 
                  onClick={() => setDateRange('last_month')}
                  className="px-4 py-2 text-xs font-bold text-zinc-400 bg-slate-800 hover:bg-blue-900/30 hover:text-blue-400 rounded-xl border border-slate-700 transition-all"
                >
                  Mes Anterior
                </button>
                <button 
                  onClick={() => setDateRange('last_quarter')}
                  className="px-4 py-2 text-xs font-bold text-zinc-400 bg-slate-800 hover:bg-blue-900/30 hover:text-blue-400 rounded-xl border border-slate-700 transition-all"
                >
                  Último Trimestre
                </button>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5 text-left">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Fecha Desde</label>
                  <div className="flex items-center gap-2 px-3 py-2 bg-slate-950 rounded-xl border border-slate-700 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/10 transition-all">
                    <input 
                      type="date" 
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="w-full bg-transparent text-sm font-bold text-white focus:outline-none [color-scheme:dark]"
                    />
                  </div>
                </div>
                <div className="space-y-1.5 text-left">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Fecha Hasta</label>
                  <div className="flex items-center gap-2 px-3 py-2 bg-slate-950 rounded-xl border border-slate-700 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/10 transition-all">
                    <input 
                      type="date" 
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="w-full bg-transparent text-sm font-bold text-white focus:outline-none [color-scheme:dark]"
                    />
                  </div>
                </div>
              </div>

              <button 
                onClick={handleFetch}
                disabled={loading}
                className="w-full bg-blue-600 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-blue-500 transition-all shadow-lg shadow-blue-900/40 disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Procesando Ingesta...</span>
                  </>
                ) : (
                  <>
                    <span>Iniciar Ingesta de Datos</span>
                    <ArrowRight className="w-5 h-5" />
                  </>
                )}
              </button>
            </div>

              <div className="flex items-center justify-center gap-6 pt-4">
                <div className="flex items-center gap-2 text-zinc-400">
                  <RefreshCcw className="w-4 h-4" />
                  <span className="text-[10px] font-bold uppercase tracking-widest">Tiempo Real</span>
                </div>
                <div className="flex items-center gap-2 text-zinc-400">
                  <Sparkles className="w-4 h-4" />
                  <span className="text-[10px] font-bold uppercase tracking-widest">Insights IA</span>
                </div>
              </div>
            </motion.div>
          </div>
        ) : activeTab === 'overview' ? (
          <div className="space-y-8">
            {/* Dynamic Filters Bar */}
            <div className="p-6 bg-slate-900 border border-slate-800 rounded-2xl shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2 text-zinc-400">
                  <Filter className="w-4 h-4" />
                  <span className="text-xs font-bold uppercase tracking-wider">Configuración de Filtros:</span>
                  {isFiltering && (
                    <span className="flex items-center gap-1 text-[10px] text-blue-400 animate-pulse">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Aplicando...
                    </span>
                  )}
                </div>
                {filterSlots.some(s => s.values.length > 0) && (
                  <button 
                    onClick={() => {
                      setFilterSlots(prev => prev.map(s => ({ ...s, values: [] })));
                    }}
                    className="px-3 py-1.5 text-[10px] font-bold text-rose-400 bg-rose-900/20 hover:bg-rose-900/40 rounded-lg transition-colors flex items-center gap-1"
                  >
                    <X className="w-3 h-3" />
                    Limpiar Filtros
                  </button>
                )}
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {filterSlots.map((slot, idx) => (
                  <div key={idx} className="flex flex-col gap-2 p-3 bg-slate-800/50 rounded-xl border border-slate-700">
                    <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Variable de Filtro {idx + 1}</span>
                    <select
                      value={slot.field}
                      onChange={(e) => {
                        const newSlots = [...filterSlots];
                        newSlots[idx] = { field: e.target.value, values: [] };
                        setFilterSlots(newSlots);
                      }}
                      className="w-full text-[10px] font-bold text-white bg-slate-950 hover:bg-slate-900 px-2 py-1.5 rounded-md transition-all focus:outline-none border border-slate-700"
                    >
                      <option value="" className="bg-slate-900 text-zinc-500">— elegir campo —</option>
                      {availableFields.map(field => (
                        <option key={field} value={field} className="bg-slate-900 text-white">{(field || '').replace(/_/g, ' ').toUpperCase()}</option>
                      ))}
                    </select>
                    <MultiSelect
                      options={filterOptions[slot.field] || []}
                      selected={slot.values}
                      onChange={(newValues: string[]) => {
                        const newSlots = [...filterSlots];
                        newSlots[idx].values = newValues;
                        setFilterSlots(newSlots);
                      }}
                      placeholder={`Seleccionar ${(slot.field || '').replace(/_/g, ' ')}...`}
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {cardConfigs.map((config, idx) => (
                <StatCard 
                  key={config.id}
                  title={config.title} 
                  value={stats[idx]} 
                  icon={config.icon} 
                  color={config.color}
                  currentField={config.field}
                  currentType={config.type}
                  availableFields={availableFields}
                  countryBreakdown={countryBreakdowns[idx]}
                  onConfigChange={(newConfig: any) => {
                    const updated = [...cardConfigs];
                    updated[idx] = { ...updated[idx], ...newConfig };
                    setCardConfigs(updated);
                  }}
                />
              ))}
            </div>

            {/* Insights & Chat */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  <div className="bg-slate-900 rounded-2xl p-6 text-white shadow-xl h-[500px] flex flex-col relative overflow-hidden border border-slate-800">
                    <div className="absolute top-0 right-0 p-4 opacity-5">
                      <Sparkles className="w-20 h-20" />
                    </div>
                    <div className="flex items-center justify-between mb-6">
                      <div className="flex items-center gap-2">
                        <Bot className="w-5 h-5 text-blue-400" />
                        <h3 className="font-semibold text-zinc-100">Insights de la IA</h3>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleUpdateInsights();
                        }}
                        disabled={insightsLoading || filteredSales.length === 0}
                        className="group flex items-center gap-2 px-3 py-1.5 bg-blue-600/10 hover:bg-blue-600/20 text-blue-400 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all disabled:opacity-50 border border-blue-500/20 cursor-pointer relative z-10"
                        title="Actualizar insights con los filtros aplicados"
                      >
                        {insightsLoading ? (
                          <Loader2 className="w-3 h-3 animate-spin pointer-events-none" />
                        ) : (
                          <RefreshCcw className="w-3 h-3 pointer-events-none" />
                        )}
                        <span className="pointer-events-none">Actualizar</span>
                      </button>
                    </div>
                    <div className="flex-1 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-slate-800">
                      {insightsLoading ? (
                        <div className="flex flex-col items-center justify-center h-full gap-4">
                          <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
                          <p className="text-zinc-500 text-sm animate-pulse">Analizando tendencias...</p>
                        </div>
                      ) : insights ? (
                        <InsightsPanel insights={insights} />
                      ) : <p className="text-zinc-600 text-center mt-20">Carga datos para obtener insights automáticos.</p>}
                    </div>
                  </div>
              <ChatPanel chatMessages={chatMessages} chatLoading={chatLoading} onSendMessage={handleSendMessage} height="500px" />
            </div>

            {/* Marketing Funnels */}
            {moduleId === 'marketing' && filteredSales.length > 0 && (
              <MarketingFunnelCharts records={filteredSales} />
            )}

            {/* Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {chartConfigs.map((config, idx) => (
                <div key={config.id} className={cn(idx === 0 || idx === 3 ? "lg:col-span-2" : "lg:col-span-1")}>
                  <ChartContainer 
                    title={config.title}
                    icon={config.icon}
                    availableFields={availableFields}
                    currentDimension={config.dimension}
                    currentMetric={config.metric}
                    currentType={config.type}
                    onConfigChange={(newConfig: any) => {
                      const updated = [...chartConfigs];
                      updated[idx] = { ...updated[idx], ...newConfig };
                      setChartConfigs(updated);
                    }}
                  >
                    <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                      {config.type === 'AREA' ? (
                        <AreaChart data={processedChartData[idx]}>
                          <defs>
                            <linearGradient id={`color-${idx}`} x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                              <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1e293b" />
                          <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 10}} />
                          <YAxis axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 10}} />
                          <Tooltip 
                            contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px', color: '#f1f5f9' }}
                            itemStyle={{ color: '#3b82f6' }}
                          />
                          <Area type="monotone" dataKey="value" stroke="#3b82f6" fill={`url(#color-${idx})`} fillOpacity={1} strokeWidth={3} />
                        </AreaChart>
                      ) : config.type === 'BAR' ? (
                        <BarChart data={processedChartData[idx]}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1e293b" />
                          <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 10}} />
                          <YAxis axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 10}} />
                          <Tooltip 
                            contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px', color: '#f1f5f9' }}
                            itemStyle={{ color: '#6366f1' }}
                          />
                          <Bar dataKey="value" fill="#6366f1" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      ) : config.type === 'SCATTER' ? (
                        <ScatterChart>
                          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                          <XAxis dataKey="x" type="number" name="índice" axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 10}} />
                          <YAxis dataKey="y" type="number" name={config.metric} axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 10}} />
                          <ZAxis range={[40, 40]} />
                          <Tooltip
                            cursor={{ strokeDasharray: '3 3' }}
                            contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px', color: '#f1f5f9' }}
                            formatter={(value: any, name: any, props: any) => [value, props.payload.name || name]}
                          />
                          <Scatter data={processedChartData[idx]} fill="#06b6d4" fillOpacity={0.7} />
                        </ScatterChart>
                      ) : (
                        <PieChart>
                          <Pie data={processedChartData[idx]} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">
                            {processedChartData[idx].map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                          </Pie>
                          <Tooltip />
                        </PieChart>
                      )}
                    </ResponsiveContainer>
                  </ChartContainer>
                </div>
              ))}
            </div>
          </div>
        ) : (
          /* Data Table View */
          <div className="bg-slate-900 rounded-2xl border border-slate-800 shadow-sm overflow-hidden flex flex-col h-full">
            <div className="p-6 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-white">Detalle de Datos</h3>
                <p className="text-xs text-zinc-400">{filteredSales.length} registros filtrados</p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={handleExportCSV} className="flex items-center gap-2 px-4 py-2 bg-slate-800 border border-slate-700 rounded-xl text-sm font-bold text-zinc-300 hover:bg-slate-700 transition-colors">
                  <Download className="w-4 h-4" /> CSV
                </button>
                <button onClick={handleExportExcel} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-500 transition-colors shadow-lg shadow-blue-900/20">
                  <Download className="w-4 h-4" /> Excel
                </button>
              </div>
            </div>
            <SalesTable sales={filteredSales} />
          </div>
        )}
      </main>

      <footer className="max-w-7xl mx-auto px-6 py-12 border-t border-slate-800 w-full mt-auto flex flex-col gap-12">
        <div className="flex items-center gap-4 text-[10px] text-zinc-600">
          <span className="font-bold uppercase tracking-widest">Tipo de cambio</span>
          <div className="flex items-center gap-1.5">
            <DollarSign className="w-3 h-3 text-blue-500/60" />
            <span>ARS/USD: <span className="text-blue-400/80 font-bold">{Math.round(exchangeRates.ARS)}</span></span>
          </div>
          <div className="w-[1px] h-3 bg-slate-800" />
          <div className="flex items-center gap-1.5">
            <DollarSign className="w-3 h-3 text-blue-500/60" />
            <span>COP/USD: <span className="text-blue-400/80 font-bold">{Math.round(exchangeRates.COP)}</span></span>
          </div>
          <span className="text-zinc-700 italic">Act: {exchangeRates.LAST_UPDATE}</span>
        </div>
        <PowerBIButton />

        <div className="flex flex-col md:flex-row items-center justify-between gap-8 text-zinc-400 text-sm font-medium">
          <div className="flex items-center gap-2 opacity-50">
            <TrendingUp className="w-4 h-4" />
            <span className="uppercase tracking-widest text-xs text-white">DataPulse Libgot Analytics</span>
          </div>
          
          <div className="flex flex-wrap justify-center gap-8 text-zinc-400 text-xs font-bold uppercase tracking-widest">
            <a href="https://notebooklm.google.com/notebook/854ed618-48fc-4e44-9483-772a0dced21c" target="_blank" rel="noreferrer" className="hover:text-blue-400 transition-colors flex items-center gap-2">
              <ChevronRight size={14} /> DOCUMENTACIÓN
            </a>
            <button
              onClick={onOpenTerms}
              className="hover:text-blue-400 transition-colors flex items-center gap-2 cursor-pointer uppercase"
            >
              <ChevronRight size={14} /> PRIVACIDAD
            </button>
            <button
              onClick={onOpenFeatureRequest}
              className="hover:text-blue-400 transition-colors flex items-center gap-2 cursor-pointer uppercase"
            >
              <ChevronRight size={14} /> SUGERENCIAS
            </button>
          </div>
        </div>

        <ContactGrid />

        <div className="text-center text-zinc-500 text-[10px] font-bold uppercase tracking-[0.2em] pt-8 border-t border-slate-900/50">
          © 2026 Business Intelligence Suite - Punta de lanza tecnológica
        </div>
      </footer>
    </div>
  );
}
