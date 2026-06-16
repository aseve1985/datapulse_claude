# Marketing Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable the Marketing module as a full dashboard (same pattern as Ventas/Cobranzas), sourcing data from `s3://data-lake-libgot-externos/platinum_ia/marketing_multipais/marketing_platinum.parquet`, with default filters and correct country detection for ARG/COL short codes.

**Architecture:** Follow the exact pattern of the Collections module. Server adds a cached `/api/marketing-s3` endpoint filtering by `fecha_lead`. Frontend adds `fetchMarketingData` in `api.ts`, wires it in `App.tsx`, and sets module-specific default filter slots in `DashboardView.tsx`. Country detection in `gemini.ts` is updated to handle both short codes (`ARG`/`COL`) and long names (`ARGENTINA`/`COLOMBIA`).

**Tech Stack:** Express, TypeScript, AWS S3, `hyparquet` (parquetRead), React, Tailwind CSS

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `server.ts` | Modify | Add `/api/marketing-s3` endpoint with 1h cache, filter by `fecha_lead` |
| `src/services/api.ts` | Modify | Add `fetchMarketingData` function |
| `src/App.tsx` | Modify | Add `marketing` case to `handleFetchData`, import `fetchMarketingData` |
| `src/services/gemini.ts` | Modify | Fix currency detection to handle `'ARG'`/`'COL'` short codes |
| `src/components/DashboardView.tsx` | Modify | Set marketing-specific default filter slots |

---

### Task 1: Add `/api/marketing-s3` endpoint in server.ts

**Files:**
- Modify: `server.ts`

Context: The endpoint follows the exact same pattern as `/api/collections-s3` (around line 932). Add the new endpoint immediately after the collections endpoint block ends (around line 990). The primary date field for marketing is `fecha_lead`.

- [ ] **Step 1: Add cache variables**

Find the line `let collectionsS3Cache` (around line 932) and add these two lines immediately after the collections endpoint closing brace (after line ~990):

```ts
  let marketingS3Cache: { data: any[]; fetchedAt: number } | null = null;
  const MARKETING_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
```

- [ ] **Step 2: Add the endpoint**

Immediately after the two cache variable lines, add:

```ts
  app.get("/api/marketing-s3", async (req, res) => {
    const { fecha_desde, fecha_hasta } = req.query;

    try {
      const now = Date.now();
      if (!marketingS3Cache || now - marketingS3Cache.fetchedAt > MARKETING_CACHE_TTL_MS) {
        console.log("[Marketing-S3] Downloading marketing_platinum.parquet...");
        const s3 = new S3Client({ region: process.env.AWS_REGION || "us-east-1" });
        const cmd = new GetObjectCommand({
          Bucket: "data-lake-libgot-externos",
          Key: "platinum_ia/marketing_multipais/marketing_platinum.parquet",
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

        marketingS3Cache = { data: rows, fetchedAt: now };
        console.log(`[Marketing-S3] Cached ${rows.length} records from parquet`);
      } else {
        console.log("[Marketing-S3] Serving from cache");
      }

      let data = marketingS3Cache.data;

      if (fecha_desde || fecha_hasta) {
        const from = fecha_desde ? new Date(String(fecha_desde)) : null;
        const to = fecha_hasta ? new Date(String(fecha_hasta) + "T23:59:59") : null;
        data = data.filter((row: any) => {
          const rawDate = row.fecha_lead;
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
      console.error("[Marketing-S3] Error loading parquet:", error);
      res.status(500).json({ error: "Failed to load marketing data from S3", details: error.message });
    }
  });
```

- [ ] **Step 3: Verify lint**

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add server.ts
git commit -m "feat: add /api/marketing-s3 endpoint with fecha_lead date filter"
```

---

### Task 2: Add fetchMarketingData in src/services/api.ts

**Files:**
- Modify: `src/services/api.ts`

Context: `api.ts` exports fetch functions for each module. The last function is `fetchCollectionsData` ending around line 118. Add `fetchMarketingData` at the end of the file. The sort key for marketing records is `fecha_lead`.

- [ ] **Step 1: Add the function**

Append at the end of `src/services/api.ts`:

```ts
export async function fetchMarketingData(
  fecha_desde: string,
  fecha_hasta: string,
  onProgress?: (count: number) => void
): Promise<{ records: any[], fullResponse: any }> {
  console.log(`[Marketing-S3] Fetching marketing data from ${fecha_desde} to ${fecha_hasta}`);

  const url = new URL('/api/marketing-s3', window.location.origin);
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
    id: r.lead_id || r.id || Math.random().toString(36).substring(2, 11),
    ...r
  }));

  records.sort((a: any, b: any) => {
    const dateA = new Date(a.fecha_lead || 0).getTime();
    const dateB = new Date(b.fecha_lead || 0).getTime();
    return dateA - dateB;
  });

  if (onProgress) onProgress(records.length);

  return { records, fullResponse: data };
}
```

- [ ] **Step 2: Verify lint**

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/services/api.ts
git commit -m "feat: add fetchMarketingData to api.ts"
```

