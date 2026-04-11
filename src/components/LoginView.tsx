import React from 'react';
import { motion } from 'motion/react';
import { ShieldCheck, LogIn, ArrowRight, X } from 'lucide-react';

interface LoginViewProps {
  onLogin: () => void;
  onSimulate?: (email: string) => void;
}

export const LoginView: React.FC<LoginViewProps> = ({ onLogin, onSimulate }) => {
  const handleSimulate = (email: string) => {
    if (!email) return;
    
    if (onSimulate) {
      onSimulate(email);
    } else {
      // Fallback to reload if onSimulate is not provided
      window.location.href = `/?test_email=${encodeURIComponent(email)}`;
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center relative overflow-hidden px-6">
      {/* Immersive Background */}
      <div className="absolute inset-0 z-0">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-600/20 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-indigo-600/20 rounded-full blur-[120px] animate-pulse delay-700" />
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 mix-blend-overlay" />
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className="relative z-10 max-w-2xl w-full text-center"
      >
        {/* Logo/Icon */}
        <div className="mb-8 inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-blue-500/10 border border-blue-500/20 backdrop-blur-xl shadow-2xl shadow-blue-500/20">
          <ShieldCheck className="text-blue-400" size={40} />
        </div>

        {/* Content */}
        <h1 className="text-5xl md:text-7xl font-bold text-white mb-6 tracking-tight">
          DataPulse <span className="text-blue-500">Libgot</span>
        </h1>
        
        <p className="text-xl md:text-2xl font-medium text-blue-100/80 mb-4 leading-relaxed">
          Plataforma de análisis que conecta datos con decisiones.
        </p>
        
        <p className="text-zinc-400 text-lg mb-12 max-w-lg mx-auto leading-relaxed">
          Explorá módulos existentes o subí tu información para obtener insights rápidamente.
        </p>

        {/* Login Button */}
        <motion.button
          whileHover={{ scale: 1.02, backgroundColor: "rgba(59, 130, 246, 0.2)" }}
          whileTap={{ scale: 0.98 }}
          onClick={() => {
            // Clear the manual logout flag
            localStorage.removeItem('iap_logged_out');
            
            // Open the login route in a popup
            const width = 500;
            const height = 600;
            const left = window.screenX + (window.outerWidth - width) / 2;
            const top = window.screenY + (window.outerHeight - height) / 2;
            
            window.open(
              '/auth/login', 
              'iap_login_popup', 
              `width=${width},height=${height},left=${left},top=${top},status=no,menubar=no,toolbar=no`
            );
          }}
          className="group relative inline-flex items-center gap-3 px-10 py-5 bg-blue-600/10 border border-blue-500/30 rounded-2xl text-white font-bold text-lg transition-all hover:border-blue-400 hover:shadow-[0_0_40px_rgba(59,130,246,0.3)]"
        >
          <LogIn size={22} className="text-blue-400" />
          <span>Iniciar Sesión con SSO</span>
          <ArrowRight size={18} className="text-blue-500 group-hover:translate-x-1 transition-transform" />
        </motion.button>

        {/* Development Hint & Simulator */}
        {window.location.hostname.includes('run.app') && !window.location.hostname.includes('datapulse-libgot') && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="mt-12 p-6 bg-blue-500/5 border border-blue-500/10 rounded-3xl max-w-sm mx-auto"
          >
            <p className="text-[10px] text-blue-400/60 uppercase tracking-[0.2em] font-bold mb-4">
              Simulador de Entorno (Solo Dev)
            </p>
            <div className="flex flex-col gap-3">
              <input 
                type="email" 
                id="test-email-input"
                placeholder="email@libgot.com"
                defaultValue={new URLSearchParams(window.location.search).get('test_email') || ''}
                className="bg-slate-900/50 border border-blue-500/20 rounded-xl px-4 py-2 text-sm text-white placeholder:text-zinc-700 focus:outline-none focus:border-blue-500/50 transition-colors"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const email = (e.currentTarget as HTMLInputElement).value;
                    handleSimulate(email);
                  }
                }}
              />
              <div className="flex gap-2">
                <button 
                  onClick={() => {
                    const input = document.getElementById('test-email-input') as HTMLInputElement;
                    handleSimulate(input.value);
                  }}
                  className="flex-1 bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 text-xs font-bold py-2 rounded-xl transition-colors border border-blue-500/20"
                >
                  Simular Acceso
                </button>
                {new URLSearchParams(window.location.search).has('test_email') && (
                  <button 
                    onClick={() => {
                      const url = new URL(window.location.href);
                      url.searchParams.delete('test_email');
                      window.history.pushState({}, '', url.toString());
                      onLogin(); // This will trigger a reload or re-check
                    }}
                    className="px-3 bg-slate-800 hover:bg-slate-700 text-zinc-500 hover:text-white text-xs font-bold py-2 rounded-xl transition-colors border border-slate-700"
                    title="Limpiar Simulación"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            </div>
            <p className="mt-4 text-[9px] text-zinc-600 leading-relaxed">
              En la versión <b>Publicada</b>, el botón de arriba activará el SSO real de Google automáticamente.
            </p>
          </motion.div>
        )}

        {/* Footer Info */}
        <div className="mt-16 flex items-center justify-center gap-8 opacity-40">
          <div className="flex flex-col items-center gap-1">
            <span className="text-[10px] uppercase tracking-[0.3em] font-bold text-zinc-400">Seguridad</span>
            <span className="text-[9px] font-medium text-white">Google IAP Protected</span>
          </div>
          <div className="w-px h-8 bg-zinc-800" />
          <div className="flex flex-col items-center gap-1">
            <span className="text-[10px] uppercase tracking-[0.3em] font-bold text-zinc-400">Acceso</span>
            <span className="text-[9px] font-medium text-white">Single Sign-On</span>
          </div>
        </div>
      </motion.div>

      {/* Decorative Grid */}
      <div className="absolute inset-0 z-[-1] opacity-10" 
           style={{ backgroundImage: 'radial-gradient(#3b82f6 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
    </div>
  );
};
