import { useState, useRef, useEffect } from 'react';
import { Bell, Trash2, Globe2, Activity, ToggleRight, Sparkles, X, Info } from 'lucide-react';
import { AppNotification } from '../types';

interface NotificationCenterProps {
  notifications: AppNotification[];
  onMarkAsRead: (id: string) => void;
  onMarkAllAsRead: () => void;
  onDeleteNotification: (id: string) => void;
  onClearAll: () => void;
}

export function NotificationCenter({ notifications, onMarkAsRead, onMarkAllAsRead, onDeleteNotification, onClearAll }: NotificationCenterProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [filter, setFilter] = useState<'all' | 'portals' | 'activity'>('all');
  const dropdownRef = useRef<HTMLDivElement>(null);

  const unreadCount = notifications.filter((n) => !n.read).length;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const filteredNotifications = notifications.filter((n) => {
    if (filter === 'portals') return n.type === 'portal_added' || n.type === 'portal_deleted' || n.type === 'status_changed';
    if (filter === 'activity') return n.type === 'portal_opened';
    return true;
  });

  const getNotificationIcon = (type: AppNotification['type']) => {
    switch (type) {
      case 'portal_added':
        return <Globe2 className="h-4 w-4 text-emerald-500" />;
      case 'portal_deleted':
        return <Trash2 className="h-4 w-4 text-rose-500" />;
      case 'status_changed':
        return <ToggleRight className="h-4 w-4 text-amber-500" />;
      case 'portal_opened':
        return <Activity className="h-4 w-4 text-indigo-500" />;
      default:
        return <Info className="h-4 w-4 text-blue-500" />;
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        id="btn-notification-bell"
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`relative flex h-9 w-9 items-center justify-center rounded-xl border border-white/80 bg-white/70 backdrop-blur-md text-slate-700 shadow-2xs hover:bg-white transition-all cursor-pointer ${
          isOpen ? 'ring-2 ring-indigo-500/20 bg-white' : ''
        }`}
        title="Centro de Notificaciones"
      >
        <Bell className="h-4 w-4 text-slate-700" />
        {unreadCount > 0 && (
          <span
            id="unread-notifications-badge"
            className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-indigo-600 px-1 text-[10px] font-black text-white shadow-xs animate-pulse"
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div
          id="notification-dropdown-panel"
          className="absolute right-0 mt-2 w-80 sm:w-96 rounded-3xl border border-white/80 bg-white/95 backdrop-blur-2xl p-4 shadow-2xl shadow-slate-900/15 z-50 animate-in fade-in zoom-in-95 duration-150"
        >
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
                <Bell className="h-4 w-4" />
              </div>
              <div>
                <h3 className="text-xs font-extrabold text-slate-900">Notificaciones</h3>
                <span className="text-[10px] text-slate-400 font-medium">
                  {unreadCount > 0 ? `${unreadCount} pendientes de revisión` : 'Al día'}
                </span>
              </div>
            </div>
            {unreadCount > 0 && (
              <button type="button" onClick={onMarkAllAsRead} className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 transition-colors">
                Marcar leídas
              </button>
            )}
          </div>

          <div className="flex items-center gap-1.5 py-2.5 border-b border-slate-100/70 text-[11px]">
            {(['all', 'portals', 'activity'] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={`rounded-lg px-2.5 py-1 font-bold transition-all ${
                  filter === f ? 'bg-slate-900 text-white shadow-2xs' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {f === 'all' ? `Todas (${notifications.length})` : f === 'portals' ? 'Portales' : 'Actividad'}
              </button>
            ))}
          </div>

          <div className="mt-2 max-h-80 overflow-y-auto space-y-2 pr-0.5">
            {filteredNotifications.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400">
                <Sparkles className="h-6 w-6 mx-auto mb-2 text-slate-300 stroke-[1.5]" />
                <p className="font-semibold text-slate-600">No hay notificaciones</p>
                <p className="text-[11px] text-slate-400 mt-0.5">Las alertas sobre cambios en portales aparecerán aquí.</p>
              </div>
            ) : (
              filteredNotifications.map((notif) => (
                <div
                  key={notif.id}
                  onClick={() => !notif.read && onMarkAsRead(notif.id)}
                  className={`group relative flex items-start gap-3 rounded-2xl p-3 text-xs transition-all border cursor-pointer ${
                    notif.read
                      ? 'bg-slate-50/50 border-slate-100 text-slate-600 hover:bg-slate-50'
                      : 'bg-indigo-50/40 border-indigo-100 text-slate-900 hover:bg-indigo-50/70 shadow-2xs'
                  }`}
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white border border-slate-200/60 shadow-2xs mt-0.5">
                    {getNotificationIcon(notif.type)}
                  </div>
                  <div className="flex-1 pr-4">
                    <div className="flex items-center gap-1.5">
                      <p className={`font-bold text-xs ${notif.read ? 'text-slate-700' : 'text-slate-900'}`}>{notif.title}</p>
                      {!notif.read && <span className="h-1.5 w-1.5 rounded-full bg-indigo-600 shrink-0" />}
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">{notif.message}</p>
                    <span className="text-[10px] text-slate-400 font-medium block mt-1">{notif.timestamp}</span>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteNotification(notif.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-rose-600 p-1 rounded-lg transition-all absolute top-2 right-2"
                    title="Eliminar notificación"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>

          {notifications.length > 0 && (
            <div className="mt-3 border-t border-slate-100 pt-2 flex items-center justify-between text-[10px] text-slate-400">
              <span>ControlCenter Audit Log</span>
              <button type="button" onClick={onClearAll} className="font-bold text-slate-500 hover:text-rose-600 transition-colors">
                Limpiar historial
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
