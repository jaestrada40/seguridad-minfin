import { useState, type MouseEvent } from 'react';
import { ExternalLink, Copy, Check, Lock, User, Globe, AppWindow, Info, Trash2, ToggleLeft, ToggleRight, Eye } from 'lucide-react';
import { Portal, UserRole } from '../types';

interface PortalCardProps {
  portal: Portal;
  currentUserRole: UserRole;
  onOpenPortal: (portal: Portal) => void;
  onCopyUser: (user: string, portalName: string) => void;
  onCopyPassword: (portal: Portal) => Promise<string | null>;
  onViewDetails: (portal: Portal) => void;
  onToggleStatus?: (portal: Portal) => void;
  onDeletePortal?: (portal: Portal) => void;
}

export function PortalCard({
  portal,
  currentUserRole,
  onOpenPortal,
  onCopyUser,
  onCopyPassword,
  onViewDetails,
  onToggleStatus,
  onDeletePortal,
}: PortalCardProps) {
  const [copiedUser, setCopiedUser] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedPassword, setCopiedPassword] = useState(false);
  const [revealingPassword, setRevealingPassword] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const isAdmin = currentUserRole === 'Administrador';

  const handleCopyUser = () => {
    navigator.clipboard.writeText(portal.username);
    setCopiedUser(true);
    onCopyUser(portal.username, portal.name);
    setTimeout(() => setCopiedUser(false), 2000);
  };

  const handleCopyUrl = (e: MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(portal.url);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 1800);
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
    <div
      id={`portal-card-${portal.id}`}
      className="group relative flex flex-col justify-between rounded-3xl border border-white/80 bg-white/80 backdrop-blur-xl p-6 shadow-xl shadow-slate-200/40 hover:shadow-2xl hover:shadow-indigo-100/50 hover:border-white transition-all"
    >
      <div>
        <div className="flex items-center justify-between mb-3 gap-2">
          <span
            id={`badge-cat-${portal.id}`}
            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border ${
              isWordpress ? 'bg-blue-100/80 text-blue-700 border-blue-200/60' : 'bg-purple-100/80 text-purple-700 border-purple-200/60'
            }`}
          >
            {isWordpress ? <Globe className="h-3 w-3 text-blue-600" /> : <AppWindow className="h-3 w-3 text-purple-600" />}
            {portal.category}
          </span>

          <div className="flex items-center gap-1.5">
            <span
              id={`badge-status-${portal.id}`}
              className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                isActive ? 'bg-emerald-50/80 text-emerald-700 border-emerald-200/60' : 'bg-slate-100/80 text-slate-500 border-slate-200/60'
              }`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${isActive ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
              {portal.status}
            </span>

            <button
              onClick={() => onViewDetails(portal)}
              className="text-slate-400 hover:text-indigo-600 p-1 rounded-lg hover:bg-slate-100/80 transition-colors ml-1 cursor-pointer"
              title="Ver detalles técnicos"
            >
              <Info className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="mb-3">
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-lg font-extrabold text-slate-800 tracking-tight group-hover:text-indigo-600 transition-colors">{portal.name}</h3>

            <span
              className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-500 bg-slate-100/80 px-2 py-0.5 rounded-full shrink-0 border border-slate-200/40"
              title={`Este portal se ha abierto ${portal.openCount || 0} veces`}
            >
              <Eye className="h-3 w-3 text-indigo-500" />
              <span>{portal.openCount || 0}</span>
            </span>
          </div>

          {portal.department && <p className="text-xs text-slate-400 font-medium truncate mt-0.5">{portal.department}</p>}
        </div>

        <div className="rounded-xl bg-slate-50/70 p-2.5 border border-slate-200/60 mb-3">
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">URL Institucional:</span>
            <button onClick={handleCopyUrl} className="text-[10px] text-slate-500 hover:text-indigo-600 font-bold flex items-center gap-1 transition-colors cursor-pointer" title="Copiar enlace">
              {copiedUrl ? (
                <>
                  <Check className="h-3 w-3 text-emerald-600" />
                  <span className="text-emerald-700">Copiada</span>
                </>
              ) : (
                <>
                  <Copy className="h-3 w-3" />
                  <span>Copiar</span>
                </>
              )}
            </button>
          </div>
          <div id={`url-${portal.id}`} className="mt-0.5 font-mono text-xs text-slate-600 truncate" title={portal.url}>
            {portal.url}
          </div>
        </div>

        <div className="flex items-center justify-between rounded-xl border border-slate-200/60 bg-slate-50/70 px-3 py-2.5 text-xs mb-4">
          <div className="flex items-center gap-2 overflow-hidden">
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-white text-slate-500 shadow-2xs border border-slate-200/50">
              <User className="h-3.5 w-3.5" />
            </div>
            <div className="overflow-hidden">
              <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">Usuario de acceso:</span>
              <span id={`demo-user-${portal.id}`} className="font-mono font-bold text-slate-700 truncate block text-xs select-all">
                {portal.username}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-2 border-t border-slate-100/80 pt-4">
        <button
          id={`btn-open-${portal.id}`}
          onClick={() => onOpenPortal(portal)}
          className="w-full py-2.5 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800 transition-all shadow-md shadow-slate-900/10 active:scale-98 flex items-center justify-center gap-1.5 cursor-pointer"
        >
          <span>Abrir portal</span>
          <ExternalLink className="h-3.5 w-3.5" />
        </button>

        <div className="grid grid-cols-2 gap-2">
          <button
            id={`btn-copy-user-${portal.id}`}
            onClick={handleCopyUser}
            className={`flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold transition-all border cursor-pointer ${
              copiedUser ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-slate-200/60 bg-slate-100/90 text-slate-700 hover:bg-slate-200 active:scale-98'
            }`}
          >
            {copiedUser ? (
              <>
                <Check className="h-3.5 w-3.5 text-emerald-600" />
                <span>¡Copiado!</span>
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5 text-slate-500" />
                <span>Copiar usuario</span>
              </>
            )}
          </button>

          <button
            id={`btn-copy-password-${portal.id}`}
            onClick={handleCopyPassword}
            disabled={!portal.hasPassword || revealingPassword}
            title={portal.hasPassword ? 'Revela la contraseña cifrada (queda auditado)' : 'Sin contraseña guardada'}
            className={`flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold transition-all border cursor-pointer disabled:cursor-not-allowed ${
              copiedPassword
                ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                : 'border-dashed border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100 disabled:opacity-60 disabled:hover:bg-slate-50'
            }`}
          >
            {copiedPassword ? (
              <>
                <Check className="h-3.5 w-3.5 text-emerald-600" />
                <span>¡Copiada!</span>
              </>
            ) : (
              <>
                <Lock className="h-3.5 w-3.5 text-slate-400" />
                <span>{revealingPassword ? 'Revelando...' : 'Copiar clave'}</span>
              </>
            )}
          </button>
        </div>

        {!portal.hasPassword && (
          <p id={`password-notice-${portal.id}`} className="text-[10px] font-medium text-slate-400 text-center block pt-0.5">
            Este portal no tiene contraseña guardada
          </p>
        )}

        {isAdmin && (
          <div className="pt-2 mt-2 border-t border-slate-100 flex items-center justify-between gap-2">
            <button
              id={`btn-toggle-status-${portal.id}`}
              type="button"
              onClick={() => onToggleStatus && onToggleStatus(portal)}
              className="inline-flex items-center gap-1.5 text-[11px] font-bold text-slate-600 hover:text-indigo-600 px-2.5 py-1 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
              title={isActive ? 'Desactivar portal' : 'Activar portal'}
            >
              {isActive ? (
                <>
                  <ToggleRight className="h-4 w-4 text-emerald-600" />
                  <span>Desactivar</span>
                </>
              ) : (
                <>
                  <ToggleLeft className="h-4 w-4 text-slate-400" />
                  <span>Activar</span>
                </>
              )}
            </button>

            {showDeleteConfirm ? (
              <div className="flex items-center gap-1">
                <button
                  id={`btn-confirm-delete-${portal.id}`}
                  type="button"
                  onClick={() => {
                    onDeletePortal && onDeletePortal(portal);
                    setShowDeleteConfirm(false);
                  }}
                  className="text-[10px] font-bold px-2 py-0.5 rounded bg-rose-600 text-white hover:bg-rose-700 transition-colors cursor-pointer"
                >
                  Confirmar
                </button>
                <button type="button" onClick={() => setShowDeleteConfirm(false)} className="text-[10px] text-slate-400 hover:text-slate-600 px-1 py-0.5 cursor-pointer">
                  Cancelar
                </button>
              </div>
            ) : (
              <button
                id={`btn-delete-${portal.id}`}
                type="button"
                onClick={() => setShowDeleteConfirm(true)}
                className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-400 hover:text-rose-600 px-2 py-1 rounded-lg hover:bg-rose-50 transition-colors cursor-pointer"
                title="Eliminar portal del catálogo"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>Eliminar</span>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
