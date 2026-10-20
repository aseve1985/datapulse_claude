// src/components/ui/DualScroll.tsx
// Scrollbar horizontal duplicada arriba y abajo de una tabla ancha, sincronizadas
// entre sí — el usuario puede arrastrar cualquiera de las dos. Extraído de la
// implementación repetida en varios submodules (MktComunicaciones, UIF, Operadores
// de Ventas, Admin Gastos, BCRA Tasas) para no seguir duplicándola.
import { useEffect, useRef, type ReactNode } from 'react';

export default function DualScroll({ children, maxHeight = '60vh' }: { children: ReactNode; maxHeight?: string }) {
  const topRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const syncing = useRef(false);

  useEffect(() => {
    const body = bodyRef.current;
    const top = topRef.current;
    if (!body || !top) return;

    const measure = () => {
      const inner = top.querySelector('div') as HTMLDivElement | null;
      if (inner) inner.style.minWidth = `${body.scrollWidth}px`;
      top.style.marginRight = `${body.offsetWidth - body.clientWidth}px`;
    };

    const ro = new ResizeObserver(measure);
    ro.observe(body);
    measure();
    return () => ro.disconnect();
  }, []); // runs once; ResizeObserver handles subsequent size changes

  const onTop = () => {
    if (syncing.current || !bodyRef.current || !topRef.current) return;
    syncing.current = true;
    bodyRef.current.scrollLeft = topRef.current.scrollLeft;
    syncing.current = false;
  };
  const onBody = () => {
    if (syncing.current || !topRef.current || !bodyRef.current) return;
    syncing.current = true;
    topRef.current.scrollLeft = bodyRef.current.scrollLeft;
    syncing.current = false;
  };

  return (
    <div>
      <div
        ref={topRef}
        onScroll={onTop}
        className="overflow-x-auto overflow-y-hidden [&::-webkit-scrollbar]:h-3 [&::-webkit-scrollbar-thumb]:rounded [&::-webkit-scrollbar-thumb]:bg-blue-500 [&::-webkit-scrollbar-track]:bg-slate-800"
      >
        <div style={{ height: '1px' }} />
      </div>
      <div
        ref={bodyRef}
        onScroll={onBody}
        style={{ maxHeight }}
        className="overflow-x-auto overflow-y-auto [&::-webkit-scrollbar]:h-3 [&::-webkit-scrollbar-thumb]:rounded [&::-webkit-scrollbar-thumb]:bg-blue-500 [&::-webkit-scrollbar-track]:bg-slate-800"
      >
        {children}
      </div>
    </div>
  );
}
