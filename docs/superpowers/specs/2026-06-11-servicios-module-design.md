# Módulo Servicios — Design Spec
**Date:** 2026-06-11  
**Status:** Approved

## Overview

Add a new top-level module called **Servicios** that replicates the Ventas module pattern: reads a Parquet file from S3, supports date-range filtering, and feeds the existing DashboardView (charts, AI insights, data table, exports).

## S3 Source

```
Bucket: data-lake-libgot-externos
Key:    platinum_ia/servicios_multipais/servicios_platinum.parquet
```

## Date Fields

The parquet contains three date columns:
- `fecha_originacion` — when the service was originated (default filter axis)
- `fecha_vencimiento` — due/expiry date
- `fecha_pago` — payment date (null if unpaid)

The backend filters by `fecha_originacion` first, then falls back to `fecha || date || Date`. All three columns are available as dynamic filters in the dashboard.

## Changes (4 files, no new files)

### 1. `server.ts`
- Add `'Servicios': 'services'` to `MODULE_MAPPING`
- Add `let servicesS3Cache` + `SERVICES_CACHE_TTL_MS = 60 * 60 * 1000` (1 hour, same as sales)
- Add `GET /api/services-s3` endpoint — clone of `/api/sales-s3` with:
  - S3 key pointing to `servicios_platinum.parquet`
  - Date filter column: `fecha_originacion || fecha || date || Date`
  - Log prefix: `[Services-S3]`

### 2. `src/services/api.ts`
- Add `fetchServicesData(fecha_desde, fecha_hasta)` — clone of `fetchSalesData` calling `/api/services-s3`
- Client-side sort: `fecha_originacion || fecha || 0`

### 3. `src/App.tsx`
- Add `case 'services': title = 'Módulo de Servicios'; break;` to the switch in `handleSelectModule`
- Add `if (id === 'services')` branch in `handleFetchData` calling `fetchServicesData`

### 4. `src/components/LandingPage.tsx`
- Add to `modules` array:
  ```ts
  {
    id: 'services',
    title: 'Servicios',
    description: 'Gestión y seguimiento de servicios, vencimientos y cobros multipais.',
    icon: Wrench,       // already imported
    color: 'bg-teal-700',
    type: 'api'
  }
  ```

## Out of Scope

- No changes to `DashboardView` — handles any `api` module generically
- No new files
- Submodules: none for now (can be added later)
- Custom visualizations specific to servicios: deferred

## Permissions

The Google Sheet permissions tab must have a row with module name `"Servicios"` to grant access to users. The `MODULE_MAPPING` entry maps it to the `services` id.
