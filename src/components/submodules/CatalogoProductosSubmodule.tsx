import { useState } from 'react';
import { Package, Clock } from 'lucide-react';
import { catalogoProductos, type PaisCatalogo } from '../../data/catalogoProductosArg';

function cn(...inputs: (string | false | null | undefined)[]) {
  return inputs.filter(Boolean).join(' ');
}

type Seccion = 'nuevos' | 'renovadores' | 'tasas' | 'punitorios' | 'notas';

const SECCIONES: { id: Seccion; label: string }[] = [
  { id: 'nuevos', label: 'Nuevos' },
  { id: 'renovadores', label: 'Renovadores' },
  { id: 'tasas', label: 'Tasas' },
  { id: 'punitorios', label: 'Punitorios y Cobranza' },
  { id: 'notas', label: 'Notas' },
];

function Card({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
      {title && <h3 className="text-sm font-bold text-white">{title}</h3>}
      {children}
    </div>
  );
}

function Table({ headers, rows }: { headers: string[]; rows: (string | React.ReactNode)[][] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-800">
      <table className="w-full text-left border-collapse">
        <thead className="bg-slate-800">
          <tr>
            {headers.map((h, i) => (
              <th key={i} className="px-4 py-2.5 text-[10px] font-bold text-zinc-400 uppercase tracking-wider whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800">
          {rows.map((row, i) => (
            <tr key={i} className="hover:bg-slate-800/50 transition-colors">
              {row.map((cell, j) => (
                <td key={j} className="px-4 py-2.5 text-xs text-zinc-300 whitespace-nowrap">{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Resumen({ text }: { text: string }) {
  return (
    <p className="text-xs text-blue-200 bg-blue-950/30 border border-blue-900/40 rounded-xl p-4 leading-relaxed">
      {text}
    </p>
  );
}

function NuevosSeccion({ data }: { data: NonNullable<ReturnType<typeof getDatos>['nuevos']> }) {
  return (
    <div className="space-y-6">
      <Card title={`Política vigente: ${data.politicaVigente}`}>
        <div className="space-y-3">
          <p className="text-xs text-zinc-500">{data.principal.descripcion}</p>
          <Table
            headers={['Situación BCRA', 'Prob. de mora (ML)', 'Máximo ofrecido']}
            rows={data.principal.tabla.map(r => [r.situacionBcra, r.probMora, r.maximo])}
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-zinc-400">
            <p><span className="font-bold text-zinc-300">Tope absoluto:</span> {data.principal.topeAbsoluto}</p>
            <p><span className="font-bold text-zinc-300">Tope situación BCRA = 2:</span> {data.principal.topeSituacion2}</p>
          </div>
          <p className="text-xs text-zinc-400"><span className="font-bold text-zinc-300">Regla de corte:</span> {data.principal.reglaCorte}</p>
        </div>
      </Card>

      <Card title={data.fallback.titulo}>
        <div className="space-y-3">
          <p className="text-xs text-zinc-500">{data.fallback.descripcion}</p>
          <Table
            headers={['Caso', 'Monto']}
            rows={data.fallback.montos.map(r => [r.caso, <span className="font-bold text-zinc-200">{r.monto}</span>])}
          />
        </div>
      </Card>

      <Resumen text={data.resumen} />
    </div>
  );
}

function RenovadoresSeccion({ data }: { data: NonNullable<ReturnType<typeof getDatos>['renovadores']> }) {
  return (
    <div className="space-y-6">
      <Card title={data.politica}>
        <div className="space-y-3">
          <p className="text-xs text-zinc-500">{data.descripcion}</p>
          <Table
            headers={['Renovación', 'Rates', 'Multiplicador', 'Monto mínimo', 'Monto máximo', 'Plazo']}
            rows={data.tabla.map(r => [r.renovacion, r.rates, r.multiplicador, r.montoMinimo ?? '—', r.montoMaximo, r.plazo])}
          />
        </div>
      </Card>
      <Resumen text={data.resumen} />
    </div>
  );
}

function TasasSeccion({ nuevos, renovadores }: { nuevos: NonNullable<ReturnType<typeof getDatos>['tasasNuevos']>; renovadores: NonNullable<ReturnType<typeof getDatos>['tasasRenovadores']> }) {
  return (
    <div className="space-y-6">
      <Card title={`Nuevos — ${nuevos.producto}`}>
        <div className="space-y-3">
          <Table
            headers={['Tramo (día)', 'Default', 'Producto máx. sit. BCRA 2', 'Producto sin info. laboral']}
            rows={nuevos.tramos.map(r => [r.tramo, r.default, r.sitBcra2, r.sinInfoLaboral])}
          />
          <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider pt-2">Otros productos Nuevos (plazo 6)</p>
          <Table
            headers={['Producto', 'Tasa']}
            rows={nuevos.otrosProductos.map(r => [r.producto, r.tasa])}
          />
          <p className="text-xs text-zinc-400"><span className="font-bold text-zinc-300">Bonificación:</span> {nuevos.bonificacion}</p>
        </div>
      </Card>

      <Card title="Renovadores — decodificación y tasas">
        <div className="space-y-3">
          <p className="text-xs text-zinc-500">Código de producto <span className="font-mono text-zinc-300">{renovadores.codigoFormato}</span></p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">X = nivel de renovación</p>
              {renovadores.nivelRenovacion.map((r, i) => (
                <p key={i} className="text-xs text-zinc-400">{r.codigo} → {r.nivel}</p>
              ))}
            </div>
            <div className="space-y-1">
              <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Y = comportamiento de pago</p>
              {renovadores.comportamientoPago.map((r, i) => (
                <p key={i} className="text-xs text-zinc-400">{r.codigo} → {r.descripcion}</p>
              ))}
            </div>
          </div>
          <p className="text-xs text-zinc-500">{renovadores.legacy}</p>

          <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider pt-2">Tasa a plazo 1, por nivel de renovación y comportamiento de pago</p>
          <Table
            headers={['Renovación', 'Y=1 (CVU sin mora)', 'Y=2 (CVU ≤8d mora)', 'Y=3 (débito/otro ≤8d mora)', 'Y=4 (>8d, hasta 40d mora)']}
            rows={renovadores.tasaPlazo1.map(r => [r.renovacion, r.y1, r.y2, r.y3, r.y4])}
          />

          <div className="space-y-1 pt-2">
            <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Plazos disponibles</p>
            {renovadores.plazosDisponibles.map((p, i) => (
              <p key={i} className="text-xs text-zinc-400">• {p}</p>
            ))}
          </div>

          <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider pt-2">Tasa de plazos extendidos (3/6/12/18)</p>
          <Table
            headers={['Plazo', 'Tasa', 'Tramo de monto']}
            rows={renovadores.tasaPlazosExtendidos.map(r => [r.plazo, r.tasa, r.tramoMonto])}
          />
          <p className="text-xs text-zinc-400">{renovadores.bonificacion}</p>
        </div>
      </Card>
    </div>
  );
}

function getDatos(pais: PaisCatalogo) {
  return catalogoProductos[pais];
}

export default function CatalogoProductosSubmodule() {
  const [pais, setPais] = useState<PaisCatalogo>('ARG');
  const [seccion, setSeccion] = useState<Seccion>('nuevos');
  const datos = getDatos(pais);

  return (
    <div className="space-y-6 p-1">
      {/* Header + selector de país */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Package className="w-4 h-4 text-blue-400" />
            Catálogo de Productos
          </h2>
          {datos.disponible && (
            <p className="text-xs text-zinc-500 mt-0.5">
              Teórico / vigente en política · Última actualización {datos.ultimaActualizacion}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1 bg-slate-800 rounded-lg p-1">
          {(['ARG', 'COL'] as PaisCatalogo[]).map(p => (
            <button
              key={p}
              onClick={() => setPais(p)}
              className={cn('px-4 py-1 text-xs font-bold rounded-md transition-all', pais === p ? 'bg-slate-700 text-blue-400' : 'text-zinc-500 hover:text-zinc-300')}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {!datos.disponible ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 min-h-[40vh] text-center">
          <Clock className="w-10 h-10 text-zinc-600" />
          <div>
            <p className="text-zinc-300 text-sm font-bold">Próximamente</p>
            <p className="text-zinc-500 text-xs mt-1">Todavía no tenemos el catálogo de productos de {pais} cargado.</p>
          </div>
        </div>
      ) : (
        <>
          {/* Selector de sección */}
          <div className="flex flex-wrap items-center gap-1 bg-slate-800 rounded-lg p-1 w-fit">
            {SECCIONES.map(s => (
              <button
                key={s.id}
                onClick={() => setSeccion(s.id)}
                className={cn('px-4 py-1.5 text-xs font-bold rounded-md transition-all', seccion === s.id ? 'bg-slate-700 text-blue-400' : 'text-zinc-500 hover:text-zinc-300')}
              >
                {s.label}
              </button>
            ))}
          </div>

          {seccion === 'nuevos' && datos.nuevos && <NuevosSeccion data={datos.nuevos} />}
          {seccion === 'renovadores' && datos.renovadores && <RenovadoresSeccion data={datos.renovadores} />}
          {seccion === 'tasas' && datos.tasasNuevos && datos.tasasRenovadores && (
            <TasasSeccion nuevos={datos.tasasNuevos} renovadores={datos.tasasRenovadores} />
          )}
          {seccion === 'punitorios' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Card title="Punitorios">
                <p className="text-xs text-zinc-400">{datos.punitorios}</p>
              </Card>
              <Card title="Gastos de Cobranza">
                <p className="text-xs text-zinc-400">{datos.gastosCobranza}</p>
              </Card>
            </div>
          )}
          {seccion === 'notas' && datos.notas && (
            <Card title="Notas">
              <div className="space-y-2">
                {datos.notas.map((n, i) => (
                  <p key={i} className="text-xs text-zinc-400">• {n}</p>
                ))}
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
