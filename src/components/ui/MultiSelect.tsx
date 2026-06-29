import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, X } from 'lucide-react';

interface MultiSelectProps {
  label: string;
  options: string[];
  value: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  optionLabels?: Record<string, string>; // optional display labels for option values
  className?: string;
}

export default function MultiSelect({
  label,
  options,
  value,
  onChange,
  placeholder = 'Todos',
  optionLabels,
  className = '',
}: MultiSelectProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const toggle = (opt: string) => {
    onChange(value.includes(opt) ? value.filter(v => v !== opt) : [...value, opt]);
  };

  const displayLabel = (v: string) => optionLabels?.[v] ?? v;

  const displayText =
    value.length === 0 ? placeholder
    : value.length === 1 ? displayLabel(value[0])
    : `${value.length} seleccionados`;

  return (
    <div ref={ref} className={`relative flex flex-col gap-1 ${className}`}>
      <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">{label}</span>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`flex items-center justify-between gap-1 bg-slate-800 border rounded-lg px-2 py-1.5 text-xs focus:outline-none transition-colors min-w-0 ${
          open ? 'border-indigo-500' : 'border-slate-700 hover:border-slate-600'
        }`}
      >
        <span className={`truncate ${value.length === 0 ? 'text-zinc-500' : 'text-white'}`}>{displayText}</span>
        <div className="flex items-center gap-1 flex-shrink-0 ml-1">
          {value.length > 0 && (
            <X
              className="w-3 h-3 text-zinc-500 hover:text-zinc-300"
              onClick={e => { e.stopPropagation(); onChange([]); }}
            />
          )}
          <ChevronDown className={`w-3 h-3 text-zinc-500 transition-transform duration-150 ${open ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {open && (
        <div className="absolute z-50 top-full mt-1 left-0 min-w-full w-max max-w-[240px] bg-slate-800 border border-slate-700 rounded-lg shadow-xl max-h-56 overflow-y-auto">
          {options.length === 0 ? (
            <p className="px-3 py-2 text-[11px] text-zinc-500 italic">Sin opciones</p>
          ) : (
            <>
              <label className="flex items-center gap-2.5 px-3 py-1.5 hover:bg-slate-700 cursor-pointer transition-colors border-b border-slate-700">
                <input
                  type="checkbox"
                  checked={value.length === options.length}
                  ref={el => { if (el) el.indeterminate = value.length > 0 && value.length < options.length; }}
                  onChange={() => onChange(value.length === options.length ? [] : [...options])}
                  className="accent-indigo-500 w-3.5 h-3.5 flex-shrink-0 cursor-pointer"
                />
                <span className="text-xs text-zinc-400 font-semibold">Seleccionar todos</span>
              </label>
              {options.map(opt => (
                <label
                  key={opt}
                  className="flex items-center gap-2.5 px-3 py-1.5 hover:bg-slate-700 cursor-pointer transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={value.includes(opt)}
                    onChange={() => toggle(opt)}
                    className="accent-indigo-500 w-3.5 h-3.5 flex-shrink-0 cursor-pointer"
                  />
                  <span className="text-xs text-zinc-200 truncate">{displayLabel(opt)}</span>
                </label>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
