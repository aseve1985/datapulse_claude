# Callcenter Submodules Design

**Date:** 2026-06-12  
**Status:** Approved

## Overview

Add a 3-submodule structure to the Callcenter module, following the same pattern used in Legales. Two submodules are placeholders; the third ("Buscador de Pagos") is a fully functional search tool over the cobranzas parquet dataset.

---

## Submodules

| id | Title | Status |
|---|---|---|
| `operadores-ventas` | Operadores de Ventas | Placeholder (lógica en desarrollo) |
| `operadores-cobranzas` | Operadores de Cobranzas | Placeholder (lógica en desarrollo) |
| `buscador-pagos` | Buscador de Pagos | Funcional |

---

## Architecture

### 1. LandingPage.tsx
Add `submodules` array to the `callcenter` module entry, identical in structure to the `legal` module. Each submodule has `id`, `title`, `description`, and `color`.

### 2. DashboardView.tsx
In the `activeSubmodule` routing block (currently handles `uif` and `ri-experian`), add a case for `buscador-pagos` that renders `<BuscadorPagosSubmodule />`.

### 3. New file: `src/components/submodules/BuscadorPagosSubmodule.tsx`
Self-contained component. No props required (fetches its own data).

---

## BuscadorPagosSubmodule — Detail

### States
| State | Type | Purpose |
|---|---|---|
| `country` | `'ARG' \| 'COL'` | Selected country |
| `inputValue` | `string` | Raw numeric input from user |
| `results` | `any[]` | Filtered records from cobranzas dataset |
| `loading` | `boolean` | Fetch in progress |
| `error` | `string \| null` | Error message |
| `searched` | `boolean` | Whether a search has been executed |

### UI Flow

1. **Search form** (initial state / after "Nueva búsqueda"):
   - Selector de país: `ARG` / `COL` (radio buttons or select)
   - Numeric input: label reads "CUIL" when ARG, "Cédula" when COL; accepts digits only
   - Botón "Buscar"

2. **Loading state**: spinner mientras se consulta el endpoint

3. **No results**: mensaje informativo ("No se encontraron registros para ese identificador.")

4. **Results**:
   - Tabla con todas las columnas del dataset, sin paginación
   - Ordenada por: `tipo_producto` → `id_producto` → `fecha_pago`
   - Botón **Exportar Excel** (descarga .xlsx con XLSX library)
   - Botón **Nueva búsqueda** (resetea a formulario inicial)

### Data Flow
- Fetch: `GET /api/collections-s3` (respuesta cacheada en servidor, 1h TTL)
- Filtrado client-side:
  1. Por país: campo `pais` del dataset — match case-insensitive conteniendo "ARGENTIN" o "COLOMB"
  2. Por identificador: campo `identificacion_cliente` — match exacto (string)
- El input del usuario se normaliza a string antes de comparar

### Input Validation
- Solo acepta dígitos (`/^\d*$/`)
- No se puede enviar vacío
- Match contra `identificacion_cliente` es exacto (sin trim adicional — el valor se lee tal cual del dataset)

### Export
- Librería: `xlsx` (ya instalada)
- Nombre del archivo: `buscador_pagos_<identificador>_<YYYY-MM-DD>.xlsx`
- Una sola hoja con todas las columnas y todos los registros encontrados

---

## Files to Create/Modify

| File | Action |
|---|---|
| `src/components/LandingPage.tsx` | Modify — add submodules to callcenter entry |
| `src/components/DashboardView.tsx` | Modify — import and wire BuscadorPagosSubmodule |
| `src/components/submodules/BuscadorPagosSubmodule.tsx` | Create |
