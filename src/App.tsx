import React, { useState, useEffect, useCallback, useRef } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { AlertCircle, X } from 'lucide-react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import * as pdfjs from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';

// Set PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;

import LandingPage from './components/LandingPage';
import DashboardView from './components/DashboardView';
import { LoginView } from './components/LoginView';
import { TermsModal } from './components/TermsModal';
import { FeatureRequestModal } from './components/FeatureRequestModal';
import { fetchSalesData } from './services/api';
import { updateExchangeRates, EXCHANGE_RATES } from './constants';
import type { SavedReport, ReportFilters } from './types';

type View = 'landing' | 'dashboard';

export default function App() {
  const [currentView, setCurrentView] = useState<View>('landing');
  const [activeModule, setActiveModule] = useState<any>(null);
  const [moduleData, setModuleData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [isTermsOpen, setIsTermsOpen] = useState(false);
  const [isFeatureRequestOpen, setIsFeatureRequestOpen] = useState(false);
  const [authStatus, setAuthStatus] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [exchangeRates, setExchangeRates] = useState(EXCHANGE_RATES);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [savedReports, setSavedReports] = useState<SavedReport[]>([]);
  const [tokenUsage, setTokenUsage] = useState<{ total: number; sesiones: number } | null>(null);
  const [initialReport, setInitialReport] = useState<any>(null);
  const [sheetPicker, setSheetPicker] = useState<{
    spreadsheetId: string;
    sheetUrl: string;
    sheets: Array<{ title: string; sheetId: number; index: number }>;
    spreadsheetTitle: string;
  } | null>(null);
  const [sheetPickerLoading, setSheetPickerLoading] = useState(false);
  const isMounted = useRef(true);

  const showError = (msg: string) => {
    setErrorMessage(msg);
    setTimeout(() => setErrorMessage(null), 6000);
  };

  const checkAuth = useCallback(async () => {
    const queryParams = window.location.search;
    const params = new URLSearchParams(queryParams);
    
    // If we are simulating or retrying, clear the manual logout flag
    if (params.has('test_email') || params.has('login_retry')) {
      localStorage.removeItem('iap_logged_out');
    }

    // Check if user manually logged out to show the landing page
    if (localStorage.getItem('iap_logged_out') === 'true') {
      console.log('[App] User is manually logged out. Showing LoginView.');
      setAuthStatus({
        email: '',
        isGuest: true,
        hasAllAccess: false,
        allowedModules: []
      });
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    
    // Use an AbortController to prevent infinite "thinking" state
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout
    
    try {
      const cacheBuster = `t=${Date.now()}`;
      const fetchUrl = `/api/auth/status${queryParams ? queryParams + '&' + cacheBuster : '?' + cacheBuster}`;
      
      console.log(`[App] Checking auth at: ${fetchUrl}`);
      
      const response = await fetch(fetchUrl, {
        signal: controller.signal,
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      });
      
      clearTimeout(timeoutId);
      
      if (isMounted.current) {
        if (response.ok) {
          const data = await response.json();
          console.log('[App] Auth status received:', data.email);
          setAuthStatus(data);
        } else {
          throw new Error(`Servidor respondió con código ${response.status}`);
        }
      }
    } catch (err: any) {
      clearTimeout(timeoutId);
      const isTimeout = err.name === 'AbortError';
      console.error('[App] Auth check error:', isTimeout ? 'Timeout' : err.message);
      
      if (isMounted.current) {
        setAuthStatus({
          email: '',
          isGuest: true,
          hasAllAccess: false,
          allowedModules: [],
          error: isTimeout ? 'La verificación de identidad tardó demasiado. Reintenta.' : `Error de conexión: ${err.message}`
        });
      }
    } finally {
      if (isMounted.current) {
        setIsLoading(false);
      }
    }
  }, []);

  const fetchRates = useCallback(async () => {
    try {
      const response = await fetch(`/api/exchange-rates?t=${Date.now()}`);
      if (response.ok) {
        const rates = await response.json();
        updateExchangeRates(rates);
        setExchangeRates({ ...EXCHANGE_RATES });
        console.log('[App] Exchange rates updated from server');
      }
    } catch (err) {
      console.error('[App] Failed to fetch exchange rates:', err);
    }
  }, []);

  const handleRefreshRates = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/admin/refresh-rates', { method: 'POST' });
      if (response.ok) {
        const data = await response.json();
        updateExchangeRates(data.current);
        setExchangeRates({ ...EXCHANGE_RATES });
        console.log('[App] Exchange rates manually refreshed');
      }
    } catch (err) {
      console.error('[App] Failed to refresh exchange rates:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    isMounted.current = true;
    checkAuth();
    fetchRates();

    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'IAP_AUTH_SUCCESS') {
        console.log('[App] Auth success message received from popup');
        localStorage.removeItem('iap_logged_out'); // Ensure flag is cleared
        checkAuth();
      }
    };

    const handlePopState = (event: PopStateEvent) => {
      console.log('[App] PopState detected:', event.state);
      if (event.state?.view === 'dashboard') {
        setCurrentView('dashboard');
        window.scrollTo({ top: 0, behavior: 'instant' });
      } else {
        setCurrentView('landing');
        setActiveModule(null);
        setModuleData([]);
        window.scrollTo({ top: 0, behavior: 'instant' });
      }
    };

    window.addEventListener('message', handleMessage);
    window.addEventListener('popstate', handlePopState);
    
    return () => {
      isMounted.current = false;
      window.removeEventListener('message', handleMessage);
      window.removeEventListener('popstate', handlePopState);
    };
  }, [checkAuth]);

  const fetchReports = useCallback(async (email: string) => {
    try {
      const res = await fetch(`/api/reports?email=${encodeURIComponent(email)}`);
      if (res.ok) setSavedReports(await res.json());
    } catch (err) {
      console.error('[App] Failed to fetch reports:', err);
    }
  }, []);

  const fetchTokenUsage = useCallback(async (email: string) => {
    try {
      const res = await fetch(`/api/tokens?email=${encodeURIComponent(email)}`);
      if (res.ok) setTokenUsage(await res.json());
    } catch (err) {
      console.error('[App] Failed to fetch token usage:', err);
    }
  }, []);

  useEffect(() => {
    if (authStatus?.email && !authStatus.isGuest) {
      fetchReports(authStatus.email);
      fetchTokenUsage(authStatus.email);
    }
  }, [authStatus?.email, authStatus?.isGuest, fetchReports, fetchTokenUsage]);

  const handleSaveReport = async (nombre: string, modulo: string, filtros: ReportFilters) => {
    if (!authStatus?.email) return;
    const res = await fetch('/api/reports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: authStatus.email, nombre, modulo, filtros })
    });
    if (res.ok) {
      const report = await res.json();
      setSavedReports(prev => [...prev, report]);
    }
  };

  const handleDeleteReport = async (id: string) => {
    if (!authStatus?.email) return;
    const res = await fetch(`/api/reports/${id}?email=${encodeURIComponent(authStatus.email)}`, { method: 'DELETE' });
    if (res.ok) setSavedReports(prev => prev.filter(r => r.id !== id));
  };

  const loadSheetData = useCallback(async (
    spreadsheetId: string,
    sheetUrl: string,
    sheetName?: string,
    gid?: string,
    reportToLoad?: any,
    sheets?: Array<{ title: string; sheetId: number; index: number }>,
    isSwitch?: boolean
  ) => {
    const params = new URLSearchParams({ spreadsheetId });
    if (sheetName) params.set('sheetName', sheetName);
    else if (gid) params.set('gid', gid);

    const response = await fetch(`/api/sheets/fetch?${params}`);
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.details || 'Sin acceso al Google Sheet. Verificá que esté compartido con la cuenta de servicio.');
    }

    const csvText = await response.text();
    return new Promise<void>((resolve, reject) => {
      Papa.parse(csvText, {
        header: true,
        dynamicTyping: true,
        skipEmptyLines: 'greedy',
        complete: (results: any) => {
          const title = sheetName || `Google Sheet: ${spreadsheetId.substring(0, 8)}...`;
          setInitialReport(reportToLoad || null);
          setModuleData(results.data);
          setActiveModule({ id: title, title, type: 'sheet', sheetUrl, sheets: sheets || [] });
          setCurrentView('dashboard');
          if (!isSwitch) {
            window.history.pushState({ view: 'dashboard' }, '');
            window.scrollTo({ top: 0, behavior: 'instant' });
          }
          setLoading(false);
          resolve();
        },
        error: (err: any) => {
          reject(new Error(`Error al procesar los datos del Sheet: ${err.message}`));
        }
      });
    });
  }, []);

  const handleSheetSelect = useCallback(async (sheetTitle: string) => {
    if (!sheetPicker) return;
    setSheetPickerLoading(true);
    setLoading(true);
    try {
      await loadSheetData(sheetPicker.spreadsheetId, sheetPicker.sheetUrl, sheetTitle, undefined, undefined, sheetPicker.sheets);
      setSheetPicker(null);
    } catch (err: any) {
      showError(err.message);
      setLoading(false);
    } finally {
      setSheetPickerLoading(false);
    }
  }, [sheetPicker, loadSheetData]);

  const handleSwitchSheet = useCallback(async (sheetTitle: string) => {
    if (!activeModule?.sheetUrl) return;
    const spreadsheetId = activeModule.sheetUrl.match(/\/d\/([a-zA-Z0-9-_]+)/)?.[1];
    if (!spreadsheetId) return;
    setLoading(true);
    try {
      await loadSheetData(spreadsheetId, activeModule.sheetUrl, sheetTitle, undefined, undefined, activeModule.sheets, true);
    } catch (err: any) {
      showError(err.message);
      setLoading(false);
    }
  }, [activeModule, loadSheetData]);

  const handleSelectModule = async (id: string, type: 'api' | 'file' | 'sheet', file?: File, sheetUrl?: string, reportToLoad?: any, submodules?: any[]) => {
    // Helper to finalize module selection
    const finalizeSelection = (data: any[], moduleInfo: any) => {
      setInitialReport(reportToLoad || null);
      setModuleData(data);
      setActiveModule(moduleInfo);
      setCurrentView('dashboard');
      window.history.pushState({ view: 'dashboard' }, '');
      window.scrollTo({ top: 0, behavior: 'instant' });
    };

    if (type === 'sheet' && sheetUrl) {
      setLoading(true);
      try {
        const match = sheetUrl.match(/\/d\/([a-zA-Z0-9-_]+)/);
        if (!match) throw new Error('El link de Google Sheet no parece válido. Asegúrate de copiar la URL completa.');
        const spreadsheetId = match[1];

        // Fetch available sheet tabs first
        const listRes = await fetch(`/api/sheets/list?spreadsheetId=${spreadsheetId}`);
        const listData = await listRes.json();

        if (listData.canList && listData.sheets.length > 1) {
          // Multiple sheets — show picker, don't navigate yet
          setSheetPicker({
            spreadsheetId,
            sheetUrl,
            sheets: listData.sheets,
            spreadsheetTitle: listData.title || spreadsheetId.substring(0, 8),
          });
          setLoading(false);
          return;
        }

        // Single sheet or no service account — load directly
        const gidMatch = sheetUrl.match(/[#&]gid=([0-9]+)/);
        const gid = gidMatch ? gidMatch[1] : undefined;
        const firstName = listData.sheets?.[0]?.title;
        await loadSheetData(spreadsheetId, sheetUrl, firstName, gid, reportToLoad, listData.sheets || []);
      } catch (err: any) {
        console.error('Google Sheet Error:', err);
        showError(err.message);
        setLoading(false);
      }
      return;
    }

    if (type === 'file' && file) {
      setLoading(true);
      
      if (file.name.endsWith('.pdf')) {
        try {
          const arrayBuffer = await file.arrayBuffer();
          const loadingTask = pdfjs.getDocument({ data: arrayBuffer });
          const pdf = await loadingTask.promise;
          
          let fullText = '';
          for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            const pageText = textContent.items.map((item: any) => item.str).join(' ');
            fullText += pageText + '\n';
          }
          
          // For PDF, we send a special structure that the Dashboard and Gemini will recognize
          finalizeSelection([{ rawText: fullText }], { id: `PDF: ${file.name}`, title: `Análisis PDF: ${file.name}`, type: 'file' });
        } catch (err: any) {
          console.error('Error parsing PDF:', err);
          alert(`Error al leer el PDF: ${err.message}`);
        } finally {
          setLoading(false);
        }
        return;
      }

      if (file.name.endsWith('.csv')) {
        Papa.parse(file, {
          header: true,
          dynamicTyping: true,
          skipEmptyLines: 'greedy',
          delimiter: "", // Auto-detect delimiter
          complete: (results) => {
            finalizeSelection(results.data, { id: `Archivo: ${file.name}`, title: `Análisis: ${file.name}`, type: 'file' });
            setLoading(false);
          },
          error: (err) => {
            console.error('Error parsing CSV:', err);
            setLoading(false);
          }
        });
      } else {
        const reader = new FileReader();
        reader.onload = (e) => {
          try {
            const data = new Uint8Array(e.target?.result as ArrayBuffer);
            const workbook = XLSX.read(data, { type: 'array' });
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];
            const jsonData = XLSX.utils.sheet_to_json(worksheet);
            
            finalizeSelection(jsonData, { id: `Archivo: ${file.name}`, title: `Análisis: ${file.name}`, type: 'file' });
          } catch (err) {
            console.error('Error parsing Excel:', err);
          } finally {
            setLoading(false);
          }
        };
        reader.readAsArrayBuffer(file);
      }
      return;
    }

    // API Modules - Fast entry
    let title = '';
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
    }
    
    finalizeSelection([], { id, title, type: 'api', submodules: submodules || [] });
  };

  const handleFetchData = async (id: string, fecha_desde: string, fecha_hasta: string) => {
    setLoading(true);
    try {
      let data: any[] = [];
      if (id === 'sales') {
        const salesResponse = await fetchSalesData(fecha_desde, fecha_hasta);
        data = salesResponse.records;
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

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center gap-6">
        <div className="w-16 h-16 border-4 border-blue-900/30 border-t-blue-500 rounded-full animate-spin shadow-lg shadow-blue-500/20" />
        <div className="flex flex-col items-center gap-2">
          <p className="text-white font-bold animate-pulse tracking-widest uppercase text-xs">Verificando Identidad...</p>
          <p className="text-zinc-500 text-[10px] uppercase tracking-widest">Google Cloud IAP SSO</p>
        </div>
      </div>
    );
  }

  // If user is a guest, show the dedicated Login View
  if (authStatus?.isGuest) {
    return (
      <div className="min-h-screen bg-slate-950">
        <LoginView 
          onLogin={() => window.location.reload()} 
          onSimulate={(email) => {
            // Update URL without full reload
            const url = new URL(window.location.href);
            url.searchParams.set('test_email', email);
            window.history.pushState({}, '', url.toString());
            // Trigger auth check
            checkAuth();
          }}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 font-sans text-zinc-100 selection:bg-blue-500/30 selection:text-blue-200">
      <AnimatePresence mode="wait">
        {currentView === 'landing' ? (
          <motion.div
            key="landing"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            <LandingPage
              onSelectModule={handleSelectModule}
              onOpenTerms={() => setIsTermsOpen(true)}
              onOpenFeatureRequest={() => setIsFeatureRequestOpen(true)}
              onRefreshRates={handleRefreshRates}
              authStatus={authStatus}
              isLoading={isLoading}
              exchangeRates={exchangeRates}
              savedReports={savedReports}
              onDeleteReport={handleDeleteReport}
              tokenUsage={tokenUsage}
              sheetPicker={sheetPicker}
              onSheetSelect={handleSheetSelect}
              onSheetPickerClose={() => setSheetPicker(null)}
              sheetPickerLoading={sheetPickerLoading}
            />
          </motion.div>
        ) : (
          <motion.div
            key="dashboard"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.3 }}
          >
            <DashboardView
              title={activeModule?.title}
              moduleId={activeModule?.id}
              moduleType={activeModule?.type}
              moduleSheetUrl={activeModule?.sheetUrl}
              sheetsList={activeModule?.sheets}
              onSwitchSheet={handleSwitchSheet}
              data={moduleData}
              onBack={() => window.history.back()}
              loading={loading}
              onFetchData={handleFetchData}
              onOpenTerms={() => setIsTermsOpen(true)}
              onOpenFeatureRequest={() => setIsFeatureRequestOpen(true)}
              exchangeRates={exchangeRates}
              savedReports={savedReports.filter(r => r.modulo === activeModule?.id)}
              onSaveReport={handleSaveReport}
              userEmail={authStatus?.email}
              initialReport={initialReport}
              submodules={activeModule?.submodules || []}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <TermsModal
        isOpen={isTermsOpen}
        onClose={() => setIsTermsOpen(false)}
      />

      <FeatureRequestModal
        isOpen={isFeatureRequestOpen}
        onClose={() => setIsFeatureRequestOpen(false)}
        userEmail={authStatus?.email || ''}
      />

      {loading && currentView === 'landing' && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex flex-col items-center justify-center gap-4">
          <div className="w-16 h-16 border-4 border-blue-900/30 border-t-blue-500 rounded-full animate-spin shadow-lg shadow-blue-500/20" />
          <p className="text-white font-bold animate-pulse tracking-widest uppercase text-xs">Procesando Ingesta de Datos...</p>
        </div>
      )}

      <AnimatePresence>
        {errorMessage && (
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 40 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[200] flex items-start gap-3 max-w-md w-full mx-4 bg-red-950 border border-red-500/40 rounded-2xl px-5 py-4 shadow-2xl shadow-red-900/30"
          >
            <AlertCircle className="text-red-400 shrink-0 mt-0.5" size={18} />
            <p className="text-sm text-red-200 flex-1 leading-relaxed">{errorMessage}</p>
            <button onClick={() => setErrorMessage(null)} className="text-red-400 hover:text-white transition-colors shrink-0">
              <X size={16} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
