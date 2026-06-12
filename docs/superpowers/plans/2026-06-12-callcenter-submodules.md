# Callcenter Submodules Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 3 submodules to the Callcenter module — two placeholders and a functional "Buscador de Pagos" that searches the cobranzas parquet dataset by `identificacion_cliente` with exact match, filtered by country.

**Architecture:** Follow the exact pattern used by the Legales module. LandingPage defines the submodule list; DashboardView routes to the active submodule component; each submodule is a self-contained component in `src/components/submodules/`. BuscadorPagosSubmodule fetches `/api/collections-s3`, filters client-side, sorts, and displays results in a full-width table with Excel export.

**Tech Stack:** React, TypeScript, Tailwind CSS, Framer Motion, `xlsx` (already installed), `lucide-react`

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `src/components/LandingPage.tsx` | Modify | Add `submodules` array to the `callcenter` module entry |
| `src/components/DashboardView.tsx` | Modify | Import and wire `BuscadorPagosSubmodule` in the submodule routing block |
| `src/components/submodules/BuscadorPagosSubmodule.tsx` | Create | Search form, fetch, filter, sort, display table, export Excel |

---

### Task 1: Add submodules to callcenter in LandingPage.tsx

**Files:**
- Modify: `src/components/LandingPage.tsx`

- [ ] **Step 1: Locate the callcenter entry**

Open `src/components/LandingPage.tsx`. Find the object with `id: 'callcenter'`. It currently looks like:

```ts
{
  id: 'callcenter',
  title: 'Callcenter',
  description: 'Métricas de atención, tiempos de respuesta y satisfacción del cliente.',
  icon: Headphones,
  color: 'bg-indigo-800',
  type: 'api'
},
```

- [ ] **Step 2: Add the submodules array**

Replace that object with:

```ts
{
  id: 'callcenter',
  title: 'Callcenter',
  description: 'Métricas de atención, tiempos de respuesta y satisfacción del cliente.',
  icon: Headphones,
  color: 'bg-indigo-800',
  type: 'api',
  submodules: [
    {
      id: 'operadores-ventas',
      title: 'Operadores de Ventas',
      description: 'Métricas de desempeño y gestión de operadores del equipo de ventas.',
      color: 'bg-indigo-800'
    },
    {
      id: 'operadores-cobranzas',
      title: 'Operadores de Cobranzas',
      description: 'Métricas de desempeño y gestión de operadores del equipo de cobranzas.',
      color: 'bg-indigo-800'
    },
    {
      id: 'buscador-pagos',
      title: 'Buscador de Pagos',
      description: 'Consulta de pagos por CUIL (Argentina) o Cédula (Colombia) sobre la base de cobranzas.',
      color: 'bg-indigo-800'
    }
  ]
},
```

- [ ] **Step 3: Commit**

```bash
git add src/components/LandingPage.tsx
git commit -m "feat: add submodules structure to callcenter module"
```

---

### Task 2: Create BuscadorPagosSubmodule.tsx

**Files:**
- Create: `src/components/submodules/BuscadorPagosSubmodule.tsx`

- [ ] **Step 1: Create the file with full implementation**

Create `src/components/submodules/BuscadorPagosSubmodule.tsx` with this content:

```tsx
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
```

- [ ] **Step 2: Commit**

```bash
git add src/components/submodules/BuscadorPagosSubmodule.tsx
git commit -m "feat: add BuscadorPagosSubmodule with country filter and exact search"
```

---

### Task 3: Wire BuscadorPagosSubmodule in DashboardView.tsx

**Files:**
- Modify: `src/components/DashboardView.tsx`

- [ ] **Step 1: Add the import**

At the top of `src/components/DashboardView.tsx`, alongside the existing submodule imports (around line 35-36), add:

```tsx
import BuscadorPagosSubmodule from './submodules/BuscadorPagosSubmodule';
```

- [ ] **Step 2: Add the routing case**

Find the block that routes active submodules (around line 1461). It currently reads:

```tsx
activeSubmodule.id === 'uif' ? (
  <UifSubmodule userEmail={userEmail} />
) : activeSubmodule.id === 'ri-experian' ? (
  <RiExperianSubmodule />
) : (
  /* Placeholder para sub-módulos aún sin implementar */
  ...
)
```

Add the `buscador-pagos` case before the final fallback:

```tsx
activeSubmodule.id === 'uif' ? (
  <UifSubmodule userEmail={userEmail} />
) : activeSubmodule.id === 'ri-experian' ? (
  <RiExperianSubmodule />
) : activeSubmodule.id === 'buscador-pagos' ? (
  <BuscadorPagosSubmodule />
) : (
  /* Placeholder para sub-módulos aún sin implementar */
  ...
)
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/DashboardView.tsx
git commit -m "feat: wire BuscadorPagosSubmodule into callcenter routing"
```

---

## Self-Review

**Spec coverage:**
- ✅ 3 submodules added to callcenter (operadores-ventas, operadores-cobranzas, buscador-pagos)
- ✅ First two are placeholders (fall through to existing "Lógica en desarrollo" screen)
- ✅ Buscador fetches from `/api/collections-s3`
- ✅ Country selector ARG/COL with label CUIL/Cédula
- ✅ Numeric-only input
- ✅ Exact match on `identificacion_cliente`
- ✅ All columns displayed
- ✅ Sorted by tipo_producto → id_producto → fecha_pago
- ✅ No pagination
- ✅ Excel export with filename `buscador_pagos_<id>_<date>.xlsx`
- ✅ Nueva búsqueda resets to form

**Placeholder scan:** No TBDs or TODOs present.

**Type consistency:** `Country` type used consistently throughout. `results: any[]` consistent with cobranzas data shape (unknown at compile time).
