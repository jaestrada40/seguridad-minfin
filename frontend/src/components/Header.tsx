import { useState, useRef, useEffect } from 'react';
import { Plus, Menu, ShieldCheck, ChevronDown, UserCheck, Key, LogOut, HardDrive, User as UserIcon } from 'lucide-react';
import { UserSession, AppNotification } from '../types';
import { NotificationCenter } from './NotificationCenter';

interface HeaderProps {
  onOpenAddModal: () => void;
  onOpenMobileMenu: () => void;
  user: UserSession;
  onLogout: () => void;
  notifications: AppNotification[];
  onMarkAsRead: (id: string) => void;
  onMarkAllAsRead: () => void;
  onDeleteNotification: (id: string) => void;
  onClearAllNotifications: () => void;
}

export function Header({
  onOpenAddModal,
  onOpenMobileMenu,
  user,
  onLogout,
  notifications,
  onMarkAsRead,
  onMarkAllAsRead,
  onDeleteNotification,
  onClearAllNotifications,
}: HeaderProps) {
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const isAdmin = user.role === 'Administrador';

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <header id="main-header" className="sticky top-0 z-30 border-b border-slate-200/70 bg-white/40 backdrop-blur-md">
      <div className="flex h-20 items-center justify-between px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3 sm:gap-4">
          <button
            id="btn-mobile-menu"
            onClick={onOpenMobileMenu}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200/80 bg-white/60 backdrop-blur-xs text-slate-600 hover:bg-white/90 lg:hidden shadow-xs cursor-pointer"
            aria-label="Abrir menú"
          >
            <Menu className="h-5 w-5" />
          </button>

          <div>
            <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
              <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-slate-900">ControlCenter</h1>

              <div
                id="badge-local-env"
                className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200/80 bg-emerald-50/90 backdrop-blur-xs px-2.5 py-0.5 text-xs font-bold text-emerald-800 shadow-2xs"
                title="Conectado a la infraestructura de red institucional"
              >
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-600"></span>
                </span>
                <span className="flex items-center gap-1">
                  <HardDrive className="h-3 w-3 text-emerald-600" />
                  Entorno local
                </span>
              </div>

              <span
                className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border shadow-2xs ${
                  isAdmin ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-slate-100 text-slate-600 border-slate-200'
                }`}
              >
                {isAdmin ? <ShieldCheck className="h-3 w-3 text-indigo-600" /> : <UserIcon className="h-3 w-3 text-slate-500" />}
                {user.role}
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-500 font-medium">Catálogo centralizado y seguro de portales internos</p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 sm:gap-3.5">
          {isAdmin && (
            <button
              id="btn-add-portal"
              onClick={onOpenAddModal}
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-indigo-500/25 transition-all hover:bg-indigo-700 hover:shadow-indigo-500/35 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 active:scale-98 cursor-pointer"
            >
              <Plus className="h-4 w-4 stroke-[2.5]" />
              <span className="hidden sm:inline">Agregar portal</span>
              <span className="sm:hidden">Nuevo</span>
            </button>
          )}

          <NotificationCenter
            notifications={notifications}
            onMarkAsRead={onMarkAsRead}
            onMarkAllAsRead={onMarkAllAsRead}
            onDeleteNotification={onDeleteNotification}
            onClearAll={onClearAllNotifications}
          />

          <div className="relative" ref={menuRef}>
            <button
              id="btn-user-profile-menu"
              onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
              className="flex items-center gap-2.5 rounded-xl border border-white/80 bg-white/60 backdrop-blur-md p-1.5 pr-3 hover:bg-white/80 transition-all shadow-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-600 text-xs font-bold text-white shadow-xs">
                {user.name.split(' ').map((n) => n[0]).slice(0, 2).join('')}
              </div>
              <div className="hidden text-left md:block">
                <p className="text-xs font-bold text-slate-800 leading-tight">{user.name}</p>
                <p className="text-[10px] font-semibold text-slate-400">{user.role}</p>
              </div>
              <ChevronDown className="h-4 w-4 text-slate-400" />
            </button>

            {isUserMenuOpen && (
              <div
                id="user-dropdown-menu"
                className="absolute right-0 mt-2 w-64 rounded-2xl border border-white/80 bg-white/95 backdrop-blur-xl p-2 shadow-xl ring-1 ring-slate-900/5 z-50 animate-in fade-in zoom-in-95 duration-100"
              >
                <div className="border-b border-slate-100 px-3 py-2.5 mb-1">
                  <p className="text-xs font-bold text-slate-900">{user.name}</p>
                  <div className="mt-1.5 flex items-center justify-between">
                    <span className="inline-block rounded-full bg-indigo-50 px-2.5 py-0.5 text-[10px] font-bold text-indigo-700 border border-indigo-200/80">
                      Rol: {user.role}
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">{user.username}</span>
                  </div>
                </div>

                <div className="space-y-0.5 text-xs">
                  <div className="flex items-center gap-2 rounded-xl px-3 py-2 text-slate-600 font-medium">
                    <UserCheck className="h-4 w-4 text-slate-400" />
                    <span>Sesión MFA Verificada</span>
                  </div>
                  <div className="flex items-center gap-2 rounded-xl px-3 py-2 text-slate-600 font-medium">
                    <Key className="h-4 w-4 text-slate-400" />
                    <span>Políticas de Claves TI</span>
                  </div>
                </div>

                <div className="mt-1 border-t border-slate-100 pt-1">
                  <button
                    onClick={() => {
                      setIsUserMenuOpen(false);
                      onLogout();
                    }}
                    className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                  >
                    <LogOut className="h-4 w-4" />
                    <span>Cerrar sesión segura</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
