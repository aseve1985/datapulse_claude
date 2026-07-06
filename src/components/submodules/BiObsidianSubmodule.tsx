import React from 'react';
import { motion } from 'framer-motion';
import { GitBranch, Database, Link2, Layers } from 'lucide-react';

export default function BiObsidianSubmodule() {
  return (
    /* -mx-6 -mt-8 escapa el padding del main de DashboardView (px-6 py-8) */
    <div className="-mx-6 -mt-8 flex flex-col" style={{ height: 'calc(100vh - 62px)' }}>

      {/* DataPulse header */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="shrink-0 px-6 py-4 border-b border-slate-800 flex items-center justify-between gap-4 bg-slate-950"
      >
        <div>
          <h2 className="text-lg font-bold text-white">BI › Obsidian</h2>
          <p className="text-zinc-500 text-sm mt-0.5">Mapa interactivo del Datawarehouse Libgot</p>
        </div>

        <div className="hidden sm:flex items-center gap-4">
          <div className="flex items-center gap-1.5 text-xs text-zinc-500">
            <Layers className="w-3.5 h-3.5 text-violet-400" />
            <span className="font-bold text-zinc-300">24</span> schemas
          </div>
          <div className="w-px h-4 bg-slate-700" />
          <div className="flex items-center gap-1.5 text-xs text-zinc-500">
            <Database className="w-3.5 h-3.5 text-blue-400" />
            <span className="font-bold text-zinc-300">441</span> tablas
          </div>
          <div className="w-px h-4 bg-slate-700" />
          <div className="flex items-center gap-1.5 text-xs text-zinc-500">
            <Link2 className="w-3.5 h-3.5 text-emerald-400" />
            <span className="font-bold text-zinc-300">77</span> vínculos
          </div>
          <div className="w-px h-4 bg-slate-700" />
          <div className="flex items-center gap-1.5 text-xs">
            <GitBranch className="w-3.5 h-3.5 text-zinc-500" />
            <span className="text-zinc-500">Amazon Redshift</span>
          </div>
        </div>
      </motion.div>

      {/* Graph iframe — fills remaining height */}
      <motion.iframe
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.1 }}
        src="/examples/Datawarehouse-Libgot-Graph.html"
        title="Datawarehouse Libgot — Mapa interactivo"
        className="flex-1 w-full border-0"
        style={{ display: 'block', minHeight: 0 }}
      />

    </div>
  );
}
