import React from 'react';
import { motion } from 'framer-motion';
import { BarChart3, Clock } from 'lucide-react';

export default function RiAnaliticoSubmodule() {
  return (
    <div className="flex-1 flex flex-col p-6 gap-6 overflow-auto">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <h2 className="text-lg font-bold text-white">Riesgos › Analítico</h2>
        <p className="text-zinc-500 text-sm mt-0.5">Dashboard analítico de cartera y comportamiento crediticio</p>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
        className="flex-1 flex flex-col items-center justify-center gap-6">

        <div className="flex flex-col items-center gap-4 text-center max-w-md">
          <div className="w-16 h-16 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center">
            <BarChart3 className="w-8 h-8 text-slate-500" />
          </div>
          <div>
            <h3 className="text-white font-bold text-base">Módulo en construcción</h3>
            <p className="text-zinc-500 text-sm mt-2 leading-relaxed">
              Próximamente este módulo cargará un parquet con la información analítica de cartera de riesgos —
              similar al módulo de Cobranzas — con KPIs, segmentaciones y evolución temporal.
            </p>
          </div>
          <div className="flex items-center gap-2 px-4 py-2 bg-slate-800/60 border border-slate-700 rounded-xl text-xs text-zinc-500">
            <Clock className="w-3.5 h-3.5" />
            Disponible cuando se cargue la fuente de datos
          </div>
        </div>

      </motion.div>
    </div>
  );
}
