import { ShieldAlert, Lock } from 'lucide-react';

export function SecurityBanner() {
  return (
    <div
      id="security-notice-banner"
      className="relative overflow-hidden rounded-2xl border border-emerald-200/70 bg-emerald-50/60 backdrop-blur-md p-4 text-emerald-950 shadow-xs"
    >
      <div className="flex items-start gap-3.5">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100/90 text-emerald-700 border border-emerald-200/80 shadow-2xs">
          <ShieldAlert className="h-5 w-5" />
        </div>

        <div className="flex-1 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-bold text-emerald-900 uppercase tracking-wide text-[10px] rounded-md bg-emerald-200/70 px-2 py-0.5 border border-emerald-300/40">
              Aviso de Seguridad TI
            </span>
            <span className="font-bold text-slate-800 text-sm">Las contraseñas se guardan cifradas en el servidor</span>
          </div>
          <p className="mt-1 text-slate-600 leading-relaxed max-w-4xl font-normal">
            Este catálogo centraliza identificadores, enlaces y contraseñas de acceso institucional. Las contraseñas nunca se muestran en el listado; solo se descifran bajo demanda al presionar "Copiar contraseña", y cada revelación queda registrada en el módulo de Actividad.
          </p>
        </div>

        <div className="hidden sm:flex shrink-0 items-center">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-800 bg-white/70 backdrop-blur-xs border border-emerald-200/80 px-3 py-1.5 rounded-xl shadow-2xs">
            <Lock className="h-3 w-3 text-emerald-700" />
            Cifrado activo
          </span>
        </div>
      </div>
    </div>
  );
}
