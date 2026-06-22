import { useMemo } from 'react';

const FUNNEL_STEPS = [
  'risk_failed', 'pending_customer_approval', 'closed', 'signature_pending',
  'audit_pending', 'created', 'rejected', 'cancelled', 'audit_retry',
  'request_information', 'risk', 'risk_rejected', 'expired', 'accepted',
  'prefilter_rejected', 'audit_rejected', 'audit_approval', 'prefilter_failed',
  'pending_identification', 'validate_docs', 'phone_validation', 'card_pending',
  'card_confirmation', 'rejected_docs', 'accepted_docs', 'prefilter', 'manual_validation',
];

function toLabel(step: string) {
  return step.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

interface FunnelStep {
  step: string;
  label: string;
  count: number;
  pct: number | null;
}

function computeFunnel(records: any[], country: string, steps: string[]): FunnelStep[] {
  const filtered = records.filter(r => r.pais === country);
  const counts = steps
    .map(step => ({ step, count: filtered.reduce((sum, r) => sum + (Number(r[step]) || 0), 0) }))
    .filter(c => c.count > 0)
    .sort((a, b) => b.count - a.count);

  return counts.map((item, i) => ({
    step: item.step,
    label: toLabel(item.step),
    count: item.count,
    pct: i === 0 ? null : Math.round((item.count / counts[i - 1].count) * 1000) / 10,
  }));
}

function SingleFunnel({ data, title, accentColor }: { data: FunnelStep[]; title: string; accentColor: string }) {
  if (data.length === 0) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
        <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-4">{title}</p>
        <p className="text-zinc-600 text-sm text-center mt-8">Sin datos para el período seleccionado.</p>
      </div>
    );
  }

  const max = data[0].count;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
      <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-5">{title}</p>
      <div className="flex flex-col items-center gap-0.5">
        {data.map((step, i) => {
          const widthPct = Math.max(15, Math.round((step.count / max) * 100));
          return (
            <div key={step.step} className="w-full flex flex-col items-center">
              {i > 0 && step.pct !== null && (
                <div className="text-[10px] text-zinc-500 py-1.5">↓ {step.pct}%</div>
              )}
              <div className="w-full flex items-center justify-between mb-1 px-0.5">
                <span className="text-[11px] font-medium text-zinc-300">{step.label}</span>
                <span className="text-[11px] font-bold text-zinc-200 ml-3 shrink-0">
                  {step.count.toLocaleString('es-AR')}
                </span>
              </div>
              <div
                style={{ width: `${widthPct}%`, backgroundColor: accentColor }}
                className="h-3.5 rounded"
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function MarketingFunnelCharts({ records }: { records: any[] }) {
  const argData = useMemo(() => computeFunnel(records, 'ARG', FUNNEL_STEPS), [records]);
  const colData = useMemo(() => computeFunnel(records, 'COL', FUNNEL_STEPS), [records]);

  if (argData.length === 0 && colData.length === 0) return null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      <SingleFunnel data={argData} title="Funnel de Conversión — Argentina" accentColor="#1d4ed8" />
      <SingleFunnel data={colData} title="Funnel de Conversión — Colombia" accentColor="#0f766e" />
    </div>
  );
}
