import React, { useRef, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { QRCodeSVG } from 'qrcode.react';
import { PowerBIButton, ContactGrid } from './ContactSection';
import {
  TrendingUp,
  Wallet,
  AlertTriangle,
  Megaphone,
  FileUp,
  ChevronRight,
  BarChart3,
  PieChart,
  Activity,
  Banknote,
  Headphones,
  Scale,
  Users,
  Package,
  MessageCircle,
  ExternalLink,
  Settings,
  Lock,
  ShieldAlert,
  X,
  LogOut,
  DollarSign,
  RefreshCcw,
  Bookmark,
  Trash2,
  FolderOpen,
  CalendarDays,
  Zap
} from 'lucide-react';
import { EXCHANGE_RATES } from '../constants';

interface LandingPageProps {
  onSelectModule: (id: string, type: 'api' | 'file' | 'sheet', file?: File, sheetUrl?: string, reportToLoad?: any) => void;
  onOpenTerms: () => void;
  onRefreshRates: () => void;
  authStatus: any;
  isLoading: boolean;
  exchangeRates: any;
  savedReports?: any[];
  onDeleteReport?: (id: string) => void;
  tokenUsage?: { total: number; sesiones: number } | null;
}

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
    id: 'collections',
    title: 'Cobranzas',
    description: 'Seguimiento de pagos, cartera vencida y eficiencia de recaudación.',
    icon: Wallet,
    color: 'bg-indigo-600',
    type: 'api'
  },
  {
    id: 'risks',
    title: 'Riesgos',
    description: 'Evaluación de perfiles crediticios y alertas de comportamiento.',
    icon: AlertTriangle,
    color: 'bg-slate-700',
    type: 'api'
  },
  {
    id: 'marketing',
    title: 'Marketing',
    description: 'Performance de campañas, ROI y adquisición de clientes.',
    icon: Megaphone,
    color: 'bg-blue-800',
    type: 'api'
  },
  {
    id: 'finance',
    title: 'Finanzas',
    description: 'Gestión de presupuestos, flujo de caja y estados financieros.',
    icon: Banknote,
    color: 'bg-slate-800',
    type: 'api'
  },
  {
    id: 'callcenter',
    title: 'Callcenter',
    description: 'Métricas de atención, tiempos de respuesta y satisfacción del cliente.',
    icon: Headphones,
    color: 'bg-indigo-800',
    type: 'api'
  },
  {
    id: 'legal',
    title: 'Legales',
    description: 'Seguimiento de contratos, litigios y cumplimiento normativo.',
    icon: Scale,
    color: 'bg-zinc-700',
    type: 'api'
  },
  {
    id: 'board',
    title: 'Directorio',
    description: 'Reportes ejecutivos de alto nivel y visión estratégica global.',
    icon: Users,
    color: 'bg-blue-900',
    type: 'api'
  },
  {
    id: 'product',
    title: 'Producto',
    description: 'Ciclo de vida, inventario y desarrollo de nuevas funcionalidades.',
    icon: Package,
    color: 'bg-slate-600',
    type: 'api'
  },
  {
    id: 'administration',
    title: 'Administración',
    description: 'Control de procesos internos, recursos y gestión operativa.',
    icon: Settings,
    color: 'bg-zinc-800',
    type: 'api'
  }
];

const WELCOME_PHRASES = [
  (name: string) => `${name}, ¿en qué te ayudo hoy?`,
  (name: string) => `Bienvenido, ${name}. ¿Qué querés analizar hoy?`,
  (name: string) => `Hola ${name}, ¿por dónde empezamos?`,
  (name: string) => `${name}, ¿qué datos exploramos hoy?`,
  (name: string) => `Buenas, ${name}. Todo listo para vos.`,
];

const WELCOME_PHRASES_GUEST = [
  '¿En qué te ayudo hoy?',
  '¿Qué querés analizar hoy?',
  '¿Por dónde empezamos?',
  '¿Qué datos exploramos hoy?',
  'Todo listo. ¿Qué necesitás?',
];

