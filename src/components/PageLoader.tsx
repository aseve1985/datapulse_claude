import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2 } from 'lucide-react';

interface PageLoaderProps {
  /** Mensaje principal. Si es un array, rota cada `rotateMs` milisegundos. */
  message: string | string[];
  subtitle?: string;
  rotateMs?: number;
  /**
   * false (default): cubre la pantalla por debajo del header del dashboard (z-30),
   * así el usuario puede seguir usando "volver" mientras carga.
   * true: cubre todo, header incluido (carga inicial / identidad / landing).
   */
  coverHeader?: boolean;
}

/**
 * Loader estándar de DataPulse para cargas de página/módulo.
 *
 * Se monta como overlay fijo centrado en el viewport (vía portal, para que ningún
 * ancestro con transform lo desplace) y tapa el contenido y el footer. Así el
 * spinner queda siempre en el medio de la pantalla y el usuario no confunde el
 * acceso a Power BI del footer con un paso que tiene que hacer.
 *
 * Para spinners chicos dentro de botones o paneles (insights, chat, exportar),
 * seguir usando <Loader2 /> inline — este componente es solo para "esperá que cargue".
 */
export default function PageLoader({ message, subtitle = 'Esperá un momento, estamos trayendo la información', rotateMs = 1800, coverHeader = false }: PageLoaderProps) {
  const messages = Array.isArray(message) ? message : [message];
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    setIdx(0);
    if (messages.length <= 1) return;
    const t = setInterval(() => setIdx(i => (i + 1) % messages.length), rotateMs);
    return () => clearInterval(t);
  }, [messages.length, rotateMs]); // eslint-disable-line react-hooks/exhaustive-deps

  const overlay = (
    <div
      role="status"
      aria-live="polite"
      className={`fixed inset-0 ${coverHeader ? 'z-50' : 'z-20'} bg-slate-950/90 backdrop-blur-sm flex flex-col items-center justify-center gap-6 px-6`}
    >
      <div className="relative w-16 h-16">
        <Loader2 className="w-16 h-16 animate-spin text-blue-500" />
        <div className="absolute inset-0 w-16 h-16 rounded-full bg-blue-500/10 animate-ping" />
      </div>
      <div className="text-center space-y-2 max-w-md">
        <p key={idx} className="text-white text-base font-semibold">{messages[idx % messages.length]}</p>
        {subtitle && <p className="text-zinc-500 text-xs">{subtitle}</p>}
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(overlay, document.body) : overlay;
}
