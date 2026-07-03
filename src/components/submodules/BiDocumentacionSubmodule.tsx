import React from 'react';
import { motion } from 'framer-motion';
import { BookOpen, ExternalLink } from 'lucide-react';

export default function BiDocumentacionSubmodule() {
  return (
    <div className="flex-1 flex flex-col p-6 gap-6 overflow-auto">

      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <h2 className="text-lg font-bold text-white">BI › Documentación</h2>
        <p className="text-zinc-500 text-sm mt-0.5">Recursos y documentación del área de Business Intelligence</p>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
        className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-zinc-500" />
          <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Base de conocimiento — BI</p>
        </div>

        <div className="max-w-lg">
          <a
            href="https://notebooklm.google.com/notebook/854ed618-48fc-4e44-9483-772a0dced21c"
            target="_blank"
            rel="noopener noreferrer"
            className="group flex flex-col gap-3 bg-slate-900 border border-slate-700 hover:border-slate-500 rounded-xl p-5 transition-all hover:bg-slate-800/60"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0 group-hover:border-slate-600 transition-colors">
                <BookOpen className="w-5 h-5 text-violet-400" />
              </div>
              <ExternalLink className="w-4 h-4 text-zinc-600 group-hover:text-zinc-400 transition-colors mt-0.5 shrink-0" />
            </div>
            <div>
              <p className="text-sm font-bold text-white mb-1">Documentación BI — NotebookLM</p>
              <p className="text-xs text-zinc-500 leading-relaxed">
                Base de conocimiento centralizada del área de BI. Consultá definiciones, métricas, metodologías y lógica de los reportes.
              </p>
            </div>
          </a>
        </div>
      </motion.div>

    </div>
  );
}
