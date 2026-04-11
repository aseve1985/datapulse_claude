import React from 'react';
import { motion } from 'motion/react';
import { QRCodeSVG } from 'qrcode.react';
import { 
  Users, 
  Headphones, 
  MessageCircle, 
  MessageSquare, 
  BarChart3, 
  ExternalLink 
} from 'lucide-react';

export const PowerBIButton = () => {
  return (
    <div className="flex justify-center">
      <motion.a
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        href="https://app.powerbi.com/home?experience=power-bi"
        target="_blank"
        rel="noreferrer"
        className="flex items-center gap-4 px-12 py-6 bg-gradient-to-r from-slate-800 to-slate-900 border border-slate-700/50 hover:border-blue-500/50 rounded-[2rem] text-white transition-all shadow-2xl group"
      >
        <div className="w-12 h-12 bg-yellow-500/10 rounded-xl flex items-center justify-center text-yellow-500 group-hover:bg-yellow-500 group-hover:text-black transition-all">
          <BarChart3 size={24} />
        </div>
        <div className="text-left">
          <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-[0.2em] mb-1">Acceso Externo</div>
          <div className="text-lg font-black tracking-tight flex items-center gap-2">
            Consultar tableros clásicos de Power BI
            <ExternalLink size={18} className="text-blue-500" />
          </div>
        </div>
      </motion.a>
    </div>
  );
};

export const ContactGrid = () => {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 p-10 bg-slate-900/50 rounded-[2.5rem] border border-slate-800/50 backdrop-blur-sm">
      <div className="space-y-4">
        <h4 className="text-white font-bold uppercase tracking-widest text-sm flex items-center gap-2">
          <Users size={16} className="text-blue-500" /> Equipo de Business Intelligence
        </h4>
        <p className="text-zinc-500 text-sm leading-relaxed max-w-md">
          Para consultas técnicas, dudas sobre los datos o solicitudes de nuevos módulos, contacta con nuestro equipo especializado.
        </p>
      </div>
      
      <div className="flex flex-wrap gap-3">
        {[
          'aseverino@libgot.com',
          'verrocchioc@libgot.com',
          'bi@libgot.com'
        ].map(email => (
          <div 
            key={email}
            className="flex items-center gap-3 px-5 py-3 bg-slate-800/50 border border-slate-700/50 rounded-2xl text-zinc-400 cursor-text group"
          >
            <div className="w-8 h-8 rounded-lg bg-slate-700 flex items-center justify-center">
              <Headphones size={14} className="text-zinc-300" />
            </div>
            <span className="text-xs font-bold tracking-tight select-all">{email}</span>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row items-center gap-6 bg-slate-800/30 p-6 rounded-3xl border border-slate-700/30">
          <div className="flex flex-col items-center gap-3">
            <a 
              href="https://wa.me/5491133678263" 
              target="_blank" 
              rel="noreferrer"
              className="flex items-center gap-3 px-6 py-4 bg-green-600 hover:bg-green-500 text-white rounded-2xl transition-all shadow-lg shadow-green-900/20 group w-full justify-center"
            >
              <MessageCircle size={20} className="group-hover:scale-110 transition-transform" />
              <span className="font-bold text-sm uppercase tracking-wider">WhatsApp</span>
            </a>
            <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest">Click para chatear</span>
          </div>
          
          <div className="p-3 bg-white rounded-2xl shadow-xl">
            <QRCodeSVG 
              value="https://wa.me/5491133678263" 
              size={80}
              level="H"
              includeMargin={false}
            />
          </div>
        </div>

        <a 
          href="https://chat.google.com/app/home" 
          target="_blank" 
          rel="noreferrer"
          className="flex items-center gap-3 px-6 py-4 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl transition-all shadow-lg shadow-blue-900/20 group w-full justify-center"
        >
          <MessageSquare size={20} className="group-hover:scale-110 transition-transform" />
          <span className="font-bold text-sm uppercase tracking-wider">Google Chat</span>
        </a>
      </div>
    </div>
  );
};

export const ContactSection = () => {
  return (
    <div className="flex flex-col gap-12">
      <PowerBIButton />
      <ContactGrid />
    </div>
  );
};
