import { Eye, CheckCircle2, Globe, AppWindow } from 'lucide-react';

interface MetricsPanelProps {
  totalVisible: number;
  wordPressCount: number;
  appsCount: number;
  activeCount: number;
}

export function MetricsPanel({ totalVisible, wordPressCount, appsCount, activeCount }: MetricsPanelProps) {
  const metrics = [
    {
      id: 'metric-visible',
      label: 'Registros visibles',
      value: totalVisible,
      description: 'Filtrados en vista actual',
      icon: Eye,
      barColor: 'bg-indigo-500',
      iconBg: 'bg-indigo-50 text-indigo-600 border-indigo-100',
    },
    {
      id: 'metric-wordpress',
      label: 'Portales WordPress',
      value: wordPressCount,
      description: 'CMS y portales web',
      icon: Globe,
      barColor: 'bg-blue-400',
      iconBg: 'bg-blue-50 text-blue-600 border-blue-100',
    },
    {
      id: 'metric-apps',
      label: 'Aplicaciones',
      value: appsCount,
      description: 'Sistemas y consolas',
      icon: AppWindow,
      barColor: 'bg-purple-400',
      iconBg: 'bg-purple-50 text-purple-600 border-purple-100',
    },
    {
      id: 'metric-active',
      label: 'Portales activos',
      value: activeCount,
      description: 'Operativos en red local',
      icon: CheckCircle2,
      barColor: 'bg-emerald-400',
      iconBg: 'bg-emerald-50 text-emerald-600 border-emerald-100',
    },
  ];

  return (
    <section id="metrics-panel" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
      {metrics.map((item) => {
        const Icon = item.icon;
        return (
          <div
            key={item.id}
            id={item.id}
            className="group relative overflow-hidden rounded-2xl border border-white/60 bg-white/60 backdrop-blur-md p-5 shadow-xs transition-all hover:bg-white/80 hover:shadow-md hover:border-white"
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[11px] font-bold tracking-wider uppercase text-slate-400 mb-1">{item.label}</p>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="text-3xl font-black tracking-tight text-slate-900">{item.value}</span>
                </div>
                <div className={`w-8 h-1 ${item.barColor} mt-2.5 rounded-full transition-all group-hover:w-12`} />
                <p className="mt-2 text-[11px] text-slate-500 font-medium">{item.description}</p>
              </div>
              <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border ${item.iconBg} transition-all group-hover:scale-105 shadow-2xs`}>
                <Icon className="h-5 w-5" />
              </div>
            </div>
          </div>
        );
      })}
    </section>
  );
}
