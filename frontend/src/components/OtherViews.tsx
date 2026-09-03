import { useRef } from 'react';
import { Activity, ShieldCheck, Clock, Lock, HardDrive, ImageUp, Trash2, RotateCcw, KeyRound } from 'lucide-react';
import { ActivityLog, UserProfile } from '../types';
import { Logo } from './Logo';

interface ActivityViewProps {
  logs: ActivityLog[];
}

export function ActivityView({ logs }: ActivityViewProps) {
  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-white/80 bg-white/70 backdrop-blur-xl p-6 shadow-xl shadow-slate-200/40">
        <div className="flex items-center justify-between border-b border-slate-100/80 pb-4">
          <div>
            <h2 className="text-lg font-extrabold text-slate-900">Registro de Actividad y Auditoría</h2>
            <p className="text-xs text-slate-500 font-medium">Trazabilidad de accesos y consultas a portales institucionales</p>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50/80 px-3 py-1 text-xs font-bold text-indigo-700 border border-indigo-200/60 shadow-2xs">
            <ShieldCheck className="h-3.5 w-3.5 text-indigo-600" />
            Auditoría Activa
          </span>
        </div>

        <div className="mt-4 divide-y divide-slate-100/70">
          {logs.length === 0 ? (
            <p className="py-8 text-center text-xs text-slate-400 italic">No hay eventos registrados todavía.</p>
          ) : (
            logs.map((log) => (
              <div key={log.id} className="flex flex-col sm:flex-row sm:items-center justify-between py-3.5 text-xs gap-2">
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/90 border border-slate-200/60 text-slate-700 mt-0.5 shadow-2xs">
                    <Activity className="h-4 w-4 text-indigo-600" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900">{log.portalName || 'Sistema'}</span>
                      <span className="rounded-lg bg-slate-100/80 px-2 py-0.5 text-[10px] font-bold text-slate-600 border border-slate-200/50">{log.action}</span>
                    </div>
                    <p className="text-slate-500 text-[11px] mt-0.5 font-normal">
                      Realizado por <span className="font-bold text-slate-700">{log.user}</span> desde <span className="font-mono font-semibold text-slate-600">{log.ipAddress}</span>
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 text-slate-400 text-[11px] pl-12 sm:pl-0 font-medium">
                  <Clock className="h-3.5 w-3.5 text-slate-400" />
                  <span>{log.timestamp}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

interface UsersViewProps {
  users: UserProfile[];
  onResetMfa: (user: UserProfile) => void;
}

export function UsersView({ users, onResetMfa }: UsersViewProps) {
  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-white/80 bg-white/70 backdrop-blur-xl p-6 shadow-xl shadow-slate-200/40">
        <div className="flex items-center justify-between border-b border-slate-100/80 pb-4">
          <div>
            <h2 className="text-lg font-extrabold text-slate-900">Usuarios Autorizados</h2>
            <p className="text-xs text-slate-500 font-medium">Personal con permisos de consulta y administración en el catálogo</p>
          </div>
          <span className="text-xs font-bold text-slate-500 bg-slate-100/80 px-3 py-1 rounded-full border border-slate-200/60">Total: {users.length}</span>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200/60 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                <th className="pb-3 pr-4">Usuario / Correo</th>
                <th className="pb-3 px-4">Rol</th>
                <th className="pb-3 px-4">Departamento</th>
                <th className="pb-3 px-4">MFA</th>
                <th className="pb-3 pl-4 text-right">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100/70 text-slate-700">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-white/60 transition-colors">
                  <td className="py-3.5 pr-4">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-200/80 text-slate-800 font-bold text-xs shadow-2xs border border-white">
                        {u.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <div className="font-bold text-slate-900">{u.name}</div>
                        <div className="text-slate-400 text-[11px] font-mono font-medium">{u.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="py-3.5 px-4">
                    <span
                      className={`inline-block rounded-lg px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider ${
                        u.role === 'Administrador' ? 'bg-indigo-50 text-indigo-700 border border-indigo-200/60' : 'bg-slate-100/80 text-slate-700 border border-slate-200/60'
                      }`}
                    >
                      {u.role}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-slate-600 font-medium">{u.department}</td>
                  <td className="py-3.5 px-4">
                    {u.mfaEnabled ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700">
                        <ShieldCheck className="h-3.5 w-3.5" /> Configurado
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-400">
                        <KeyRound className="h-3.5 w-3.5" /> Sin configurar
                      </span>
                    )}
                  </td>
                  <td className="py-3.5 pl-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-emerald-700 bg-emerald-50/80 px-2.5 py-0.5 rounded-full border border-emerald-200/60">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        {u.status}
                      </span>
                      {u.mfaEnabled && (
                        <button
                          type="button"
                          onClick={() => onResetMfa(u)}
                          title="Resetear MFA de este usuario"
                          className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-700 hover:text-rose-800 bg-rose-50 hover:bg-rose-100 border border-rose-200 px-2 py-1 rounded-lg transition-colors cursor-pointer"
                        >
                          <RotateCcw className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

interface SettingsViewProps {
  onUpdateLogo: (dataUrl: string | null) => void;
  logoRefreshKey: number;
  onShowToast: (type: 'success' | 'info' | 'warning', title: string, message?: string) => void;
}

const MAX_LOGO_BYTES = 500 * 1024;
const ALLOWED_LOGO_TYPES = ['image/png', 'image/jpeg', 'image/svg+xml'];

export function SettingsView({ onUpdateLogo, logoRefreshKey, onShowToast }: SettingsViewProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleLogoFile = (file: File) => {
    if (!ALLOWED_LOGO_TYPES.includes(file.type)) {
      onShowToast('warning', 'Formato no soportado', 'Use PNG, JPG o SVG.');
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      onShowToast('warning', 'Imagen demasiado grande', 'El logo debe pesar menos de 500KB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') onUpdateLogo(reader.result);
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-white/80 bg-white/70 backdrop-blur-xl p-6 shadow-xl shadow-slate-200/40">
        <div className="border-b border-slate-100/80 pb-4">
          <h2 className="text-lg font-extrabold text-slate-900">Configuración del Entorno</h2>
          <p className="text-xs text-slate-500 font-medium">Parámetros técnicos de la red y catálogo institucional</p>
        </div>

        <div className="mt-5 space-y-4 text-xs">
          <div className="rounded-2xl border border-slate-200/60 bg-white/60 backdrop-blur-xs p-5">
            <h3 className="font-extrabold text-slate-900 text-sm flex items-center gap-2">
              <ImageUp className="h-4 w-4 text-indigo-600" />
              Logo institucional
            </h3>
            <p className="text-slate-600 mt-1 font-normal">Se muestra en el login y en la barra lateral. PNG, JPG o SVG, máx. 500KB.</p>
            <div className="mt-3.5 flex items-center gap-4">
              <Logo size={56} refreshKey={logoRefreshKey} />
              <div className="flex items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/svg+xml"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleLogoFile(file);
                    e.target.value = '';
                  }}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-2 text-xs font-bold text-white shadow-lg shadow-indigo-500/25 hover:bg-indigo-700 transition-all cursor-pointer"
                >
                  <ImageUp className="h-3.5 w-3.5" />
                  <span>Subir logo</span>
                </button>
                <button
                  type="button"
                  onClick={() => onUpdateLogo(null)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 transition-all cursor-pointer"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>Quitar</span>
                </button>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200/60 bg-white/60 backdrop-blur-xs p-5">
            <h3 className="font-extrabold text-slate-900 text-sm flex items-center gap-2">
              <HardDrive className="h-4 w-4 text-emerald-600" />
              Parámetros de Red: Entorno Local
            </h3>
            <p className="text-slate-600 mt-1 font-normal">Los portales registrados resuelven contra los servidores DNS internos de la infraestructura local.</p>
            <div className="mt-3.5 grid grid-cols-1 sm:grid-cols-2 gap-2.5 font-mono text-[11px]">
              <div className="rounded-xl bg-white/80 p-3 border border-slate-200/60 shadow-2xs">
                <span className="text-slate-400 block text-[10px] uppercase font-sans font-bold tracking-wider mb-0.5">Dominio Local:</span>
                <span className="font-bold text-slate-800">*.demo.local</span>
              </div>
              <div className="rounded-xl bg-white/80 p-3 border border-slate-200/60 shadow-2xs">
                <span className="text-slate-400 block text-[10px] uppercase font-sans font-bold tracking-wider mb-0.5">Modo de sesión:</span>
                <span className="font-bold text-slate-800">MFA obligatorio (TOTP)</span>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200/60 bg-white/60 backdrop-blur-xs p-5">
            <h3 className="font-extrabold text-slate-900 text-sm flex items-center gap-2">
              <Lock className="h-4 w-4 text-indigo-600" />
              Bóveda de contraseñas
            </h3>
            <p className="text-slate-600 mt-1 leading-relaxed font-normal">
              Las contraseñas de portal se cifran en el servidor (Encrypt-then-MAC con HMAC-SHA256) y solo se descifran bajo demanda desde cada tarjeta de portal. Cada
              revelación queda auditada en el módulo de Actividad.
            </p>
            <div className="mt-3.5 flex items-center gap-2 text-slate-600 font-semibold bg-emerald-50/70 border border-emerald-200/60 rounded-xl px-3.5 py-2">
              <span className="inline-flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>Estado: cifrado activo.</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
