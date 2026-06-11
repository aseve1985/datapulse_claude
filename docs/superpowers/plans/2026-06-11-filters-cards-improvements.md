# Filters & Cards Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Increase filter slots from 3 to 4, default first filter to `pais`, and disaggregate SUM cards by country when multiple countries are present in filtered data.

**Architecture:** All changes are in `src/components/DashboardView.tsx`. Two filter-slot initializations are updated, a new `countryBreakdowns` useMemo is added after the existing `stats` useMemo, and `StatCard` gains a `countryBreakdown` prop that replaces the single `<h3>` value with per-country rows.

**Tech Stack:** React, TypeScript, useMemo, Tailwind CSS.

> **Note:** This project has no automated test suite. Each task includes manual verification instead.

---

### Task 1: 4 filter slots with `pais` as first default

**Files:**
- Modify: `src/components/DashboardView.tsx` (~lines 837–854)

There are **two** `setFilterSlots` calls that initialize empty slots. Both must be updated identically. They live inside the same `useEffect` that fires when `availableFields` changes.

- [ ] **Step 1: Locate both initializations**

Search for the string `Filter slots: always 3 empty slots` in `src/components/DashboardView.tsx`. Both calls are in the same `useEffect` block (~lines 837–854).

- [ ] **Step 2: Update first initialization (inside `if (restoredFromReport.current)` branch)**

Replace:
```typescript
      // Filter slots: always 3 empty slots (user sets them manually)
      if (filterSlots.length === 0) {
        setFilterSlots([
          { field: '', values: [] },
          { field: '', values: [] },
          { field: '', values: [] },
        ]);
      }
```

With:
```typescript
      // Filter slots: 4 slots, first defaults to pais
      if (filterSlots.length === 0) {
        setFilterSlots([
          { field: 'pais', values: [] },
          { field: '', values: [] },
          { field: '', values: [] },
          { field: '', values: [] },
        ]);
      }
```

- [ ] **Step 3: Update second initialization (inside `else` branch, ~line 847)**

Replace:
```typescript
      // If report had no filterSlots, init 3 empty editable slots
      if (filterSlots.length === 0) {
        setFilterSlots([
          { field: '', values: [] },
          { field: '', values: [] },
          { field: '', values: [] },
        ]);
      }
```

With:
```typescript
      // Filter slots: 4 slots, first defaults to pais
      if (filterSlots.length === 0) {
        setFilterSlots([
          { field: 'pais', values: [] },
          { field: '', values: [] },
          { field: '', values: [] },
          { field: '', values: [] },
        ]);
      }
```

- [ ] **Step 4: Verify TypeScript compiles cleanly**

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 5: Manual verification**

Start `npm run dev`, open a module with data. Confirm:
- 4 filter slots visible instead of 3
- First slot already shows `pais` as selected field with available country values to pick

- [ ] **Step 6: Commit**

```bash
git add src/components/DashboardView.tsx
git commit -m "feat: increase filter slots to 4 and default first to pais"
```

---

### Task 2: Add `countryBreakdowns` useMemo

**Files:**
- Modify: `src/components/DashboardView.tsx` (after `stats` useMemo, ~line 954)

- [ ] **Step 1: Insert `countryBreakdowns` useMemo immediately after the `stats` useMemo**

The `stats` useMemo ends at line ~954 with `}, [filteredSales, cardConfigs]);`. Insert the following block right after that closing line:

```typescript
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
```

- [ ] **Step 2: Verify TypeScript compiles cleanly**

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/DashboardView.tsx
git commit -m "feat: add countryBreakdowns useMemo for per-country SUM disaggregation"
```

---

### Task 3: Update `StatCard` to render country breakdown + wire prop

**Files:**
- Modify: `src/components/DashboardView.tsx` (two locations: StatCard component ~line 79, StatCard invocation ~line 1612)

- [ ] **Step 1: Add `countryBreakdown` to StatCard props and update display**

The `StatCard` component signature is at ~line 79:
```typescript
const StatCard = React.memo(({ title, value, icon: Icon, trend, color, onConfigChange, availableFields, currentField, currentType }: any) => {
```

Add `countryBreakdown` to the destructured props:
```typescript
const StatCard = React.memo(({ title, value, icon: Icon, trend, color, onConfigChange, availableFields, currentField, currentType, countryBreakdown }: any) => {
```

Then find the display block inside StatCard (~line 165–171). The current code is:
```tsx
      <>
        <p className="text-zinc-400 text-sm font-medium">{displayTitle}</p>
        <h3 className="text-2xl font-bold text-white mt-1 truncate" title={String(value)}>{value}</h3>
        <p className="text-[10px] text-zinc-400 mt-1 uppercase font-bold tracking-wider">
          {currentType === 'COUNT' ? 'Registros Totales' : `${currentType} de ${currentField.replace(/_/g, ' ')}`}
        </p>
      </>
```

Replace with:
```tsx
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
        <p className="text-[10px] text-zinc-400 mt-1 uppercase font-bold tracking-wider">
          {currentType === 'COUNT' ? 'Registros Totales' : `${currentType} de ${currentField.replace(/_/g, ' ')}`}
        </p>
      </>
```

- [ ] **Step 2: Pass `countryBreakdown` prop in the StatCard invocation**

Find the `StatCard` usage in the JSX (~line 1612):
```tsx
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
                  onConfigChange={(newConfig: any) => {
                    const updated = [...cardConfigs];
                    updated[idx] = { ...updated[idx], ...newConfig };
                    setCardConfigs(updated);
                  }}
                />
              ))}
```

Add `countryBreakdown={countryBreakdowns[idx]}` as a prop:
```tsx
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
```

- [ ] **Step 3: Verify TypeScript compiles cleanly**

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 4: Manual verification — two-country scenario**

Open a module with data from both Argentina and Colombia (no pais filter active). Confirm:
- SUM cards show two rows (one per country) with country label and formatted amount
- COUNT and AVG cards are unaffected (show single value as before)

- [ ] **Step 5: Manual verification — single-country scenario**

In the same module, use the first filter slot to select only one country (e.g., ARG). Confirm:
- SUM cards revert to showing a single formatted total
- No country label rows visible

- [ ] **Step 6: Commit**

```bash
git add src/components/DashboardView.tsx
git commit -m "feat: disaggregate SUM cards by country when multiple countries present"
```
