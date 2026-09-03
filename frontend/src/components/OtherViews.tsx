import { useRef, useState } from 'react';
import { Activity, ShieldCheck, Clock, Lock, HardDrive, ImageUp, Trash2, RotateCcw, KeyRound, Upload, AlertTriangle } from 'lucide-react';
import { ActivityLog, UserProfile, SystemInfo } from '../types';
import { Logo } from './Logo';

interface ActivityViewProps {
  logs: ActivityLog[];
}

export function ActivityView({ logs }: ActivityViewProps) {
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(logs.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const visibleLogs = logs.slice((currentPage - 1) * pageSize, currentPage * pageSize);

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

        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-xl border border-slate-200/60 bg-white/60 px-3.5 py-2.5 text-xs">
          <span className="font-medium text-slate-500">{logs.length} registros disponibles</span>
          <label className="flex items-center gap-2 font-semibold text-slate-600">
            Mostrar
            <select
              value={pageSize}
              onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }}
              className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-bold text-slate-700 outline-none focus:border-indigo-400"
            >
              {[10, 20, 50, 100].map((size) => <option key={size} value={size}>{size}</option>)}
            </select>
            por página
          </label>
        </div>

        <div className="mt-4 divide-y divide-slate-100/70">
          {visibleLogs.length === 0 ? (
            <p className="py-8 text-center text-xs text-slate-400 italic">No hay eventos registrados todavía.</p>
          ) : (
            visibleLogs.map((log) => (
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

        {logs.length > pageSize && (
          <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4 text-xs">
            <span className="font-medium text-slate-500">Página {currentPage} de {totalPages}</span>
            <div className="flex gap-2">
              <button type="button" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-bold text-slate-600 disabled:cursor-not-allowed disabled:opacity-40 hover:bg-slate-50">Anterior</button>
              <button type="button" disabled={currentPage === totalPages} onClick={() => setPage(currentPage + 1)} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-bold text-slate-600 disabled:cursor-not-allowed disabled:opacity-40 hover:bg-slate-50">Siguiente</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

interface UsersViewProps {
  users: UserProfile[];
  onResetMfa: (user: UserProfile) => void;
  onChangeOwnPassword: () => void;
}

export function UsersView({ users, onResetMfa, onChangeOwnPassword }: UsersViewProps) {
  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-white/80 bg-white/70 backdrop-blur-xl p-6 shadow-xl shadow-slate-200/40">
        <div className="flex items-center justify-between border-b border-slate-100/80 pb-4">
          <div>
            <h2 className="text-lg font-extrabold text-slate-900">Usuarios Autorizados</h2>
            <p className="text-xs text-slate-500 font-medium">Personal con permisos de consulta y administración en el catálogo</p>
          </div>
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onChangeOwnPassword}
              className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-2 text-xs font-bold text-white shadow-lg shadow-indigo-500/25 hover:bg-indigo-700 transition-all cursor-pointer"
            >
              <KeyRound className="h-3.5 w-3.5" />
              <span>Cambiar mi contraseña</span>
            </button>
            <span className="text-xs font-bold text-slate-500 bg-slate-100/80 px-3 py-1 rounded-full border border-slate-200/60">Total: {users.length}</span>
          </div>
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
  onDownloadBackup: () => void;
  onRestoreBackup: (file: File) => void;
  logoRefreshKey: number;
  onShowToast: (type: 'success' | 'info' | 'warning', title: string, message?: string) => void;
  systemInfo: SystemInfo | null;
}

const MAX_LOGO_BYTES = 500 * 1024;
const ALLOWED_LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];

export function SettingsView({ onUpdateLogo, onDownloadBackup, onRestoreBackup, logoRefreshKey, onShowToast, systemInfo }: SettingsViewProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const restoreInputRef = useRef<HTMLInputElement>(null);
  const [pendingRestore, setPendingRestore] = useState<File | null>(null);
  const restoreAvailable = systemInfo?.backups?.restoreAvailable ?? true;
  const restoreMaxMb = systemInfo?.backups?.maxUploadMb ?? 64;

  const handleLogoFile = (file: File) => {
    if (!ALLOWED_LOGO_TYPES.includes(file.type)) {
      onShowToast('warning', 'Formato no soportado', 'Use PNG, JPG, WebP o SVG.');
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
            <p className="text-slate-600 mt-1 font-normal">Se muestra en el login y en la barra lateral. PNG, JPG, WebP o SVG, máx. 500KB.</p>
            <div className="mt-3.5 flex items-center gap-4">
              <Logo size={56} refreshKey={logoRefreshKey} />
              <div className="flex items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
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
              <HardDrive className="h-4 w-4 text-emerald-600" /> Respaldo cifrado
            </h3>
            <p className="text-slate-600 mt-1 font-normal">Descarga el respaldo más reciente. Se solicitará MFA en cada descarga y quedará registrado en auditoría.</p>
            <button type="button" onClick={onDownloadBackup} className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white shadow-lg shadow-emerald-500/25 hover:bg-emerald-700 transition-all cursor-pointer">
              <HardDrive className="h-3.5 w-3.5" /><span>Descargar último respaldo</span>
            </button>

            <div className="mt-5 border-t border-slate-200/70 pt-4">
              <h4 className="font-bold text-slate-900 flex items-center gap-2"><Upload className="h-3.5 w-3.5 text-amber-600" /> Restaurar desde archivo</h4>
              <p className="text-slate-600 mt-1 font-normal">
                Sube un archivo <code className="font-mono">.enc</code> para reemplazar la base actual (usuarios, portales, auditoría). Las contraseñas en Vault no se tocan. Se pedirá MFA y se guardará una copia de la base actual antes de sobrescribir. Al terminar tu sesión se cierra y tendrás que volver a iniciar sesión.
              </p>
              <input
                ref={restoreInputRef}
                type="file"
                accept=".enc"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (!file) return;
                  if (file.size > restoreMaxMb * 1024 * 1024) {
                    onShowToast('warning', 'Archivo demasiado grande', `El respaldo no puede superar ${restoreMaxMb} MB.`);
                    return;
                  }
                  setPendingRestore(file);
                }}
              />
              {!pendingRestore ? (
                <button
                  type="button"
                  disabled={!restoreAvailable}
                  onClick={() => restoreInputRef.current?.click()}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 px-3.5 py-2 text-xs font-bold text-amber-800 hover:bg-amber-100 transition-all cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                  title={restoreAvailable ? undefined : 'El backend no tiene BACKUP_ENCRYPTION_KEY configurada'}
                >
                  <Upload className="h-3.5 w-3.5" /><span>Elegir archivo .enc</span>
                </button>
              ) : (
                <div className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-3.5">
                  <p className="flex items-start gap-2 font-semibold text-amber-900">
                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>Vas a reemplazar toda la base con <span className="font-mono">{pendingRestore.name}</span> ({(pendingRestore.size / 1024).toFixed(0)} KB). Esta acción no se puede deshacer (queda una copia previa automática).</span>
                  </p>
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={() => { const file = pendingRestore; setPendingRestore(null); onRestoreBackup(file); }}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-amber-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-amber-700 transition-all cursor-pointer"
                    >
                      <Upload className="h-3.5 w-3.5" /><span>Restaurar ahora</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setPendingRestore(null)}
                      className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 transition-all cursor-pointer"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200/60 bg-white/60 backdrop-blur-xs p-5">
            <h3 className="font-extrabold text-slate-900 text-sm flex items-center gap-2">
              <HardDrive className="h-4 w-4 text-emerald-600" />
              Parámetros de sesión y red
            </h3>
            <p className="text-slate-600 mt-1 font-normal">Valores reales con los que el backend está corriendo ahora mismo.</p>
            {systemInfo ? (
              <div className="mt-3.5 grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-[11px]">
                {[
                  ['Origen permitido (CORS)', systemInfo.session.corsOrigin],
                  ['Cookie de sesión', systemInfo.session.cookieSecure ? 'Secure — solo HTTPS' : 'Sin flag Secure (HTTP)'],
                  ['Duración de sesión', `${systemInfo.session.sessionTtlHours} h`],
                  ['Segundo factor', systemInfo.session.mfaAlgorithm],
                  ['Bloqueo de login', systemInfo.session.loginLockout],
                  ['Cabecera anti-CSRF', systemInfo.session.csrfHeader],
                  ['Límite por consulta', `${systemInfo.catalog.portalsLimit} portales`],
                  ['Usuarios activos', String(systemInfo.catalog.activeUsers)],
                ].map(([k, v]) => (
                  <div key={k} className="rounded-xl bg-white/80 p-3 border border-slate-200/60 shadow-2xs">
                    <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider mb-0.5">{k}:</span>
                    <span className="font-bold text-slate-800 font-mono break-all">{v}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-3.5 text-slate-400 italic text-[11px]">Cargando parámetros del entorno…</p>
            )}
          </div>

          <div className="rounded-2xl border border-slate-200/60 bg-white/60 backdrop-blur-xs p-5">
            <h3 className="font-extrabold text-slate-900 text-sm flex items-center gap-2">
              <Lock className="h-4 w-4 text-indigo-600" />
              Bóveda de contraseñas (HashiCorp Vault)
            </h3>
            <p className="text-slate-600 mt-1 leading-relaxed font-normal">
              Las contraseñas de portal no se guardan en la base local: viven cifradas en Vault y solo se descifran bajo demanda. Cada revelación queda auditada en Actividad.
            </p>
            {systemInfo ? (
              <>
                <div className="mt-3.5 grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-[11px]">
                  {[
                    ['Dirección', systemInfo.vault.address],
                    ['Ruta de secretos', systemInfo.vault.secretPath],
                    ['Motor', systemInfo.vault.engine],
                    ['Versión', systemInfo.vault.version ?? '—'],
                    ['Portales con contraseña', `${systemInfo.catalog.portalsWithPassword} de ${systemInfo.catalog.portalsTotal}`],
                    ['Revelaciones registradas', String(systemInfo.catalog.passwordReveals)],
                  ].map(([k, v]) => (
                    <div key={k} className="rounded-xl bg-white/80 p-3 border border-slate-200/60 shadow-2xs">
                      <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider mb-0.5">{k}:</span>
                      <span className="font-bold text-slate-800 font-mono break-all">{v}</span>
                    </div>
                  ))}
                </div>
                <div
                  className={`mt-3 flex items-center gap-2 font-semibold rounded-xl px-3.5 py-2 border ${
                    systemInfo.vault.reachable && systemInfo.vault.initialized && !systemInfo.vault.sealed
                      ? 'text-emerald-700 bg-emerald-50/70 border-emerald-200/60'
                      : 'text-amber-700 bg-amber-50/70 border-amber-200/60'
                  }`}
                >
                  <span
                    className={`inline-flex h-2 w-2 rounded-full ${
                      systemInfo.vault.reachable && systemInfo.vault.initialized && !systemInfo.vault.sealed ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'
                    }`}
                  />
                  <span>
                    {!systemInfo.vault.reachable
                      ? 'Vault no accesible desde el backend.'
                      : systemInfo.vault.sealed
                        ? 'Vault accesible pero sellado (secretos no disponibles).'
                        : systemInfo.vault.initialized
                          ? 'Vault operativo: inicializado y desellado.'
                          : 'Vault accesible pero sin inicializar.'}
                  </span>
                </div>
              </>
            ) : (
              <p className="mt-3.5 text-slate-400 italic text-[11px]">Consultando estado de Vault…</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
