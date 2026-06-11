# Filters & Cards Improvements — Design Spec
**Date:** 2026-06-11
**Status:** Approved

## Overview

Three UX improvements to `DashboardView.tsx` affecting all API modules (Ventas, Servicios, Cobranzas, etc.). Single file change, no backend modifications.

## Change 1 — 4 Filter Slots

Increase the default number of filter slots from 3 to 4. There are two initialization points in `DashboardView.tsx` where `filterSlots` is set to 3 empty slots — both must be updated.

## Change 2 — First Filter Defaults to `pais`

The first filter slot is initialized with `{ field: 'pais', values: [] }` instead of `{ field: '', values: [] }`. Remains fully editable by the user. If the dataset has no `pais` column the filter slot is visible but inactive (no available values to select — no crash).

## Change 3 — SUM Cards Disaggregated by Country

**Problem:** A SUM card on a monetary field sums all rows regardless of country, mixing ARS and COP into a single meaningless number.

**Solution:** Add optional `countryBreakdown` prop to `StatCard`. When a SUM-type card has `filteredSales` containing more than one unique `pais` value, compute per-country subtotals and render them as separate rows instead of a single total.

**Logic:**
- New `useMemo` called `countryBreakdowns` — for each card config, if type is `SUM` and the field exists:
  - Get unique `pais` values from `filteredSales`
  - If > 1 unique country: compute `{ [paisValue: string]: string }` (formatted currency per country)
  - If ≤ 1 unique country: `null` (use existing single-value rendering)
- `countryBreakdown` is passed to each `StatCard`

**StatCard rendering when `countryBreakdown` is present (length > 1):**
- Replace the single `<h3>` value with a compact list of `pais: amount` rows
- Keep existing single-value rendering when `countryBreakdown` is null

**Example — two countries active:**
```
Total de monto_pago
  ARG  $ 1.245.000
  COL  $ 4.820.000
```

**Example — one country filtered:**
```
Total de monto_pago
  $ 1.245.000
```

## Scope

- **File:** `src/components/DashboardView.tsx` only
- **No backend changes**
- **No new files**
- Applies to all modules (Ventas, Servicios, Cobranzas, and future modules)
