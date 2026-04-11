import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import { X, FileText } from 'lucide-react';

interface TermsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const termsText = `# TÉRMINOS Y CONDICIONES DE USO

## Área de Datos y Riesgos – Libgot

**Última actualización:** Marzo 2026

---

## 1. Objeto

El presente documento establece los términos y condiciones que regulan el acceso, uso y tratamiento de la información provista por el Área de Datos y Riesgos de Libgot (en adelante, la “Información”), disponible a través de plataformas, reportes, tableros, APIs y cualquier otro medio habilitado.

---

## 2. Carácter confidencial y uso restringido

Toda la Información a la que se acceda tiene carácter **estrictamente confidencial, privado y de uso interno**.

Queda expresamente prohibido:

* Divulgar, compartir, reproducir o distribuir la Información a terceros no autorizados.
* Utilizar la Información con fines distintos a los definidos por Libgot.
* Extraer, copiar o replicar datos fuera de los entornos autorizados.

El acceso a la Información se concede bajo el principio de **necesidad y propósito específico**, en el marco de las funciones asignadas a cada usuario.

---

## 3. Responsabilidad del usuario

El usuario que accede a la Información se compromete a:

* Utilizarla de manera responsable, ética y conforme a la normativa vigente.
* Proteger credenciales de acceso y evitar su uso indebido.
* Reportar cualquier uso indebido, acceso no autorizado o incidente de seguridad.

El usuario es responsable por cualquier uso indebido derivado de su accionar o negligencia.

---

## 4. Propiedad de la información

Toda la Información, así como los modelos, metodologías, desarrollos, estructuras de datos y procesos asociados, son propiedad exclusiva de Libgot.

El acceso a la Información **no implica cesión de derechos de propiedad intelectual ni de uso comercial**.

---

## 5. Seguridad y monitoreo

Libgot se reserva el derecho de:

* Monitorear el acceso y uso de la Información.
* Auditar actividades dentro de sus plataformas.
* Restringir, suspender o revocar accesos ante incumplimientos.

---

## 6. Incumplimientos

El incumplimiento de estos términos podrá dar lugar a:

* Sanciones internas disciplinarias.
* Acciones legales conforme a la normativa aplicable.
* Revocación inmediata de accesos a los sistemas.

---

## 7. Aceptación

El acceso y uso de la Información implica la aceptación plena de los presentes Términos y Condiciones.

---

**Libgot – Área de Datos y Riesgos**`;

export const TermsModal = ({ isOpen, onClose }: TermsModalProps) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-slate-950/80 backdrop-blur-md"
          />
          
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative w-full max-w-4xl max-h-[90vh] bg-slate-900 border border-slate-800 rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col"
          >
            <div className="p-6 border-b border-slate-800 flex items-center justify-between bg-slate-900/50 backdrop-blur-sm sticky top-0 z-10">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-600/20 rounded-xl flex items-center justify-center text-blue-500">
                  <FileText size={20} />
                </div>
                <div>
                  <h3 className="text-white font-bold tracking-tight">Términos y Condiciones</h3>
                  <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest">Área de Datos y Riesgos</p>
                </div>
              </div>
              <button 
                onClick={onClose}
                className="p-2 hover:bg-slate-800 rounded-xl text-zinc-500 transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-8 sm:p-12 scrollbar-thin scrollbar-thumb-slate-800">
              <div className="prose prose-invert prose-blue max-w-none">
                <div className="markdown-body">
                  <ReactMarkdown>{termsText}</ReactMarkdown>
                </div>
              </div>
            </div>
            
            <div className="p-6 border-t border-slate-800 bg-slate-900/50 flex justify-end">
              <button 
                onClick={onClose}
                className="px-8 py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-2xl transition-all shadow-lg shadow-blue-900/20"
              >
                Entendido
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
