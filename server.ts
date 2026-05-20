import express from "express";
import { createServer as createViteServer } from "vite";
import Papa from "papaparse";
import path from "path";
import { GoogleAuth } from "google-auth-library";
import { google } from "googleapis";
import dotenv from "dotenv";
import { S3Client, GetObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { Pool } from "pg";
import { parquetRead } from "hyparquet";

dotenv.config();

// Helper to get Google Auth client if credentials are provided
async function getGoogleAuthClient() {
  const key = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!key) return null;

  try {
    const credentials = JSON.parse(key);
    const auth = new GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    return auth;
  } catch (err) {
    console.error("[Sheets] Error parsing GOOGLE_SERVICE_ACCOUNT_KEY:", err);
    return null;
  }
}

// Detect which row is the actual table header by finding the first "dense" row
function detectTableStart(rows: any[][]): number {
  const limit = Math.min(rows.length, 40);
  const counts = rows.slice(0, limit).map(r =>
    r.filter(c => c !== null && c !== undefined && String(c).trim() !== '').length
  );
  const max = Math.max(...counts, 0);
  if (max < 2) return 0;
  const threshold = Math.max(2, Math.floor(max * 0.6));
  const idx = counts.findIndex(c => c >= threshold);
  return idx < 0 ? 0 : idx;
}

// Helper to fetch Google Sheet CSV (handles both public and private)
async function fetchGoogleSheetCsv(spreadsheetId: string, gid?: string, sheetName?: string) {
  const auth = await getGoogleAuthClient();

  if (auth) {
    console.log(`[Sheets] Using Service Account for spreadsheet: ${spreadsheetId}`);
    try {
      const sheets = google.sheets({ version: 'v4', auth: auth as any });
      let range = 'A1:ZZ10000';

      if (sheetName) {
        range = `'${sheetName}'!A1:ZZ10000`;
      } else if (gid) {
        const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId });
        const sheet = spreadsheet.data.sheets?.find(s => s.properties?.sheetId?.toString() === gid);
        if (sheet?.properties?.title) {
          range = `'${sheet.properties.title}'!A1:ZZ10000`;
        } else {
          console.warn(`[Sheets] GID ${gid} not found, falling back to first sheet`);
        }
      }

      const response = await sheets.spreadsheets.values.get({ spreadsheetId, range });
      const values = response.data.values;
      if (!values || values.length === 0) return "";

      const headerRow = detectTableStart(values);
      console.log(`[Sheets] Smart detection: header starts at row ${headerRow}`);
      return Papa.unparse(values.slice(headerRow));
    } catch (err: any) {
      console.error(`[Sheets] API Error: ${err.message}`);
      throw err;
    }
  }

  // Fallback for public sheets (no Service Account configured)
  console.log(`[Sheets] Using public fetch for spreadsheet: ${spreadsheetId}`);
  let exportUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv`;
  if (gid) exportUrl += `&gid=${gid}`;

  const headers: Record<string, string> = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  };
  const response = await fetch(exportUrl, { headers });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Google Sheets returned ${response.status}: ${errorText.substring(0, 100)}`);
  }
  const csvText = await response.text();

  // Apply smart detection to public CSV too
  const parsed = Papa.parse(csvText, { header: false });
  const rows = parsed.data as any[][];
  if (rows.length === 0) return csvText;
  const headerRow = detectTableStart(rows);
  return headerRow > 0 ? Papa.unparse(rows.slice(headerRow)) : csvText;
}

// Helper to find a value in a row regardless of BOM or minor header variations
function getVal(row: any, ...possibleKeys: string[]) {
  if (!row) return "";
  for (const key of possibleKeys) {
    // Check exact match
    if (row[key] !== undefined) return row[key];
    // Check with BOM
    if (row['\ufeff' + key] !== undefined) return row['\ufeff' + key];
    // Case insensitive check
    const foundKey = Object.keys(row).find(k => k.toLowerCase().trim() === key.toLowerCase());
    if (foundKey) return row[foundKey];
  }
  return "";
}

const app = express();
app.use(express.json({ limit: '50mb' }));
const PORT = parseInt(process.env.PORT || '3000', 10);

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
  'Administración': 'administration'
};

// Simple in-memory cache for permissions
let permissionsCache: { data: any[], timestamp: number } | null = null;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// Exchange Rates Cache
let exchangeRatesCache = {
  ARS: 1385,
  COP: 3655,
  LAST_UPDATE: '10 de Abril, 2026',
  timestamp: 0
};

