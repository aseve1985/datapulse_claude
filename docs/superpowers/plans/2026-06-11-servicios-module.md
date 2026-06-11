# Servicios Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Servicios" top-level module that reads `servicios_platinum.parquet` from S3 and exposes it through the existing DashboardView with date filtering defaulting to `fecha_originacion`.

**Architecture:** Clone the Ventas S3 pattern across 4 files — a new backend endpoint in `server.ts`, a new API service function in `src/services/api.ts`, and wiring in `App.tsx` and `LandingPage.tsx`. No new files, no changes to DashboardView.

**Tech Stack:** Express (backend endpoint), AWS SDK v3 S3 + hyparquet (parquet reading), React/TypeScript (frontend wiring), Lucide icons.

> **Note:** This project has no automated test suite. Each task includes a manual verification step instead.

---

### Task 1: Add backend endpoint `/api/services-s3` in `server.ts`

**Files:**
- Modify: `server.ts` (two locations — MODULE_MAPPING ~line 123, and after the sales-s3 endpoint ~line 867)

- [ ] **Step 1: Add `'Servicios'` to MODULE_MAPPING**

In `server.ts`, locate the `MODULE_MAPPING` object (around line 123) and add the new entry:

```typescript
const MODULE_MAPPING: Record<string, string> = {
  'Ventas': 'sales',
  'Cobranzas': 'collections',
  'Riesgos': 'risks',
  'Marketing': 'marketing',
  'Finanzas': 'finance',
  'Callcenter': 'callcenter',
  'Legales': 'legal',
  'Directorio': 'board',
  'Producto': 'product',
  'Administración': 'administration',
  'Servicios': 'services'          // ← add this line
};
```

- [ ] **Step 2: Add cache variables and endpoint after the sales-s3 block**

Locate the closing `});` of the `/api/sales-s3` endpoint (around line 867, just before the `// ── Token Tracking` comment) and insert the following block immediately after it:

```typescript
  // ── Services S3 Parquet Endpoint ──────────────────────────────────────────
  let servicesS3Cache: { data: any[]; fetchedAt: number } | null = null;
  const SERVICES_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

  app.get("/api/services-s3", async (req, res) => {
    const { fecha_desde, fecha_hasta } = req.query;

    try {
      const now = Date.now();
      if (!servicesS3Cache || now - servicesS3Cache.fetchedAt > SERVICES_CACHE_TTL_MS) {
        console.log("[Services-S3] Downloading servicios_platinum.parquet...");
        const s3 = new S3Client({ region: process.env.AWS_REGION || "us-east-1" });
        const cmd = new GetObjectCommand({
          Bucket: "data-lake-libgot-externos",
          Key: "platinum_ia/servicios_multipais/servicios_platinum.parquet",
        });
        const response = await s3.send(cmd);
        const bytes = await (response.Body as any).transformToByteArray() as Uint8Array;

        const asyncBuffer = {
          byteLength: bytes.byteLength,
          slice: async (start: number, end?: number): Promise<ArrayBuffer> =>
            bytes.buffer.slice(bytes.byteOffset + start, bytes.byteOffset + (end ?? bytes.byteLength)) as ArrayBuffer,
        };

        let rows: any[] = [];
        await parquetRead({
          file: asyncBuffer,
          rowFormat: "object",
          onComplete: (data: any[]) => { rows = data; },
        });

        servicesS3Cache = { data: rows, fetchedAt: now };
        console.log(`[Services-S3] Cached ${rows.length} records from parquet`);
      } else {
        console.log("[Services-S3] Serving from cache");
      }

      let data = servicesS3Cache.data;

      if (fecha_desde || fecha_hasta) {
        const from = fecha_desde ? new Date(String(fecha_desde)) : null;
        const to = fecha_hasta ? new Date(String(fecha_hasta) + "T23:59:59") : null;
        data = data.filter((row: any) => {
          const rawDate = row.fecha_originacion || row.fecha || row.date || row.Date;
          if (!rawDate) return true;
          const d = new Date(rawDate);
          if (from && d < from) return false;
          if (to && d > to) return false;
          return true;
        });
      }

      const safe = JSON.parse(JSON.stringify(data, (_k, v) => typeof v === "bigint" ? Number(v) : v));
      res.json({ records: safe, total: safe.length, source: "s3" });
    } catch (error: any) {
      console.error("[Services-S3] Error loading parquet:", error);
      res.status(500).json({ error: "Failed to load services data from S3", details: error.message });
    }
  });
```

- [ ] **Step 3: Verify TypeScript compiles cleanly**

```bash
npm run lint
```

Expected: no errors. If there are errors, fix them before continuing.

- [ ] **Step 4: Commit**

```bash
git add server.ts
git commit -m "feat: add /api/services-s3 endpoint and MODULE_MAPPING entry"
```

---

### Task 2: Add `fetchServicesData` to `src/services/api.ts`

**Files:**
- Modify: `src/services/api.ts`

- [ ] **Step 1: Add the function at the end of the file**

Open `src/services/api.ts` (currently ~40 lines). Append the following after the existing `fetchSalesData` function:

