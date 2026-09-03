import type { ComponentType } from 'react';
import { Globe2, Activity, Users, Settings, LogOut, Server, Lock } from 'lucide-react';
import { NavTab, UserSession } from '../types';
import { Logo } from './Logo';

interface SidebarProps {
  currentTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  user: UserSession;
  onLogout: () => void;
  isMobileOpen: boolean;
  onCloseMobile: () => void;
  logoRefreshKey?: number;
}

export function Sidebar({ currentTab, onSelectTab, user, onLogout, isMobileOpen, onCloseMobile, logoRefreshKey }: SidebarProps) {
  const isAdmin = user.role === 'Administrador';

  const allNavItems: { id: NavTab; label: string; icon: ComponentType<{ className?: string }>; adminOnly?: boolean }[] = [
    { id: 'portales', label: 'Portales', icon: Globe2 },
    { id: 'actividad', label: 'Actividad', icon: Activity, adminOnly: true },
    { id: 'usuarios', label: 'Usuarios', icon: Users, adminOnly: true },
    { id: 'configuracion', label: 'Configuración', icon: Settings, adminOnly: true },
  ];

  const visibleNavItems = isAdmin ? allNavItems : allNavItems.filter((item) => !item.adminOnly);

  return (
    <>
      {isMobileOpen && (
        <div
          id="sidebar-backdrop"
          onClick={onCloseMobile}
          className="fixed inset-0 z-40 bg-slate-900/60 backdrop-blur-xs lg:hidden"
        />
      )}

      <aside
        id="app-sidebar"
        className={`fixed top-0 bottom-0 left-0 z-50 flex w-72 flex-col justify-between border-r border-slate-800/80 bg-slate-900/95 backdrop-blur-xl text-slate-100 transition-transform duration-200 ease-in-out lg:static lg:translate-x-0 ${
          isMobileOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full'
        }`}
      >
        <div>
          <div className="flex min-h-[140px] items-center border-b border-slate-800/80 px-6 py-5">
            <Logo size={110} refreshKey={logoRefreshKey} />
          </div>

          <div className="px-4 py-6">
            <div className="flex items-center justify-between px-3 mb-2">
              <p className="text-[10px] font-bold tracking-widest text-slate-400 uppercase">Módulos del Sistema</p>
              <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">{user.role}</span>
            </div>

            <nav className="space-y-1.5">
              {visibleNavItems.map((item) => {
                const Icon = item.icon;
                const isActive = currentTab === item.id;
                return (
                  <button
                    key={item.id}
                    id={`nav-${item.id}`}
                    onClick={() => {
                      onSelectTab(item.id);
                      onCloseMobile();
                    }}
                    className={`group flex w-full items-center gap-3.5 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-all cursor-pointer ${
                      isActive
                        ? 'bg-white/10 text-white shadow-xs font-semibold backdrop-blur-xs border border-white/10'
                        : 'text-slate-400 hover:bg-white/5 hover:text-white'
                    }`}
                  >
                    <Icon className={`h-5 w-5 transition-colors ${isActive ? 'text-indigo-400' : 'text-slate-400 group-hover:text-slate-200'}`} />
                    <span>{item.label}</span>
                    {isActive && <span className="ml-auto h-2 w-2 rounded-full bg-indigo-400 animate-pulse" />}
                  </button>
                );
              })}
            </nav>

            {!isAdmin && (
              <div className="mt-4 mx-1 rounded-2xl border border-slate-700/60 bg-slate-800/40 p-3 text-[11px] text-slate-400">
                <div className="flex items-center gap-1.5 text-slate-300 font-bold mb-1">
                  <Lock className="h-3.5 w-3.5 text-indigo-400" />
                  <span>Modo consulta</span>
                </div>
                <p className="text-[10px] text-slate-400 leading-normal">
                  Permisos de solo consulta y apertura de portales. Secciones de administración reservadas para el rol Administrador.
                </p>
              </div>
            )}

            <div className="mt-6 mx-1 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xs p-3.5">
              <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400">
                <Server className="h-4 w-4" />
                <span>Sesión autenticada con MFA</span>
              </div>
              <p className="mt-1 text-[11px] text-slate-400 leading-relaxed">
                Verificación en dos pasos activa para esta cuenta.
              </p>
            </div>
          </div>
        </div>

        <div className="border-t border-white/10 bg-slate-950/50 backdrop-blur-md p-4">
          <div className="flex items-center gap-3 rounded-xl p-2 bg-white/5 border border-white/5">
            <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-600 font-bold text-white ring-2 ring-white/10 shadow-md">
              {user.name.split(' ').map((n) => n[0]).slice(0, 2).join('')}
              <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-emerald-500 ring-2 ring-slate-900" />
            </div>
            <div className="flex flex-1 flex-col overflow-hidden">
              <span className="truncate text-xs font-bold text-white">{user.name}</span>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="inline-flex items-center rounded-md bg-indigo-900/60 px-1.5 py-0.2 text-[10px] font-semibold text-indigo-300 border border-indigo-700/40">
                  {user.role}
                </span>
                <span className="truncate text-[11px] text-slate-400 font-mono">{user.username}</span>
              </div>
            </div>
          </div>

          <button
            id="btn-logout"
            onClick={onLogout}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-slate-300 hover:border-red-500/30 hover:bg-red-500/10 hover:text-red-300 transition-all cursor-pointer"
          >
            <LogOut className="h-4 w-4" />
            <span>Cerrar sesión</span>
          </button>
        </div>
      </aside>
    </>
  );
}