async function updateExchangeRates() {
  console.log("[ExchangeRates] Updating rates from Investing.com...");
  try {
    const urls = {
      ARS: 'https://es.investing.com/currencies/usd-ars',
      COP: 'https://es.investing.com/currencies/usd-cop'
    };

    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    };

    const fetchRate = async (currency: 'ARS' | 'COP') => {
      // Primary sources (APIs)
      if (currency === 'ARS') {
        try {
          console.log(`[ExchangeRates] Fetching ARS from Bluelytics API...`);
          const res = await fetch('https://api.bluelytics.com.ar/v2/latest');
          if (res.ok) {
            const data = await res.json();
            if (data.blue && data.blue.value_sell) {
              console.log(`[ExchangeRates] Successfully fetched ARS from Bluelytics: ${data.blue.value_sell}`);
              return data.blue.value_sell;
            }
          }
        } catch (e) {
          console.warn(`[ExchangeRates] Bluelytics API failed, trying fallback...`);
        }
      } else if (currency === 'COP') {
        try {
          console.log(`[ExchangeRates] Fetching COP from ExchangeRate-API...`);
          const res = await fetch('https://api.exchangerate-api.com/v4/latest/USD');
          if (res.ok) {
            const data = await res.json();
            if (data.rates && data.rates.COP) {
              console.log(`[ExchangeRates] Successfully fetched COP from ExchangeRate-API: ${data.rates.COP}`);
              return data.rates.COP;
            }
          }
        } catch (e) {
          console.warn(`[ExchangeRates] ExchangeRate-API failed, trying fallback...`);
        }
      }

      // Fallback: Investing.com (Scraping)
      const urls = currency === 'ARS' 
        ? ['https://es.investing.com/currencies/usd-ars', 'https://www.investing.com/currencies/usd-ars']
        : ['https://es.investing.com/currencies/usd-cop', 'https://www.investing.com/currencies/usd-cop'];

      for (const url of urls) {
        try {
          console.log(`[ExchangeRates] Fetching ${currency} from ${url} (Fallback)...`);
          const response = await fetch(url, { headers });
          console.log(`[ExchangeRates] Status for ${url}: ${response.status}`);
          
          if (response.status !== 200) {
            console.warn(`[ExchangeRates] Failed to fetch ${url}: Status ${response.status}`);
            continue;
          }

          const text = await response.text();
          if (!text || text.length < 100) {
            console.warn(`[ExchangeRates] Empty or too short response from ${url}`);
            continue;
          }
          
          // Try multiple regex patterns
          const patterns = [
            /hoy:?\s*([0-9]{1,3}(?:\.[0-9]{3})*(?:,[0-9]+)?)/i, // Spanish: "hoy: 1.374,47"
            /last_last">([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]+)?)</i, // English: "1,374.47"
            /instrument-price-last"[^>]*>([0-9.,]+)</i, // Generic data-test
            /price-section__current-value">([0-9.,]+)</i, // Another common pattern
            /data-test="instrument-price-last"[^>]*>([0-9.,]+)</i, // Explicit data-test
            /USD\s*(?:ARS|COP)\s*hoy:?\s*([0-9.,]+)/i, // Matches OG description
            /content="[^"]*hoy:?\s*([0-9]{1,3}(?:\.[0-9]{3})*(?:,[0-9]+)?)/i // Meta content
          ];

          for (const pattern of patterns) {
            const match = text.match(pattern);
            if (match && match[1]) {
              let val = match[1];
              console.log(`[ExchangeRates] Found raw value for ${currency}: "${val}"`);

              // Detect if it's using comma or dot as decimal
              if (val.includes(',') && val.includes('.')) {
                if (val.indexOf(',') > val.indexOf('.')) {
                  // Spanish style: 1.374,47
                  val = val.replace(/\./g, '').replace(',', '.');
                } else {
                  // English style: 1,374.47
                  val = val.replace(/,/g, '');
                }
              } else if (val.includes(',')) {
                // Only comma: could be 1,374 (English thousands) or 1,37 (Spanish decimal)
                const parts = val.split(',');
                if (parts[1].length === 3) {
                  val = val.replace(/,/g, '');
                } else {
                  val = val.replace(',', '.');
                }
              } else if (val.includes('.')) {
                // Only dot: could be 1.374 (Spanish thousands) or 1.374 (English decimal)
                const parts = val.split('.');
                if (parts[1].length === 3) {
                  // Likely thousands: 1.374
                  val = val.replace(/\./g, '');
                }
              }
              
              const parsed = parseFloat(val);
              if (!isNaN(parsed) && parsed > 0) {
                console.log(`[ExchangeRates] Successfully parsed ${currency} from ${url}: ${parsed}`);
                return parsed;
              }
            }
          }
        } catch (e) {
          console.error(`[ExchangeRates] Error fetching ${url}:`, e);
        }
      }
      return null;
    };

    const arsRate = await fetchRate('ARS');
    const copRate = await fetchRate('COP');

    if (arsRate || copRate) {
      const now = new Date();
      const formattedDate = now.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
      
      exchangeRatesCache = {
        ARS: arsRate || exchangeRatesCache.ARS,
        COP: copRate || exchangeRatesCache.COP,
        LAST_UPDATE: formattedDate,
        timestamp: Date.now()
      };
      console.log(`[ExchangeRates] Updated: ARS=${exchangeRatesCache.ARS}, COP=${exchangeRatesCache.COP}`);
    }
  } catch (err) {
    console.error("[ExchangeRates] Error updating rates:", err);
  }
}

// Initial update will be called when server starts listening
// updateExchangeRates();

async function fetchPermissionsFromSheet() {
  const now = Date.now();
  if (permissionsCache && (now - permissionsCache.timestamp < CACHE_DURATION)) {
    console.log("[Auth] Using cached permissions data");
    return permissionsCache.data;
  }

  const SPREADSHEET_ID = process.env.PERMISSIONS_SPREADSHEET_ID || '1zZEec45p5_zZ6xFeEYsSspLnld-KyzpnAhpeHHDVi5s';
  console.log(`[Auth] Fetching fresh permissions from spreadsheet ID: ${SPREADSHEET_ID}`);
  
  try {
    const csvText = await fetchGoogleSheetCsv(SPREADSHEET_ID);
    const parsed = Papa.parse(csvText, { header: true, skipEmptyLines: true });
    const rows = parsed.data as any[];
    
    console.log(`[Auth] Successfully fetched and parsed ${rows.length} rows`);
    permissionsCache = { data: rows, timestamp: now };
    return rows;
  } catch (err: any) {
    console.error(`[Auth] Error fetching permissions sheet: ${err.message}`);
    // If we have old cache, use it as fallback even if expired
    if (permissionsCache) {
      console.warn("[Auth] Fetch failed, using expired cache as fallback");
      return permissionsCache.data;
    }
    throw err;
  }
}