---

### Task 3: Wire marketing in App.tsx handleFetchData

**Files:**
- Modify: `src/App.tsx` (line 17 for import, lines 451-454 for handleFetchData)

- [ ] **Step 1: Update the import on line 17**

Find:
```ts
import { fetchSalesData, fetchServicesData, fetchCollectionsData } from './services/api';
```

Replace with:
```ts
import { fetchSalesData, fetchServicesData, fetchCollectionsData, fetchMarketingData } from './services/api';
```

- [ ] **Step 2: Add marketing case in handleFetchData**

Find the block in `handleFetchData` (around line 451):
```ts
      } else if (id === 'collections') {
        const collectionsResponse = await fetchCollectionsData(fecha_desde, fecha_hasta);
        data = collectionsResponse.records;
      }
      // Add other modules here as they become available
```

Replace with:
```ts
      } else if (id === 'collections') {
        const collectionsResponse = await fetchCollectionsData(fecha_desde, fecha_hasta);
        data = collectionsResponse.records;
      } else if (id === 'marketing') {
        const marketingResponse = await fetchMarketingData(fecha_desde, fecha_hasta);
        data = marketingResponse.records;
      }
      // Add other modules here as they become available
```

- [ ] **Step 3: Verify lint**

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx
git commit -m "feat: wire marketing module to fetchMarketingData in App.tsx"
```

---

### Task 4: Fix country detection for ARG/COL short codes in gemini.ts

**Files:**
- Modify: `src/services/gemini.ts` (line 205)

Context: The marketing parquet stores `pais` as `'ARG'` and `'COL'` (short codes), while other modules use `'ARGENTINA'`/`'COLOMBIA'`. The current currency detection uses `.includes('ARGENTIN')` which fails for short codes. Fix it to handle both formats.

- [ ] **Step 1: Update currency detection on line 205**

Find:
```ts
    const currency = country.includes('ARGENTIN') ? 'ARS' : (country.includes('COLOMB') ? 'COP' : 'USD');
```

Replace with:
```ts
    const currency = (country.includes('ARGENTIN') || country === 'ARG') ? 'ARS'
      : (country.includes('COLOMB') || country === 'COL') ? 'COP'
      : 'USD';
```

- [ ] **Step 2: Verify lint**

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/services/gemini.ts
git commit -m "fix: handle ARG/COL short country codes in gemini currency detection"
```

---

### Task 5: Set marketing default filter slots in DashboardView.tsx

**Files:**
- Modify: `src/components/DashboardView.tsx` (lines 851-869)

Context: The `useEffect` on `availableFields` initializes filter slots when they're empty. Currently it always defaults slot 0 to `pais` and leaves the rest empty. For marketing, we want 4 pre-set filters: `pais`, `tipo_cliente`, `vendedor`, `agrupacion_source_ultimo`. The component receives `moduleId` as a prop (passed from App.tsx as `activeModule?.id`).

- [ ] **Step 1: Add module-specific filter defaults**

Find the two blocks that initialize filter slots (both look the same, one inside `if (!restoredFromReport.current)` and one in `else`). They currently look like:

```ts
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

This block appears **twice** (lines ~852-859 and ~863-870). Replace **both** occurrences with:

```ts
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
```

- [ ] **Step 2: Verify lint**

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/DashboardView.tsx
git commit -m "feat: set marketing-specific default filter slots (pais, tipo_cliente, vendedor, source)"
```

---

## Self-Review

**Spec coverage:**
- ✅ `/api/marketing-s3` endpoint with S3 path `platinum_ia/marketing_multipais/marketing_platinum.parquet`
- ✅ Date filter uses `fecha_lead`
- ✅ 1-hour server-side cache
- ✅ `fetchMarketingData` added to `api.ts`
- ✅ `marketing` case wired in `App.tsx` `handleFetchData`
- ✅ Country detection handles `'ARG'`/`'COL'` short codes
- ✅ Default filters: pais, tipo_cliente, vendedor, agrupacion_source_ultimo
- ✅ Dashboard is generic (same as Ventas/Cobranzas) — stat cards configurable by user

**Placeholder scan:** No TBDs or TODOs.

**Type consistency:** `fetchMarketingData` returns `{ records: any[], fullResponse: any }` — matches the pattern of `fetchCollectionsData` and is consumed identically in `handleFetchData`.
