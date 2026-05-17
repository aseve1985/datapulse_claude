import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Lightbulb, CheckCircle, AlertCircle } from 'lucide-react';

interface FeatureRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  userEmail: string;
}

export function FeatureRequestModal({ isOpen, onClose, userEmail }: FeatureRequestModalProps) {
  const [modulo, setModulo] = useState('');
  const [funcionalidad, setFuncionalidad] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const handleClose = () => {
    if (status === 'loading') return;
    setModulo('');
    setFuncionalidad('');
    setStatus('idle');
    setErrorMsg('');
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modulo.trim() || !funcionalidad.trim()) return;
    setStatus('loading');
    setErrorMsg('');
    try {
      const res = await fetch('/api/feature-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usuario: userEmail, modulo: modulo.trim(), funcionalidad_deseada: funcionalidad.trim() })
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      setStatus('success');
    } catch (err: any) {
      setErrorMsg(err.message || 'Error al enviar');
      setStatus('error');
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={(e) => e.target === e.currentTarget && handleClose()}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg shadow-2xl"
          >
            {/* Header */}
            <div className="flex items-center gap-3 px-6 py-5 border-b border-slate-800">
              <div className="w-9 h-9 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
                <Lightbulb size={18} className="text-blue-400" />
              </div>
              <div>
                <h2 className="text-white font-bold text-sm tracking-wide">Sugerir Funcionalidad</h2>
                <p className="text-zinc-500 text-xs mt-0.5">Tu feedback nos ayuda a mejorar DataPulse</p>
              </div>
              <button
                onClick={handleClose}
                className="ml-auto text-zinc-500 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-slate-800"
              >
                <X size={16} />
              </button>
            </div>

            {/* Body */}
            <div className="p-6">
              {status === 'success' ? (
                <div className="flex flex-col items-center gap-4 py-6">
                  <div className="w-14 h-14 rounded-full bg-green-500/10 border border-green-500/20 flex items-center justify-center">
                    <CheckCircle size={28} className="text-green-400" />
                  </div>
                  <div className="text-center">
                    <p className="text-white font-bold text-sm">¡Solicitud enviada!</p>
                    <p className="text-zinc-400 text-xs mt-1">Tu sugerencia fue registrada. ¡Gracias por el feedback!</p>
                  </div>
                  <button
                    onClick={handleClose}
                    className="mt-2 px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-lg transition-colors"
                  >
                    Cerrar
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="flex flex-col gap-5">
                  {/* Usuario */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-zinc-400 text-xs font-bold uppercase tracking-widest">Usuario</label>
                    <div className="bg-slate-800/60 border border-slate-700 rounded-lg px-4 py-2.5 text-zinc-400 text-sm select-none">
                      {userEmail}
                    </div>
                  </div>

                  {/* Módulo */}
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="fr-modulo" className="text-zinc-400 text-xs font-bold uppercase tracking-widest">
                      Módulo <span className="text-blue-400">*</span>
                    </label>
                    <input
                      id="fr-modulo"
                      type="text"
                      value={modulo}
                      onChange={e => setModulo(e.target.value)}
                      placeholder="Ej: Ventas, Cobranzas, Calculadora..."
                      required
                      className="bg-slate-800 border border-slate-700 focus:border-blue-500 focus:outline-none rounded-lg px-4 py-2.5 text-white text-sm placeholder:text-zinc-600 transition-colors"
                    />
                  </div>

                  {/* Funcionalidad */}
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="fr-func" className="text-zinc-400 text-xs font-bold uppercase tracking-widest">
                      Funcionalidad deseada <span className="text-blue-400">*</span>
                    </label>
                    <textarea
                      id="fr-func"
                      value={funcionalidad}
                      onChange={e => setFuncionalidad(e.target.value)}
                      placeholder="Describí la funcionalidad o mejora que te gustaría ver..."
                      required
                      rows={4}
                      className="bg-slate-800 border border-slate-700 focus:border-blue-500 focus:outline-none rounded-lg px-4 py-2.5 text-white text-sm placeholder:text-zinc-600 transition-colors resize-none"
                    />
                  </div>

                  {status === 'error' && (
                    <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-2.5">
                      <AlertCircle size={14} className="text-red-400 shrink-0" />
                      <span className="text-red-400 text-xs">{errorMsg}</span>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={status === 'loading' || !modulo.trim() || !funcionalidad.trim()}
                    className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold uppercase tracking-widest rounded-lg transition-colors flex items-center justify-center gap-2"
                  >
                    {status === 'loading' ? (
                      <>
                        <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Enviando...
                      </>
                    ) : (
                      'Enviar sugerencia'
                    )}
                  </button>
                </form>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