async function startServer() {
  // Explicitly handle IAP internal routes to avoid SPA fallback or default HTML 404
  // These should normally be intercepted by the IAP proxy
  app.all("/_gcp_iap/*", (req, res) => {
    console.log(`[Server] IAP internal route reached app: ${req.path}`);
    
    // If it's the logout path, we want to clear the session and redirect to root
    if (req.path === "/_gcp_iap/clear_login_cookie") {
      res.clearCookie('GCP_IAAP_AUTH_TOKEN');
      return res.redirect('/');
    }
    
    res.status(404).type('text/plain').send("IAP internal route - Not handled by app");
  });

  // Route to be opened in a popup to trigger IAP login
  app.get("/auth/login", (req, res) => {
    const proto = req.headers['x-forwarded-proto'] || req.protocol;
    const origin = req.headers.origin || `${proto}://${req.headers.host}`;
    res.send(`
      <html>
        <head><title>Autenticando...</title></head>
        <body>
          <script>
            if (window.opener) {
              window.opener.postMessage({ type: 'IAP_AUTH_SUCCESS' }, ${JSON.stringify(origin)});
              window.close();
            } else {
              window.location.href = '/';
            }
          </script>
          <p style="font-family: sans-serif; text-align: center; margin-top: 50px;">
            Autenticación completada. Esta ventana se cerrará automáticamente.
          </p>
        </body>
      </html>
    `);
  });

  // User Info and Permissions Route
  app.get(["/api/auth/status", "/api/auth/status/"], async (req, res) => {
    // Prevent any caching
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    // test_email bypass: solo permitido fuera de producción
    let testEmail: string | null = null;
    if (process.env.NODE_ENV !== 'production') {
      testEmail = (req.query.test_email as string) || null;
      if (!testEmail && req.originalUrl) {
        try {
          const url = new URL(req.originalUrl, `http://${req.headers.host || 'localhost'}`);
          testEmail = url.searchParams.get('test_email');
        } catch (e) {}
      }
    }

    // Get email from IAP header (Primary source in production)
    let email = (req.headers['x-goog-authenticated-user-email'] ||
                 req.headers['x-forwarded-email'] ||
                 req.headers['x-auth-request-email']) as string;

    // Clean up IAP email prefix if present
    if (email && email.includes(':')) {
      email = email.split(':')[1];
    }

    // OVERRIDE with testEmail if present (solo en desarrollo)
    let source = "IAP Header";
    if (testEmail) {
      console.log(`[Auth] OVERRIDING identity with test_email: ${testEmail}`);
      email = testEmail;
      source = "Test Parameter";
    }

    // In dev mode, fall back to DEV_DEFAULT_EMAIL if no identity found
    if (!email && process.env.NODE_ENV !== 'production' && process.env.DEV_DEFAULT_EMAIL) {
      email = process.env.DEV_DEFAULT_EMAIL;
      source = "Dev Default";
      console.log(`[Auth] No IAP header found. Using DEV_DEFAULT_EMAIL: ${email}`);
    }

    // If NO email is found, we are in GUEST MODE.
    if (!email) {
      console.log(`[Auth] No identity found. Returning Guest status.`);
      return res.json({
        email: "Invitado",
        isGuest: true,
        hasAllAccess: false,
        allowedModules: [],
        rawPermissions: []
      });
    }

    console.log(`[Auth] Validating identity: ${email} (Source: ${source})`);

    try {
      const rows = await fetchPermissionsFromSheet();
      
      // Match column names: 'usuario' and 'area'
      const userRows = rows.filter(row => {
        const rowEmail = getVal(row, 'usuario', 'email', 'user').toString().toLowerCase().trim();
        const targetEmail = email.toLowerCase().trim();
        return rowEmail === targetEmail;
      });
      
      console.log(`[Auth] Found ${userRows.length} matching rows for ${email}`);
      
      let allowedModules: string[] = [];
      let hasAllAccess = false;
      let displayName = '';

      userRows.forEach(row => {
        const areaValue = getVal(row, 'area', 'modulo', 'permiso').toString().trim();
        if (!displayName) {
          displayName = getVal(row, 'nombre', 'name', 'display_name', 'displayName').toString().trim();
        }
        if (areaValue === "Todas" || areaValue === "Todos") {
          hasAllAccess = true;
        } else if (areaValue) {
          const moduleId = MODULE_MAPPING[areaValue] || areaValue.toLowerCase();
          if (!allowedModules.includes(moduleId)) {
            allowedModules.push(moduleId);
          }
        }
      });

      res.json({
        email,
        source,
        displayName: displayName || null,
        isGuest: false,
        hasAllAccess,
        allowedModules,
        rawPermissions: userRows.map(r => getVal(r, 'area', 'modulo', 'permiso'))
      });
    } catch (error: any) {
      console.error("[Auth] Route Error:", error.message);
      res.json({
        email,
        source,
        isGuest: true,
        hasAllAccess: false,
        allowedModules: [],
        error: `Error de conexión con base de permisos: ${error.message}`
      });
    }
  });

  // ── Reports API ────────────────────────────────────────────────────────────
  const REPORTS_SPREADSHEET_ID = process.env.PERMISSIONS_SPREADSHEET_ID || '1zZEec45p5_zZ6xFeEYsSspLnld-KyzpnAhpeHHDVi5s';
  const REPORTS_SHEET_NAME = 'reportes';

  async function getReportsSheetId(): Promise<number | null> {
    const auth = await getGoogleAuthClient();
    if (!auth) return null;
    const sheets = google.sheets({ version: 'v4', auth: auth as any });
    const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: REPORTS_SPREADSHEET_ID });
    const sheet = spreadsheet.data.sheets?.find(s => s.properties?.title === REPORTS_SHEET_NAME);
    return sheet?.properties?.sheetId ?? null;
  }

  async function ensureReportsSheet() {
    const auth = await getGoogleAuthClient();
    if (!auth) throw new Error('No service account configured');
    const sheets = google.sheets({ version: 'v4', auth: auth as any });
    const sheetId = await getReportsSheetId();
    if (sheetId !== null) return;
    // Create the sheet and header row
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: REPORTS_SPREADSHEET_ID,
      requestBody: { requests: [{ addSheet: { properties: { title: REPORTS_SHEET_NAME } } }] }
    });
    await sheets.spreadsheets.values.update({
      spreadsheetId: REPORTS_SPREADSHEET_ID,
      range: `${REPORTS_SHEET_NAME}!A1:F1`,
      valueInputOption: 'RAW',
      requestBody: { values: [['id', 'usuario', 'nombre', 'modulo', 'filtros', 'fecha']] }
    });
    console.log('[Reports] Sheet "reportes" created with headers');
  }

  // GET /api/reports?email=X
  app.get('/api/reports', async (req, res) => {
    const email = req.query.email as string;
    if (!email) return res.status(400).json({ error: 'Missing email' });
    try {
      await ensureReportsSheet();
      const auth = await getGoogleAuthClient();
      if (!auth) return res.status(500).json({ error: 'No service account configured' });
      const sheets = google.sheets({ version: 'v4', auth: auth as any });
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: REPORTS_SPREADSHEET_ID,
        range: `${REPORTS_SHEET_NAME}!A2:F1000`
      });
      const rows = response.data.values || [];
      const userReports = rows
        .filter(r => r[1]?.toLowerCase() === email.toLowerCase())
        .map(r => ({ id: r[0], usuario: r[1], nombre: r[2], modulo: r[3], filtros: JSON.parse(r[4] || '{}'), fecha: r[5] }));
      res.json(userReports);
    } catch (err: any) {
      console.error('[Reports] GET error:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/reports
  app.post('/api/reports', async (req, res) => {
    const { email, nombre, modulo, filtros } = req.body;
    if (!email || !nombre || !modulo || !filtros) return res.status(400).json({ error: 'Missing fields' });
    try {
      await ensureReportsSheet();
      const auth = await getGoogleAuthClient();
      if (!auth) return res.status(500).json({ error: 'No service account configured' });
      const sheets = google.sheets({ version: 'v4', auth: auth as any });
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const fecha = new Date().toISOString().split('T')[0];
      await sheets.spreadsheets.values.append({
        spreadsheetId: REPORTS_SPREADSHEET_ID,
        range: `${REPORTS_SHEET_NAME}!A:F`,
        valueInputOption: 'RAW',
        requestBody: { values: [[id, email, nombre, modulo, JSON.stringify(filtros), fecha]] }
      });
      console.log(`[Reports] Saved "${nombre}" for ${email}`);
      res.json({ id, nombre, modulo, filtros, fecha });
    } catch (err: any) {
      console.error('[Reports] POST error:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // DELETE /api/reports/:id
  app.delete('/api/reports/:id', async (req, res) => {
    const { id } = req.params;
    const email = req.query.email as string;
    if (!email) return res.status(400).json({ error: 'Missing email' });
    try {
      const auth = await getGoogleAuthClient();
      if (!auth) return res.status(500).json({ error: 'No service account configured' });
      const sheets = google.sheets({ version: 'v4', auth: auth as any });
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: REPORTS_SPREADSHEET_ID,
        range: `${REPORTS_SHEET_NAME}!A2:F1000`
      });
      const rows = response.data.values || [];
      const rowIndex = rows.findIndex(r => r[0] === id && r[1]?.toLowerCase() === email.toLowerCase());
      if (rowIndex === -1) return res.status(404).json({ error: 'Report not found' });
      const sheetId = await getReportsSheetId();
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: REPORTS_SPREADSHEET_ID,
        requestBody: {
          requests: [{
            deleteDimension: {
              range: { sheetId: sheetId!, dimension: 'ROWS', startIndex: rowIndex + 1, endIndex: rowIndex + 2 }
            }
          }]
        }
      });
      console.log(`[Reports] Deleted report ${id} for ${email}`);
      res.json({ success: true });
    } catch (err: any) {
      console.error('[Reports] DELETE error:', err.message);
      res.status(500).json({ error: err.message });
    }
  });
  // ── End Reports API ─────────────────────────────────────────────────────────

  // Google Sheets — list all tabs
  app.get("/api/sheets/list", async (req, res) => {
    const { spreadsheetId } = req.query;
    if (!spreadsheetId) return res.status(400).json({ error: "Missing spreadsheetId" });
    try {
      const auth = await getGoogleAuthClient();
      if (!auth) return res.json({ sheets: [], canList: false, title: '' });
      const sheetsApi = google.sheets({ version: 'v4', auth: auth as any });
      const meta = await sheetsApi.spreadsheets.get({ spreadsheetId: String(spreadsheetId) });
      const sheets = (meta.data.sheets || []).map(s => ({
        title: s.properties?.title || '',
        sheetId: s.properties?.sheetId ?? 0,
        index: s.properties?.index ?? 0,
      }));
      res.json({ sheets, canList: true, title: meta.data.properties?.title || '' });
    } catch (error: any) {
      console.error("[Sheets List] Error:", error.message);
      res.status(500).json({ error: error.message });
    }
  });

  // Google Sheets — fetch data from a specific tab (smart header detection)
  app.get("/api/sheets/fetch", async (req, res) => {
    const { spreadsheetId, gid, sheetName } = req.query;

    if (!spreadsheetId) {
      return res.status(400).json({ error: "Missing spreadsheetId parameter" });
    }

    console.log(`[Sheets Proxy] Requesting: ${spreadsheetId} sheet="${sheetName || ''}" gid="${gid || ''}"`);

    try {
      const csvText = await fetchGoogleSheetCsv(
        String(spreadsheetId),
        gid ? String(gid) : undefined,
        sheetName ? String(sheetName) : undefined
      );
      res.send(csvText);
    } catch (error: any) {
      console.error("[Sheets Proxy] Error:", error.message);
      res.status(500).json({
        error: "Failed to fetch Google Sheet",
        details: error.message,
        hint: "If the sheet is private, ensure you have configured GOOGLE_SERVICE_ACCOUNT_KEY and shared the sheet with the service account email."
      });
    }
  });

  // Exchange Rates API
  app.get("/api/exchange-rates", (req, res) => {
    res.json(exchangeRatesCache);
  });

  // Admin: Manual refresh of exchange rates
  app.post("/api/admin/refresh-rates", async (req, res) => {
    try {
      console.log("[Admin] Manual refresh requested");
      await updateExchangeRates();
      res.json({ 
        message: "Rates refresh triggered", 
        current: exchangeRatesCache,
        success: exchangeRatesCache.timestamp > 0 
      });
    } catch (err: any) {
      console.error("[Admin] Refresh failed:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // API Proxy Route to bypass CORS
  app.get("/api/sales-proxy", async (req, res) => {
    const { fecha_desde, fecha_hasta } = req.query;
    
    if (!fecha_desde || !fecha_hasta) {
      return res.status(400).json({ error: "Missing date parameters" });
    }

    const API_URL = 'https://api-reportes-bi.onrender.com/reportes/ventas';
    const API_KEY = process.env.BI_API_KEY || '';
    
    const url = new URL(API_URL);
    url.searchParams.append('fecha_desde', String(fecha_desde));
    url.searchParams.append('fecha_hasta', String(fecha_hasta));
    
    // Pass through any other query parameters from the client (like page or offset)
    Object.keys(req.query).forEach(key => {
      if (key !== 'fecha_desde' && key !== 'fecha_hasta') {
        url.searchParams.append(key, String(req.query[key]));
      }
    });

    console.log(`[Proxy] Requesting: ${url.toString()}`);

    const fetchWithRetry = async (retries = 3, delay = 1000): Promise<Response> => {
      for (let i = 0; i < retries; i++) {
        try {
          const response = await fetch(url.toString(), {
            method: 'GET',
            headers: {
              'accept': 'application/json',
              'x-api-key': API_KEY,
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Cache-Control': 'no-cache'
            }
          });

          if (response.status >= 500 && i < retries - 1) {
            console.log(`[Proxy] API returned ${response.status}, retrying (${i + 1}/${retries})...`);
            await new Promise(resolve => setTimeout(resolve, delay * (i + 1)));
            continue;
          }
          return response;
        } catch (err) {
          if (i < retries - 1) {
            console.log(`[Proxy] Fetch error, retrying (${i + 1}/${retries})...`, err);
            await new Promise(resolve => setTimeout(resolve, delay * (i + 1)));
            continue;
          }
          throw err;
        }
      }
      throw new Error("Max retries reached");
    };

    try {
      const response = await fetchWithRetry();

      console.log(`[Proxy] API Response Status: ${response.status}`);

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[Proxy] API Error: ${response.status} - ${errorText.substring(0, 200)}...`);
        return res.status(response.status).json({ 
          error: "API Error", 
          status: response.status,
          details: errorText.includes('<!DOCTYPE html>') ? "The external server returned an HTML error page (Cloudflare 520 or similar). This usually means the origin server is down or misconfigured." : errorText 
        });
      }

      const data = await response.json();
      console.log(`[Proxy] API Response Body Sample: ${JSON.stringify(data).substring(0, 500)}`);
      
      let records = [];
      if (Array.isArray(data)) {
        records = data;
      } else if (data && data.data && Array.isArray(data.data)) {
        records = data.data;
      } else if (data && data.ventas && Array.isArray(data.ventas)) {
        records = data.ventas;
      } else if (data && typeof data === 'object') {
        // Try to find any array in the object
        const firstArrayKey = Object.keys(data).find(key => Array.isArray(data[key]));
        if (firstArrayKey) {
          records = data[firstArrayKey];
          console.log(`[Proxy] Found array in key: ${firstArrayKey}`);
        }
      }

      console.log(`[Proxy] Processed ${records.length} records`);
      if (records.length > 0) {
        console.log(`[Proxy] First record: ${JSON.stringify(records[0])}`);
      }

      res.json(data);
    } catch (error: any) {
      console.error("Proxy Error:", error);
      res.status(500).json({ error: "Failed to fetch from external API", details: error.message });
    }
  });

  // ── Feature Requests ────────────────────────────────────────────────────────
  const FEATURE_REQUESTS_SHEET = 'funciones_solicitadas';
  const FEATURE_REQUESTS_SPREADSHEET_ID = process.env.PERMISSIONS_SPREADSHEET_ID || '1zZEec45p5_zZ6xFeEYsSspLnld-KyzpnAhpeHHDVi5s';

  app.post('/api/feature-requests', async (req, res) => {
    const { usuario, modulo, funcionalidad_deseada } = req.body;
    if (!usuario || !modulo || !funcionalidad_deseada) {
      return res.status(400).json({ error: 'Faltan campos requeridos' });
    }
    try {
      const auth = await getGoogleAuthClient();
      if (!auth) throw new Error('Google service account not configured');
      const sheets = google.sheets({ version: 'v4', auth: auth as any });
      const now = new Date();
      const ar = new Date(now.getTime() - 3 * 60 * 60 * 1000);
      const timestamp = ar.toISOString().replace('T', ' ').substring(0, 19);
      await sheets.spreadsheets.values.append({
        spreadsheetId: FEATURE_REQUESTS_SPREADSHEET_ID,
        range: `${FEATURE_REQUESTS_SHEET}!A:D`,
        valueInputOption: 'RAW',
        requestBody: { values: [[timestamp, usuario, modulo, funcionalidad_deseada]] }
      });
      console.log(`[FeatureRequest] New request from ${usuario}: ${modulo}`);
      res.json({ ok: true });
    } catch (err: any) {
      console.error('[FeatureRequest] Error:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ── Sales S3 Parquet Endpoint ────────────────────────────────────────────────
  let salesS3Cache: { data: any[]; fetchedAt: number } | null = null;
  const SALES_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

  app.get("/api/sales-s3", async (req, res) => {
    const { fecha_desde, fecha_hasta } = req.query;

    try {
      const now = Date.now();
      if (!salesS3Cache || now - salesS3Cache.fetchedAt > SALES_CACHE_TTL_MS) {
        console.log("[S3] Downloading ventas_platinum.parquet...");
        const s3 = new S3Client({ region: process.env.AWS_REGION || "us-east-1" });
        const cmd = new GetObjectCommand({
          Bucket: "data-lake-libgot-externos",
          Key: "platinum_ia/ventas_multipais/ventas_platinum.parquet",
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

        salesS3Cache = { data: rows, fetchedAt: now };
        console.log(`[S3] Cached ${rows.length} records from parquet`);
      } else {
        console.log("[S3] Serving sales data from cache");
      }

      let data = salesS3Cache.data;

      if (fecha_desde || fecha_hasta) {
        const from = fecha_desde ? new Date(String(fecha_desde)) : null;
        const to = fecha_hasta ? new Date(String(fecha_hasta) + "T23:59:59") : null;
        data = data.filter((row: any) => {
          const rawDate = row.fecha_desembolso || row.fecha || row.date || row.Date;
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
      console.error("[S3] Error loading parquet:", error);
      res.status(500).json({ error: "Failed to load data from S3", details: error.message });
    }
  });

  // ── Token Tracking ──────────────────────────────────────────────────────────
  const TOKENS_SHEET_NAME = 'tokens';

  async function ensureTokensSheet() {
    const auth = await getGoogleAuthClient();
    if (!auth) return;
    const sheets = google.sheets({ version: 'v4', auth: auth as any });
    const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: REPORTS_SPREADSHEET_ID });
    const exists = spreadsheet.data.sheets?.find(s => s.properties?.title === TOKENS_SHEET_NAME);
    if (exists) return;
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: REPORTS_SPREADSHEET_ID,
      requestBody: { requests: [{ addSheet: { properties: { title: TOKENS_SHEET_NAME } } }] }
    });
    await sheets.spreadsheets.values.update({
      spreadsheetId: REPORTS_SPREADSHEET_ID,
      range: `${TOKENS_SHEET_NAME}!A1:F1`,
      valueInputOption: 'RAW',
      requestBody: { values: [['fecha', 'usuario', 'tipo', 'tokens_entrada', 'tokens_salida', 'tokens_total']] }
    });
    console.log('[Tokens] Sheet "tokens" created');
  }

  async function logTokens(email: string, tipo: string, input: number, output: number, total: number) {
    try {
      const auth = await getGoogleAuthClient();
      if (!auth) return;
      await ensureTokensSheet();
      const sheets = google.sheets({ version: 'v4', auth: auth as any });
      const fecha = new Date().toISOString().replace('T', ' ').substring(0, 19);
      await sheets.spreadsheets.values.append({
        spreadsheetId: REPORTS_SPREADSHEET_ID,
        range: `${TOKENS_SHEET_NAME}!A:F`,
        valueInputOption: 'RAW',
        requestBody: { values: [[fecha, email, tipo, input, output, total]] }
      });
    } catch (e: any) {
      console.warn('[Tokens] Failed to log tokens:', e.message);
    }
  }

  // GET /api/tokens?email=X
  app.get('/api/tokens', async (req, res) => {
    const email = req.query.email as string;
    if (!email) return res.status(400).json({ error: 'Missing email' });
    try {
      await ensureTokensSheet();
      const auth = await getGoogleAuthClient();
      if (!auth) return res.json({ total: 0, sesiones: 0 });
      const sheets = google.sheets({ version: 'v4', auth: auth as any });
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: REPORTS_SPREADSHEET_ID,
        range: `${TOKENS_SHEET_NAME}!A2:F5000`
      });
      const rows = (response.data.values || []).filter(r => r[1]?.toLowerCase() === email.toLowerCase());
      const total = rows.reduce((sum, r) => sum + (parseInt(r[5]) || 0), 0);
      const sesiones = rows.length;
      res.json({ total, sesiones });
    } catch (e: any) {
      console.error('[Tokens] GET error:', e.message);
      res.json({ total: 0, sesiones: 0 });
    }
  });
  // ── End Token Tracking ───────────────────────────────────────────────────────

  // Gemini AI - Insights endpoint (server-side, key never reaches the browser)
  app.post("/api/ai/insights", async (req, res) => {
    const apiKey = process.env.GEMINI_API_KEY || '';
    if (!apiKey) return res.status(500).json({ error: "GEMINI_API_KEY no configurada en el servidor." });

    const { prompt, email } = req.body;
    if (!prompt) return res.status(400).json({ error: "Missing prompt" });

    try {
      const { GoogleGenAI, Type } = await import("@google/genai");
      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              summary: { type: Type.STRING },
              insights: { type: Type.ARRAY, items: { type: Type.STRING } },
              recommendation: { type: Type.STRING },
              calculation_explanation: { type: Type.STRING }
            },
            required: ["summary", "insights", "recommendation", "calculation_explanation"]
          }
        }
      });
      const usage = (response as any).usageMetadata;
      if (email && usage) {
        logTokens(email, 'insights', usage.promptTokenCount || 0, usage.candidatesTokenCount || 0, usage.totalTokenCount || 0);
      }
      const text = (response.text || "{}").replace(/^```json\s*/i,'').replace(/^```\s*/i,'').replace(/```\s*$/i,'').trim();
      res.json(JSON.parse(text));
    } catch (e: any) {
      console.error("[AI Insights] Error:", e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // Gemini AI - Chat endpoint (server-side)
  app.post("/api/ai/chat", async (req, res) => {
    const apiKey = process.env.GEMINI_API_KEY || '';
    if (!apiKey) return res.status(500).json({ error: "GEMINI_API_KEY no configurada en el servidor." });

    const { messages, systemInstruction, email } = req.body;
    if (!messages || !Array.isArray(messages)) return res.status(400).json({ error: "Missing messages" });

    try {
      const { GoogleGenAI } = await import("@google/genai");
      const ai = new GoogleGenAI({ apiKey });
      const chat = ai.chats.create({
        model: "gemini-3-flash-preview",
        config: { systemInstruction },
        history: messages.slice(0, -1).map((m: any) => ({
          role: m.role === 'user' ? 'user' : 'model',
          parts: [{ text: m.content }]
        }))
      });
      const lastMessage = messages[messages.length - 1].content;
      const result = await chat.sendMessage({ message: lastMessage });
      const usage = (result as any).usageMetadata;
      if (email && usage) {
        logTokens(email, 'chat', usage.promptTokenCount || 0, usage.candidatesTokenCount || 0, usage.totalTokenCount || 0);
      }
      res.json({ text: result.text });
    } catch (e: any) {
      console.error("[AI Chat] Error:", e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // Serve tools from tools_libgot (explicit route bypasses Vite's SPA html fallback)
  app.get('/tools/:filename', (req, res) => {
    const filename = path.basename(req.params.filename);
    const filePath = path.resolve(process.cwd(), 'tools_libgot', filename);
    res.sendFile(filePath, (err) => {
      if (err) res.status(404).json({ error: 'Tool not found' });
    });
  });

  // ── UIF Endpoints ──────────────────────────────────────────────────────────────
  let uifS3Cache: { data: any[]; fetchedAt: number } | null = null;
  const UIF_CACHE_TTL_MS = 30 * 60 * 1000; // 30 min

  app.get("/api/uif/records", async (req, res) => {
    try {
      const now = Date.now();
      if (!uifS3Cache || now - uifS3Cache.fetchedAt > UIF_CACHE_TTL_MS) {
        console.log("[UIF] Listing parquet files in S3...");
        const s3 = new S3Client({ region: process.env.AWS_REGION || "us-east-1" });

        const listCmd = new ListObjectsV2Command({
          Bucket: "data-lake-libgot-externos",
          Prefix: "platinum_ia/legales_uif/",
        });
        const listResponse = await s3.send(listCmd);
        const parquetFiles = (listResponse.Contents || []).filter(obj => obj.Key?.endsWith(".parquet"));

        if (parquetFiles.length === 0) {
          return res.status(404).json({ error: "No se encontraron archivos parquet en platinum_ia/legales_uif/" });
        }

        console.log(`[UIF] Found ${parquetFiles.length} parquet file(s), downloading...`);
        let allRows: any[] = [];

        for (const file of parquetFiles) {
          const getCmd = new GetObjectCommand({ Bucket: "data-lake-libgot-externos", Key: file.Key! });
          const response = await s3.send(getCmd);
          const bytes = await (response.Body as any).transformToByteArray() as Uint8Array;
          const asyncBuffer = {
            byteLength: bytes.byteLength,
            slice: async (start: number, end?: number): Promise<ArrayBuffer> =>
              bytes.buffer.slice(bytes.byteOffset + start, bytes.byteOffset + (end ?? bytes.byteLength)) as ArrayBuffer,
          };
          await parquetRead({
            file: asyncBuffer,
            rowFormat: "object",
            onComplete: (data: any[]) => { allRows = [...allRows, ...data]; },
          });
        }

        uifS3Cache = { data: allRows, fetchedAt: now };
        console.log(`[UIF] Cached ${allRows.length} records`);
      } else {
        console.log("[UIF] Serving from cache");
      }

      const safe = JSON.parse(JSON.stringify(uifS3Cache.data, (_k, v) => typeof v === "bigint" ? Number(v) : v));
      res.json({ records: safe, total: safe.length, source: "s3" });
    } catch (error: any) {
      console.error("[UIF] Error loading parquet:", error);
      res.status(500).json({ error: "Error al cargar datos UIF", details: error.message });
    }
  });

  const redshiftPool = (
    process.env.REDSHIFT_HOST &&
    process.env.REDSHIFT_DATABASE &&
    process.env.REDSHIFT_USER &&
    process.env.REDSHIFT_PASSWORD
  ) ? new Pool({
    host: process.env.REDSHIFT_HOST,
    port: Number(process.env.REDSHIFT_PORT || "5439"),
    database: process.env.REDSHIFT_DATABASE,
    user: process.env.REDSHIFT_USER,
    password: process.env.REDSHIFT_PASSWORD,
    ssl: { rejectUnauthorized: false },
    max: 5,
    idleTimeoutMillis: 30000,
  }) : null;

  app.patch("/api/uif/audit", async (req, res) => {
    const { updates } = req.body as {
      updates: Array<{ record: Record<string, any>; auditoria_realizada: string }>
    };

    if (!updates || updates.length === 0) {
      return res.status(400).json({ error: "No se enviaron registros para actualizar" });
    }

    if (!redshiftPool) {
      return res.status(503).json({
        error: "Conexión a Redshift no configurada",
        required_env: ["REDSHIFT_HOST", "REDSHIFT_DATABASE", "REDSHIFT_USER", "REDSHIFT_PASSWORD"],
      });
    }

    const client = await redshiftPool.connect();
    let updatedCount = 0;
    try {
      await client.query("BEGIN");
      for (const { record, auditoria_realizada } of updates) {
        await client.query(
          `UPDATE platinum_ia.monitor_uif_arg
           SET auditoria_realizada = $1
           WHERE fecha_insercion = $2
             AND cuil = $3
             AND dni = $4
             AND loan_id = $5
             AND fecha = $6
             AND aviso_2_1 = $7
             AND aviso_2_2 = $8
             AND aviso_2_3 = $9
             AND aviso_2_4 = $10`,
          [
            auditoria_realizada,
            record.fecha_insercion, record.cuil, record.dni, record.loan_id,
            record.fecha, record.aviso_2_1, record.aviso_2_2, record.aviso_2_3, record.aviso_2_4,
          ]
        );
        updatedCount++;
      }
      await client.query("COMMIT");
      uifS3Cache = null;
      console.log(`[UIF] Audit saved: ${updatedCount} records by ${req.headers["x-goog-authenticated-user-email"] || "unknown"}`);
      res.json({ updated: updatedCount, message: "Auditoría guardada correctamente" });
    } catch (err: any) {
      await client.query("ROLLBACK");
      console.error("[UIF] Redshift update error:", err);
      res.status(500).json({ error: "Error al guardar en Redshift", details: err.message });
    } finally {
      client.release();
    }
  });

  // Catch-all for unhandled API routes
  app.all("/api/*", (req, res) => {
    console.warn(`[Server] Unhandled API route: ${req.method} ${req.path}`);
    res.status(404).json({ error: "API Route not found", path: req.path, method: req.method });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    try {
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: "spa",
      });
      app.use(vite.middlewares);
    } catch (e) {
      console.error("Vite failed to start:", e);
    }
  } else {
    // Serve static files in production
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    
    // SPA Fallback - Exclude API, IAP, and Auth internal routes
    app.get("*", (req, res, next) => {
      // If the request is for API, IAP, or Auth internal paths, let it pass through 
      // (it should be handled by the explicit routes at the top)
      if (req.path.startsWith('/api/') || req.path.startsWith('/_gcp_iap/') || req.path.startsWith('/auth/')) {
        return next();
      }
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Start listening AFTER all routes and middleware are registered
  app.listen(PORT, "0.0.0.0", async () => {
    console.log(`Server running on http://localhost:${PORT}`);
    
    // Initial fetch of exchange rates
    console.log("[Server] Performing initial exchange rates fetch...");
    await updateExchangeRates();
    
    // Set interval to update every 6 hours
    setInterval(updateExchangeRates, 6 * 60 * 60 * 1000);
  });
}

startServer();
