import { useState } from 'react';
import { X, ExternalLink, Copy, Check, Globe, AppWindow, AlertCircle, Eye, ToggleLeft, ToggleRight, Lock } from 'lucide-react';
import { Portal, UserRole } from '../types';

interface PortalDetailsModalProps {
  portal: Portal | null;
  isOpen: boolean;
  onClose: () => void;
  onCopyUser: (user: string, portalName: string) => void;
  onCopyPassword: (portal: Portal) => Promise<string | null>;
  currentUserRole?: UserRole;
  onToggleStatus?: (portal: Portal) => void;
}

export function PortalDetailsModal({ portal, isOpen, onClose, onCopyUser, onCopyPassword, currentUserRole = 'Auditor', onToggleStatus }: PortalDetailsModalProps) {
  const [copiedUser, setCopiedUser] = useState(false);
  const [copiedPassword, setCopiedPassword] = useState(false);
  const [revealingPassword, setRevealingPassword] = useState(false);

  if (!isOpen || !portal) return null;

  const isAdmin = currentUserRole === 'Administrador';

  const handleCopyUser = () => {
    navigator.clipboard.writeText(portal.username);
    setCopiedUser(true);
    onCopyUser(portal.username, portal.name);
    setTimeout(() => setCopiedUser(false), 2000);
  };

  const handleCopyPassword = async () => {
    setRevealingPassword(true);
    const password = await onCopyPassword(portal);
    setRevealingPassword(false);
    if (!password) return;
    navigator.clipboard.writeText(password);
    setCopiedPassword(true);
    setTimeout(() => setCopiedPassword(false), 2000);
  };

  const isWordpress = portal.category === 'WordPress';
  const isActive = portal.status === 'Activo';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity" onClick={onClose} />

      <div
        id="modal-portal-details"
        className="relative w-full max-w-xl rounded-3xl border border-white/80 bg-white/95 backdrop-blur-2xl p-6 sm:p-7 shadow-2xl z-10 animate-in fade-in zoom-in-95 duration-150"
      >
        <div className="flex items-start justify-between border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <div
              className={`flex h-12 w-12 items-center justify-center rounded-2xl border ${
                isWordpress ? 'bg-blue-50 text-blue-600 border-blue-100' : 'bg-purple-50 text-purple-600 border-purple-100'
              } shadow-2xs`}
            >
              {isWordpress ? <Globe className="h-6 w-6" /> : <AppWindow className="h-6 w-6" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-extrabold text-slate-900">{portal.name}</h2>
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider border ${
                    isActive ? 'bg-emerald-50/90 text-emerald-700 border-emerald-200/80' : 'bg-slate-100/90 text-slate-500 border-slate-200/80'
                  }`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${isActive ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
                  {portal.status}
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium">{portal.department || 'Servicio de Infraestructura TI'}</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors cursor-pointer">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-5 space-y-4 text-xs">
          {portal.description && (
            <div className="rounded-xl bg-slate-50/70 p-3.5 text-slate-700 leading-relaxed border border-slate-200/60 font-normal">{portal.description}</div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="rounded-xl border border-slate-200/70 p-3 bg-white/70">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">URL de Conexión</span>
              <span className="font-mono text-xs text-indigo-700 font-bold truncate block mt-1">{portal.url}</span>
            </div>

            <div className="rounded-xl border border-slate-200/70 p-3 bg-white/70">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Usuario de acceso</span>
              <div className="flex items-center justify-between mt-1">
                <span className="font-mono text-xs text-slate-900 font-bold">{portal.username}</span>
                <button onClick={handleCopyUser} className="text-indigo-600 hover:text-indigo-800 text-[11px] font-bold flex items-center gap-1 transition-colors cursor-pointer">
                  {copiedUser ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                  <span>{copiedUser ? 'Copiado' : 'Copiar'}</span>
                </button>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200/70 bg-slate-50/60 p-4 space-y-2.5">
            <div className="flex items-center justify-between text-slate-600">
              <span className="text-slate-400 font-medium">Categoría del sistema:</span>
              <span className="font-bold text-slate-900">{portal.category}</span>
            </div>
            <div className="flex items-center justify-between text-slate-600">
              <span className="text-slate-400 font-medium">Contraseña revelada:</span>
              <span className="inline-flex items-center gap-1 font-bold text-indigo-600">
                <Eye className="h-3.5 w-3.5" />
                {portal.revealCount || 0} veces
              </span>
            </div>
            <div className="flex items-center justify-between text-slate-600">
              <span className="text-slate-400 font-medium">Contraseña guardada:</span>
              {portal.hasPassword ? (
                <button onClick={handleCopyPassword} disabled={revealingPassword} className="inline-flex items-center gap-1 font-bold text-indigo-600 hover:text-indigo-800 transition-colors cursor-pointer disabled:opacity-60">
                  {copiedPassword ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Lock className="h-3.5 w-3.5" />}
                  <span>{copiedPassword ? 'Copiada' : revealingPassword ? 'Revelando...' : 'Copiar contraseña'}</span>
                </button>
              ) : (
                <span className="text-slate-400 font-semibold">Sin contraseña guardada</span>
              )}
            </div>
          </div>

          <div className="flex items-start gap-2.5 rounded-xl border border-indigo-200/80 bg-indigo-50/60 p-3 text-indigo-900">
            <AlertCircle className="h-4 w-4 shrink-0 text-indigo-600 mt-0.5" />
            <p className="text-[11px] leading-relaxed text-indigo-800 font-normal">
              Las URLs con sufijo <code className="font-mono font-bold text-indigo-950">.local</code> corresponden a resoluciones DNS de la intranet institucional. Revelar la
              contraseña de este portal queda registrado en el módulo de Actividad.
            </p>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-5">
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="rounded-xl border border-slate-200 bg-white/80 px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-white transition-all shadow-2xs cursor-pointer">
              Cerrar
            </button>

            {isAdmin && onToggleStatus && (
              <button
                type="button"
                onClick={() => onToggleStatus(portal)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-all cursor-pointer"
              >
                {isActive ? <ToggleRight className="h-4 w-4 text-emerald-600" /> : <ToggleLeft className="h-4 w-4 text-slate-400" />}
                <span>{isActive ? 'Desactivar portal' : 'Activar portal'}</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <a
              href={portal.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-xs font-bold text-white shadow-lg shadow-indigo-500/25 hover:bg-indigo-700 transition-all cursor-pointer"
            >
              <span>Abrir en nueva pestaña</span>
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