export default function LandingPage({ onSelectModule, onOpenTerms, onRefreshRates, authStatus, isLoading, exchangeRates, savedReports = [], onDeleteReport, tokenUsage }: LandingPageProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [deniedModule, setDeniedModule] = React.useState<string | null>(null);
  const [sheetUrl, setSheetUrl] = React.useState('');

  const welcomeMessage = useMemo(() => {
    const name = authStatus?.displayName;
    const idx = Math.floor(Math.random() * WELCOME_PHRASES.length);
    return name ? WELCOME_PHRASES[idx](name) : WELCOME_PHRASES_GUEST[idx];
  }, [authStatus?.displayName]);
  const [isSheetInputVisible, setIsSheetInputVisible] = React.useState(false);
  const [isAccountExpanded, setIsAccountExpanded] = React.useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = React.useState<string | null>(null);

  // Push a history entry when any modal opens so the mobile back button closes it instead of leaving the app
  useEffect(() => {
    if (deniedModule || deleteConfirmId) {
      window.history.pushState({ modal: true }, '');
    }
  }, [deniedModule, deleteConfirmId]);

  useEffect(() => {
    const handlePopState = () => {
      if (deniedModule) setDeniedModule(null);
      if (deleteConfirmId) setDeleteConfirmId(null);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [deniedModule, deleteConfirmId]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onSelectModule('manual', 'file', file);
    }
  };

  const handleSheetSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (sheetUrl.trim()) {
      onSelectModule('manual', 'sheet', undefined, sheetUrl);
      setSheetUrl('');
      setIsSheetInputVisible(false);
    }
  };

  const checkAccess = (moduleId: string) => {
    if (!authStatus) return false; // Block until loaded
    if (authStatus.hasAllAccess) return true;
    return authStatus.allowedModules?.includes(moduleId);
  };

  const handleModuleClick = (module: any) => {
    if (checkAccess(module.id)) {
      onSelectModule(module.id, 'api');
    } else {
      setDeniedModule(module.title);
    }
  };

  const handleLogOff = () => {
    // Set a manual logout flag to show the LoginView on reload
    localStorage.setItem('iap_logged_out', 'true');
    
    // Redirect to root to trigger the App component to show the LoginView
    window.location.href = "/";
  };

  return (
    <div className="max-w-7xl mx-auto px-6 py-12 lg:py-24 relative">
      {/* Background glow effects */}
      <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-blue-600/5 blur-[120px] -z-10 pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-indigo-600/5 blur-[100px] -z-10 pointer-events-none" />

      {/* Top Header Bar (Responsive) */}
      <div className="flex flex-col lg:flex-row justify-between items-center lg:items-start gap-8 mb-12 lg:mb-20">
        <header className="text-center lg:text-left order-2 lg:order-1">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <div className="flex flex-col lg:flex-row items-center lg:items-end gap-6 mb-8">
              <div className="text-center lg:text-left">
                <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tighter text-white mb-2">
                  DataPulse <span className="text-blue-500 drop-shadow-[0_0_15px_rgba(59,130,246,0.3)]">Libgot</span>
                </h1>
                <div className="flex items-center gap-4 mt-2">
                  <div className="h-1 w-24 bg-blue-600 rounded-full mx-auto lg:mx-0" />
                </div>
              </div>
            </div>
            <p className="text-lg lg:text-xl text-zinc-400 max-w-3xl leading-relaxed">
              {welcomeMessage}
            </p>
          </motion.div>
        </header>

        {/* Account Panel */}
        <div className="order-1 lg:order-2 w-full lg:w-72 shrink-0">
          <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl overflow-hidden backdrop-blur-sm">
            {/* Header usuario — siempre visible, click expande */}
            <div
              className="flex items-center gap-3 p-4 cursor-pointer select-none"
              onClick={() => setIsAccountExpanded(v => !v)}
            >
              <div className={`w-10 h-10 rounded-xl bg-slate-800 border ${authStatus?.error ? "border-red-500/30 text-red-400" : "border-slate-700 text-blue-500"} flex items-center justify-center shrink-0`}>
                {authStatus?.error ? <ShieldAlert size={18} /> : <Users size={18} />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-zinc-200 truncate">{authStatus?.displayName || authStatus?.email || "Usuario"}</p>
                <p className="text-[10px] text-zinc-500 truncate">{authStatus?.displayName ? authStatus.email : ''}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0" onClick={e => e.stopPropagation()}>
                <button
                  onClick={handleLogOff}
                  className="flex items-center gap-1 px-2 py-1 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 rounded-lg text-[9px] font-bold text-red-400 uppercase tracking-widest transition-colors"
                >
                  <LogOut size={9} />
                  Salir
                </button>
                <ChevronRight
                  size={14}
                  className={`text-zinc-600 transition-transform duration-200 ${isAccountExpanded ? 'rotate-90' : ''}`}
                />
              </div>
            </div>

            {/* Contenido colapsable */}
            <AnimatePresence initial={false}>
            {isAccountExpanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >

            {/* Módulos habilitados */}
            <div className="p-4 border-b border-slate-800/60">
              <p className="text-[9px] font-bold text-zinc-600 uppercase tracking-[0.2em] mb-2">Módulos habilitados</p>
              {authStatus?.hasAllAccess ? (
                <div className="flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  <span className="text-xs font-bold text-emerald-400">Acceso Total</span>
                </div>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {(authStatus?.allowedModules || []).map((mod: string) => {
                    const m = modules.find(x => x.id === mod);
                    return (
                      <span key={mod} className="flex items-center gap-1 px-2 py-0.5 bg-slate-800 border border-slate-700 rounded-lg text-[9px] font-bold text-zinc-400">
                        {m?.title || mod}
                      </span>
                    );
                  })}
                  {(authStatus?.allowedModules?.length || 0) === 0 && (
                    <span className="text-[10px] text-zinc-600">Sin módulos asignados</span>
                  )}
                </div>
              )}
            </div>

            {/* Mis reportes */}
            <div className="p-4 border-b border-slate-800/60">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[9px] font-bold text-zinc-600 uppercase tracking-[0.2em]">Mis Reportes</p>
                {savedReports.length > 0 && (
                  <span className="bg-blue-600/20 text-blue-400 text-[9px] font-bold px-1.5 py-0.5 rounded-full border border-blue-500/20">{savedReports.length}</span>
                )}
              </div>
              {savedReports.length === 0 ? (
                <p className="text-[10px] text-zinc-600">Aún no guardaste reportes.</p>
              ) : (
                <div className="space-y-1.5">
                  {savedReports.slice(0, 4).map(r => {
                    const mod = modules.find(m => m.id === r.modulo);
                    const isApiModule = !!mod;
                    const hasSheetUrl = !!r.filtros?.sheetUrl;
                    const isClickable = isApiModule || hasSheetUrl;
                    const handleOpen = (e: React.MouseEvent) => {
                      e.stopPropagation();
                      if (isApiModule) onSelectModule(r.modulo, 'api', undefined, undefined, r);
                      else if (hasSheetUrl) onSelectModule(r.modulo, 'sheet', undefined, r.filtros.sheetUrl, r);
                    };
                    return (
                      <div key={r.id} className="flex items-center justify-between group">
                        <button
                          onClick={isClickable ? handleOpen : undefined}
                          className={`flex items-center gap-2 flex-1 min-w-0 text-left transition-colors ${isClickable ? 'hover:text-blue-400 cursor-pointer' : 'cursor-default'}`}
                        >
                          <Bookmark size={9} className="text-blue-500 shrink-0" />
                          <span className="text-[10px] font-medium text-zinc-300 truncate group-hover:text-blue-400">{r.nombre}</span>
                          <span className="text-[9px] text-zinc-600 shrink-0 truncate">{mod?.title || r.modulo}</span>
                          {isClickable && <ChevronRight size={9} className="text-zinc-700 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />}
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(r.id); }}
                          className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 p-1 hover:text-red-400 text-zinc-600 transition-all"
                        >
                          <Trash2 size={9} />
                        </button>
                      </div>
                    );
                  })}
                  {savedReports.length > 4 && (
                    <p className="text-[9px] text-zinc-600">+{savedReports.length - 4} más abajo</p>
                  )}
                </div>
              )}
            </div>

            {/* Tokens */}
            {tokenUsage !== null && tokenUsage !== undefined && (
              <div className="p-4 border-b border-slate-800/60">
                <p className="text-[9px] font-bold text-zinc-600 uppercase tracking-[0.2em] mb-2">Tokens IA consumidos</p>
                <div className="flex items-center gap-2">
                  <Zap size={9} className="text-yellow-500 shrink-0" />
                  <span className="text-[10px] font-bold text-zinc-300">
                    {tokenUsage.total.toLocaleString('es-AR')}
                  </span>
                  <span className="text-[9px] text-zinc-600">
                    en {tokenUsage.sesiones} {tokenUsage.sesiones === 1 ? 'sesión' : 'sesiones'}
                  </span>
                </div>
              </div>
            )}

            {/* Cotizaciones */}
            <div className="p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[9px] font-bold text-zinc-600 uppercase tracking-[0.2em]">Tipo de Cambio</p>
                <button
                  onClick={(e) => { e.stopPropagation(); onRefreshRates(); }}
                  className="p-1 hover:bg-slate-800 rounded-lg transition-colors text-zinc-600 hover:text-blue-400"
                  title="Actualizar"
                >
                  <RefreshCcw size={9} />
                </button>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <DollarSign size={9} className="text-blue-500" />
                  <span className="text-[10px] text-zinc-500 font-bold">ARS/USD: <span className="text-blue-400">{Math.round(exchangeRates.ARS)}</span></span>
                </div>
                <div className="w-[1px] h-3 bg-slate-800" />
                <div className="flex items-center gap-1.5">
                  <DollarSign size={9} className="text-blue-500" />
                  <span className="text-[10px] text-zinc-500 font-bold">COP/USD: <span className="text-blue-400">{Math.round(exchangeRates.COP)}</span></span>
                </div>
              </div>
            </div>

            </motion.div>
            )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 mb-16">
        {modules.map((module, index) => (
          <motion.button
            key={module.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: index * 0.05 }}
            onClick={() => handleModuleClick(module)}
            className={`group relative flex flex-col p-8 backdrop-blur-md rounded-[2rem] border transition-all text-left overflow-hidden shadow-xl ${
              checkAccess(module.id)
                ? 'bg-slate-900/40 border-slate-800/50 hover:border-blue-500/40 hover:bg-slate-800/60'
                : 'bg-slate-900/20 border-slate-800/30 opacity-40 grayscale cursor-not-allowed'
            }`}
          >
            {!checkAccess(module.id) && (
              <div className="absolute top-4 right-4 z-20">
                <Lock className="w-4 h-4 text-zinc-600" />
              </div>
            )}
            {checkAccess(module.id) && savedReports.filter(r => r.modulo === module.id).length > 0 && (
              <div className="absolute top-4 right-4 z-20 flex items-center gap-1 bg-blue-600/20 border border-blue-500/30 rounded-full px-2 py-0.5">
                <Bookmark className="w-2.5 h-2.5 text-blue-400" />
                <span className="text-[9px] font-bold text-blue-400">{savedReports.filter(r => r.modulo === module.id).length}</span>
              </div>
            )}
            <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 blur-3xl -mr-16 -mt-16 group-hover:bg-blue-500/10 transition-colors" />

            <div className={`w-14 h-14 ${module.color} rounded-2xl flex items-center justify-center text-white mb-6 ${checkAccess(module.id) ? 'group-hover:scale-110 group-hover:rotate-3' : ''} transition-all shadow-lg shadow-black/20`}>
              <module.icon size={28} />
            </div>

            <h3 className={`text-xl font-bold mb-3 transition-colors ${checkAccess(module.id) ? 'text-white group-hover:text-blue-400' : 'text-zinc-500'}`}>{module.title}</h3>
            <p className="text-zinc-500 text-sm leading-relaxed mb-8 group-hover:text-zinc-400 transition-colors">
              {module.description}
            </p>

            {checkAccess(module.id) ? (
              <div className="mt-auto flex items-center text-blue-500/80 font-bold text-xs uppercase tracking-widest group-hover:text-blue-400 transition-colors">
                Explorar
                <ChevronRight size={14} className="ml-1 group-hover:translate-x-1 transition-transform" />
              </div>
            ) : (
              <div className="mt-auto flex items-center text-zinc-600 font-bold text-xs uppercase tracking-widest">
                <Lock size={11} className="mr-1.5" /> Sin acceso
              </div>
            )}
          </motion.button>
        ))}
      </div>

      {savedReports.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-16"
        >
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-blue-600/10 rounded-xl border border-blue-500/20">
              <FolderOpen className="w-4 h-4 text-blue-400" />
            </div>
            <h2 className="text-lg font-bold text-white">Mis Reportes</h2>
            <span className="bg-blue-600/20 text-blue-400 text-[10px] font-bold px-2 py-0.5 rounded-full border border-blue-500/30">{savedReports.length}</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {savedReports.map(report => {
              const mod = modules.find(m => m.id === report.modulo);
              const isApiModule = !!mod;
              return (
                <div key={report.id} className="group relative flex flex-col p-5 bg-slate-900/40 border border-slate-800/50 hover:border-blue-500/30 rounded-2xl transition-all">
                  <div className="flex items-start justify-between mb-3">
                    <div className={`w-8 h-8 ${mod?.color || 'bg-slate-700'} rounded-xl flex items-center justify-center text-white shrink-0`}>
                      {mod ? <mod.icon size={16} /> : <FileUp size={16} />}
                    </div>
                    <button
                      onClick={() => setDeleteConfirmId(report.id)}
                      className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 p-1.5 hover:bg-red-500/10 rounded-lg text-zinc-600 hover:text-red-400 transition-all"
                      title="Eliminar"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <p className="text-sm font-bold text-zinc-200 mb-1">{report.nombre}</p>
                  <p className="text-[10px] text-zinc-500 font-medium uppercase tracking-wider mb-3">{mod?.title || report.modulo}</p>
                  {isApiModule && report.filtros?.startDate && (
                    <div className="flex items-center gap-1.5 text-[10px] text-zinc-600 mb-4">
                      <CalendarDays className="w-3 h-3" />
                      <span>{report.filtros.startDate} → {report.filtros.endDate}</span>
                    </div>
                  )}
                  {isApiModule ? (
                    <button
                      onClick={() => onSelectModule(report.modulo, 'api', undefined, undefined, report)}
                      className="mt-auto w-full py-1.5 bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/20 text-blue-400 rounded-xl text-xs font-bold transition-colors"
                    >
                      Abrir módulo
                    </button>
                  ) : report.filtros?.sheetUrl ? (
                    <button
                      onClick={() => onSelectModule(report.modulo, 'sheet', undefined, report.filtros.sheetUrl, report)}
                      className="mt-auto w-full py-1.5 bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/20 text-blue-400 rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-1.5"
                    >
                      <ExternalLink size={11} />
                      Abrir Sheet
                    </button>
                  ) : (
                    <p className="mt-auto text-[9px] text-zinc-600 text-center">Cargá el archivo para restaurar</p>
                  )}
                </div>
              );
            })}
          </div>
        </motion.div>
      )}

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, delay: 0.5 }}
        className="relative p-12 bg-gradient-to-br from-slate-900 to-blue-950/20 border border-slate-800/50 rounded-[3rem] overflow-hidden shadow-2xl"
      >
        <div className="relative z-10 flex flex-col lg:flex-row items-center justify-between gap-12">
          <div className="text-center lg:text-left">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-bold uppercase tracking-wider mb-6">
              <Activity size={12} /> Procesamiento Externo
            </div>
            <h2 className="text-3xl lg:text-4xl font-bold text-white mb-4">Ingesta de Datos Manual</h2>
            <p className="text-zinc-400 text-lg max-w-xl leading-relaxed">
              Carga archivos CSV, Excel, PDF o vincula un Google Sheet para un análisis instantáneo potenciado por inteligencia artificial.
            </p>
          </div>
          
          <div className="flex flex-col items-center gap-6 w-full lg:w-auto">
            <input 
              type="file" 
              ref={fileInputRef}
              onChange={handleFileUpload}
              accept=".csv, .xlsx, .xls, .pdf"
              className="hidden"
            />
            
            <div className="flex flex-col sm:flex-row gap-4 w-full">
              <button 
                onClick={() => fileInputRef.current?.click()}
                className="group flex-1 flex items-center justify-center gap-3 px-8 py-5 bg-blue-600 hover:bg-blue-500 text-white font-black rounded-2xl transition-all shadow-[0_0_30px_rgba(37,99,235,0.3)] hover:shadow-[0_0_40px_rgba(37,99,235,0.5)] uppercase tracking-widest text-sm"
              >
                <FileUp size={20} className="group-hover:-translate-y-1 transition-transform" />
                Subir Archivo
              </button>

              <button 
                onClick={() => setIsSheetInputVisible(!isSheetInputVisible)}
                className="group flex-1 flex items-center justify-center gap-3 px-8 py-5 bg-slate-800 hover:bg-slate-700 text-white font-black rounded-2xl transition-all border border-slate-700 hover:border-blue-500/50 uppercase tracking-widest text-sm"
              >
                <ExternalLink size={20} className="group-hover:rotate-12 transition-transform" />
                Google Sheet
              </button>
            </div>

            <AnimatePresence>
              {isSheetInputVisible && (
                <motion.form 
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  onSubmit={handleSheetSubmit}
                  className="w-full space-y-3 overflow-hidden"
                >
                  <div className="relative">
                    <input 
                      type="url"
                      value={sheetUrl}
                      onChange={(e) => setSheetUrl(e.target.value)}
                      placeholder="Pega el link de Google Sheet aquí..."
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                      required
                    />
                    <button 
                      type="submit"
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-500 transition-colors"
                    >
                      <ChevronRight size={16} />
                    </button>
                  </div>
                  <p className="text-[10px] text-zinc-500 uppercase font-bold tracking-widest text-center">
                    Asegúrate de que el archivo sea público (Cualquiera con el link)
                  </p>
                </motion.form>
              )}
            </AnimatePresence>

            <div className="flex flex-wrap items-center justify-center gap-4 text-zinc-500 text-[10px] font-bold uppercase tracking-widest">
              <span className="flex items-center gap-2 px-3 py-1 bg-slate-800/50 rounded-lg border border-slate-700/50">
                <PieChart size={12} className="text-blue-500" /> CSV
              </span>
              <span className="flex items-center gap-2 px-3 py-1 bg-slate-800/50 rounded-lg border border-slate-700/50">
                <BarChart3 size={12} className="text-indigo-500" /> EXCEL
              </span>
              <span className="flex items-center gap-2 px-3 py-1 bg-slate-800/50 rounded-lg border border-slate-700/50">
                <FileUp size={12} className="text-red-500" /> PDF
              </span>
              <span className="flex items-center gap-2 px-3 py-1 bg-slate-800/50 rounded-lg border border-slate-700/50">
                <ExternalLink size={12} className="text-green-500" /> SHEETS
              </span>
            </div>
          </div>
        </div>

        {/* Decorative elements */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-blue-600/5 blur-[120px] -mr-48 -mt-48" />
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-indigo-600/5 blur-[120px] -ml-48 -mb-48" />
      </motion.div>

      <footer className="mt-8 pt-12 border-t border-slate-800/50 flex flex-col gap-12">
        <PowerBIButton />

        <div className="flex flex-col lg:flex-row items-center justify-between gap-8">
          <div className="flex items-center gap-3">
            <span className="text-xl font-black tracking-tighter text-white">DataPulse <span className="text-blue-500">Libgot</span></span>
          </div>
          
          <div className="flex flex-wrap justify-center gap-8 text-zinc-400 text-xs font-bold uppercase tracking-widest">
            <a href="https://notebooklm.google.com/notebook/854ed618-48fc-4e44-9483-772a0dced21c" target="_blank" rel="noreferrer" className="hover:text-blue-400 transition-colors flex items-center gap-2">
              <ChevronRight size={14} /> DOCUMENTACIÓN
            </a>
            <button 
              onClick={onOpenTerms}
              className="hover:text-blue-400 transition-colors flex items-center gap-2 cursor-pointer uppercase"
            >
              <ChevronRight size={14} /> PRIVACIDAD
            </button>
          </div>
        </div>
        
        <ContactGrid />

        <div className="text-center text-zinc-500 text-[10px] font-bold uppercase tracking-[0.2em] pb-12 border-t border-slate-900/50 pt-8">
          © 2026 Business Intelligence Suite - Punta de lanza tecnológica
        </div>
      </footer>

      {/* Delete Confirmation Modal */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-950/80 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="max-w-sm w-full bg-slate-900 border border-slate-800 rounded-[2rem] p-8 shadow-2xl"
          >
            <div className="w-14 h-14 bg-red-500/10 rounded-2xl flex items-center justify-center text-red-500 mb-5 mx-auto">
              <Trash2 size={26} />
            </div>
            <div className="text-center space-y-3 mb-6">
              <h2 className="text-xl font-bold text-white">¿Eliminar reporte?</h2>
              <p className="text-zinc-400 text-sm leading-relaxed">
                Esta acción no se puede deshacer.
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteConfirmId(null)}
                className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-xl transition-all text-sm uppercase tracking-widest"
              >
                Cancelar
              </button>
              <button
                onClick={() => { onDeleteReport?.(deleteConfirmId); setDeleteConfirmId(null); }}
                className="flex-1 py-3 bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 text-red-400 font-bold rounded-xl transition-all text-sm uppercase tracking-widest"
              >
                Eliminar
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Access Denied Warning */}
      {deniedModule && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-950/80 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-[2.5rem] p-8 shadow-2xl relative overflow-hidden"
          >
            <div className="absolute top-0 right-0 w-32 h-32 bg-red-500/5 blur-3xl -mr-16 -mt-16" />
            
            <button 
              onClick={() => setDeniedModule(null)}
              className="absolute top-6 right-6 p-2 text-zinc-500 hover:text-white hover:bg-slate-800 rounded-full transition-all"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="w-16 h-16 bg-red-500/10 rounded-2xl flex items-center justify-center text-red-500 mb-6 mx-auto">
              <ShieldAlert size={32} />
            </div>

            <div className="text-center space-y-4">
              <h2 className="text-2xl font-bold text-white">Acceso Restringido</h2>
              <p className="text-zinc-400 text-sm leading-relaxed">
                Lo sentimos, no tienes permisos asignados para acceder al <span className="text-white font-bold">{deniedModule}</span>. 
                <br /><br />
                Si crees que esto es un error, por favor contacta con el administrador del sistema para solicitar acceso.
              </p>
              
              <div className="pt-4">
                <button 
                  onClick={() => setDeniedModule(null)}
                  className="w-full py-4 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-xl transition-all uppercase tracking-widest text-xs"
                >
                  Entendido
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