```typescript
export async function fetchServicesData(
  fecha_desde: string,
  fecha_hasta: string,
  onProgress?: (count: number) => void
): Promise<{ records: any[], fullResponse: any }> {
  console.log(`[Services-S3] Fetching services data from ${fecha_desde} to ${fecha_hasta}`);

  const url = new URL('/api/services-s3', window.location.origin);
  url.searchParams.append('fecha_desde', fecha_desde);
  url.searchParams.append('fecha_hasta', fecha_hasta);

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: { 'accept': 'application/json' }
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.details || errorData.error || `HTTP ${response.status}`);
  }

  const data = await response.json();

  const records = (data.records || []).map((r: any) => ({
    id: r.id || r.service_id || r.uuid || Math.random().toString(36).substring(2, 11),
    ...r
  }));

  records.sort((a: any, b: any) => {
    const dateA = new Date(a.fecha_originacion || a.fecha || 0).getTime();
    const dateB = new Date(b.fecha_originacion || b.fecha || 0).getTime();
    return dateA - dateB;
  });

  if (onProgress) onProgress(records.length);

  return { records, fullResponse: data };
}
```

- [ ] **Step 2: Verify TypeScript compiles cleanly**

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/services/api.ts
git commit -m "feat: add fetchServicesData service function"
```

---

### Task 3: Wire the module in `src/App.tsx`

**Files:**
- Modify: `src/App.tsx` (two locations)

- [ ] **Step 1: Import `fetchServicesData`**

At the top of `src/App.tsx`, update the import from `./services/api`:

```typescript
import { fetchSalesData, fetchServicesData } from './services/api';
```

- [ ] **Step 2: Add the `services` case to the title switch**

Locate the `switch (id)` block inside `handleSelectModule` (around line 424) and add the new case:

```typescript
switch (id) {
  case 'sales': title = 'Módulo de Ventas'; break;
  case 'collections': title = 'Módulo de Cobranzas'; break;
  case 'risks': title = 'Módulo de Riesgos'; break;
  case 'marketing': title = 'Módulo de Marketing'; break;
  case 'finance': title = 'Módulo de Finanzas'; break;
  case 'callcenter': title = 'Módulo de Callcenter'; break;
  case 'legal': title = 'Módulo de Legales'; break;
  case 'board': title = 'Módulo de Directorio'; break;
  case 'product': title = 'Módulo de Producto'; break;
  case 'administration': title = 'Módulo de Administración'; break;
  case 'services': title = 'Módulo de Servicios'; break;   // ← add this line
}
```

- [ ] **Step 3: Add the `services` branch in `handleFetchData`**

Locate `handleFetchData` (around line 440). Update the data-fetching logic:

```typescript
const handleFetchData = async (id: string, fecha_desde: string, fecha_hasta: string) => {
  setLoading(true);
  try {
    let data: any[] = [];
    if (id === 'sales') {
      const salesResponse = await fetchSalesData(fecha_desde, fecha_hasta);
      data = salesResponse.records;
    } else if (id === 'services') {
      const servicesResponse = await fetchServicesData(fecha_desde, fecha_hasta);
      data = servicesResponse.records;
    }
    // Add other modules here as they become available
    setModuleData(data);
  } catch (err) {
    console.error('Error fetching module data:', err);
    throw err;
  } finally {
    setLoading(false);
  }
};
```

- [ ] **Step 4: Verify TypeScript compiles cleanly**

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx
git commit -m "feat: wire services module in App.tsx"
```

---

### Task 4: Add the module card to `src/components/LandingPage.tsx`

**Files:**
- Modify: `src/components/LandingPage.tsx` (the `modules` array, ~line 63)

- [ ] **Step 1: Add the `services` entry to the `modules` array**

Locate the `modules` array (around line 63). Add the new entry after the `sales` entry (first position) so that Servicios appears near Ventas in the grid:

```typescript
const modules = [
  {
    id: 'sales',
    title: 'Ventas',
    description: 'Análisis detallado de ingresos, productos top y tendencias comerciales.',
    icon: TrendingUp,
    color: 'bg-blue-600',
    type: 'api'
  },
  {
    id: 'services',
    title: 'Servicios',
    description: 'Gestión y seguimiento de servicios, vencimientos y cobros multipais.',
    icon: Wrench,
    color: 'bg-teal-700',
    type: 'api'
  },
  // ... rest of modules unchanged
```

> `Wrench` is already imported in the file (line 34). No new import needed.

- [ ] **Step 2: Verify TypeScript compiles cleanly**

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/LandingPage.tsx
git commit -m "feat: add Servicios module card to LandingPage"
```

---

### Task 5: End-to-end manual verification

- [ ] **Step 1: Start the dev server**

```bash
npm run dev
```

Expected: server starts on `http://localhost:3000` with no TypeScript errors in the console.

- [ ] **Step 2: Verify the module card appears**

Open the app in the browser. Confirm the **Servicios** card appears in the module grid with a teal icon and correct description.

- [ ] **Step 3: Verify data loads**

Click the Servicios card → enter a date range → click "Buscar". Confirm:
- The loading spinner appears
- Records load and appear in the data table
- The server console shows `[Services-S3] Downloading servicios_platinum.parquet...` on first load and `[Services-S3] Serving from cache` on subsequent loads within 1 hour

- [ ] **Step 4: Verify date filtering works**

Try a narrow date range (e.g., a single month). Confirm the record count changes to reflect only rows where `fecha_originacion` falls within the range.

- [ ] **Step 5: Verify AI insights work**

Click "Generar Insights". Confirm the AI panel returns a summary without errors. (The `moduleId` is passed as `'services'` to the insights endpoint.)

- [ ] **Step 6: Verify permissions gate works**

Log in as a user who does NOT have "Servicios" in their permissions sheet row. Confirm the module card shows the lock/denied modal instead of loading data.

- [ ] **Step 7: Commit verification note** *(skip if no changes needed)*

If any bug was found and fixed during verification, commit the fix with a descriptive message before closing out.
