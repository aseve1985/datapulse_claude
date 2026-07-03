import React from 'react';
import { motion } from 'framer-motion';
import { BookOpen, ExternalLink, Info, Flag } from 'lucide-react';

interface ResourceCardProps {
  title: string;
  description: string;
  href: string;
  badge?: string;
  badgeColor?: string;
  note?: string;
  icon: React.ReactNode;
}

function ResourceCard({ title, description, href, badge, badgeColor = 'bg-slate-700 text-zinc-300', note, icon }: ResourceCardProps) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex flex-col gap-3 bg-slate-900 border border-slate-700 hover:border-slate-500 rounded-xl p-5 transition-all hover:bg-slate-800/60"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0 group-hover:border-slate-600 transition-colors">
          {icon}
        </div>
        <ExternalLink className="w-4 h-4 text-zinc-600 group-hover:text-zinc-400 transition-colors mt-0.5 shrink-0" />
      </div>

      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-bold text-white">{title}</span>
          {badge && (
            <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ${badgeColor}`}>
              {badge}
            </span>
          )}
        </div>
        <p className="text-xs text-zinc-500 leading-relaxed">{description}</p>
      </div>

      {note && (
        <div className="flex items-start gap-2 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 mt-1">
          <Info className="w-3.5 h-3.5 text-zinc-500 shrink-0 mt-0.5" />
          <p className="text-[11px] text-zinc-400 leading-relaxed">{note}</p>
        </div>
      )}
    </a>
  );
}

export default function RiAsistenteSubmodule() {
  return (
    <div className="flex-1 flex flex-col p-6 gap-6 overflow-auto">

      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <h2 className="text-lg font-bold text-white">Riesgos › Asistente</h2>
        <p className="text-zinc-500 text-sm mt-0.5">Recursos, políticas y herramientas del área de Riesgos</p>
      </motion.div>

      {/* Documentación de política */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
        className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-zinc-500" />
          <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Documentación — Políticas de Riesgo</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <ResourceCard
            href="https://notebooklm.google.com/notebook/f749b54d-036b-4ab0-9fa8-739447fd0af3"
            title="Política de Riesgo — Argentina"
            description="Documentación completa de la política crediticia ARG. Consultá criterios de elegibilidad, scoring, segmentos y reglas de aprobación."
            badge="ARG"
            badgeColor="bg-sky-900/60 text-sky-300"
            icon={<Flag className="w-5 h-5 text-sky-400" />}
          />
          <ResourceCard
            href="https://notebooklm.google.com/notebook/a730c60a-eb97-4cd6-8953-21a968ebc7f1"
            title="Política de Riesgo — Colombia"
            description="Documentación completa de la política crediticia COL. Consultá criterios de elegibilidad, scoring, segmentos y reglas de aprobación."
            badge="COL"
            badgeColor="bg-yellow-900/60 text-yellow-300"
            icon={<Flag className="w-5 h-5 text-yellow-400" />}
          />
        </div>
      </motion.div>

      {/* Plataforma SIISA */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
        className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <ExternalLink className="w-4 h-4 text-zinc-500" />
          <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Plataforma — Motor de Decisión</p>
        </div>
        <div className="max-w-lg">
          <ResourceCard
            href="https://editorv3.motor.siisa.com.ar/login"
            title="SIISA — Editor de Política v3"
            description="Motor de decisión crediticia. Configuración de reglas, scorecard y flujos de aprobación para ARG y COL."
            badge="SIISA"
            badgeColor="bg-indigo-900/60 text-indigo-300"
            note="Al ingresar, el sistema solicitará el código de cliente: 201 para Argentina · 511 para Colombia."
            icon={<ExternalLink className="w-5 h-5 text-indigo-400" />}
          />
        </div>
      </motion.div>

    </div>
  );
}
