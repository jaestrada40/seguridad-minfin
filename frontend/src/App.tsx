import { useState, useMemo, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { MetricsPanel } from './components/MetricsPanel';
import { Toolbar } from './components/Toolbar';
import { SecurityBanner } from './components/SecurityBanner';
import { PortalCard } from './components/PortalCard';
import { AddPortalModal } from './components/AddPortalModal';
import { PortalDetailsModal } from './components/PortalDetailsModal';
import { ToastContainer, ToastMessage } from './components/Toast';
import { ActivityView, UsersView, SettingsView } from './components/OtherViews';
import { AuthScreen, LoginStepResult, MfaConfirmResult } from './components/AuthScreen';
import { Portal, NavTab, FilterCategory, FilterStatus, SortOption, ActivityLog, UserSession, AppNotification, UserProfile } from './types';
import { FolderSearch, Plus } from 'lucide-react';

export default function App() {
  const [currentUser, setCurrentUser] = useState<UserSession | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);

  const [portals, setPortals] = useState<Portal[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [currentTab, setCurrentTab] = useState<NavTab>('portales');
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<FilterCategory>('Todos');
  const [statusFilter, setStatusFilter] = useState<FilterStatus>('Todos');
  const [sortOption, setSortOption] = useState<SortOption>('name-asc');

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingPortal, setEditingPortal] = useState<Portal | null>(null);
  const [selectedPortal, setSelectedPortal] = useState<Portal | null>(null);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [logoRefreshKey, setLogoRefreshKey] = useState(0);

  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const api = async (path: string, options?: RequestInit) => {
    const response = await fetch(path, {
      ...options,
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'SecureVaultFrontend', ...(options?.headers || {}) },
    });
    if (!response.ok) throw new Error((await response.json().catch(() => null))?.detail || 'Error de conexión');
    return response.json();
  };

  const addToast = (type: ToastMessage['type'], title: string, message?: string) => {
    const id = Date.now().toString() + Math.random().toString(36).slice(2, 6);
    setToasts((prev) => [...prev, { id, type, title, message }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
  };
  const dismissToast = (id: string) => setToasts((prev) => prev.filter((t) => t.id !== id));

  const addNotification = (notif: Omit<AppNotification, 'id' | 'timestamp' | 'read'>) => {
    setNotifications((prev) => [{ ...notif, id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`, timestamp: 'Justo ahora', read: false }, ...prev]);
  };
  const handleMarkAsRead = (id: string) => setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
  const handleMarkAllAsRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    addToast('info', 'Notificaciones marcadas', 'Todas las notificaciones se marcaron como leídas.');
  };
  const handleDeleteNotification = (id: string) => setNotifications((prev) => prev.filter((n) => n.id !== id));
  const handleClearAllNotifications = () => {
    setNotifications([]);
    addToast('info', 'Bandeja vaciada', 'Se han eliminado todas las notificaciones.');
  };

  const fetchActivity = () => api('/api/activity').then(setActivityLogs).catch(() => {});
  const fetchUsers = () => api('/api/users').then(setUsers).catch(() => {});

  useEffect(() => {
    api('/api/auth/me')
      .then((u) => setCurrentUser(u))
      .catch(() => {})
      .finally(() => setCheckingSession(false));
  }, []);

  useEffect(() => {
    if (!currentUser) return;
    api('/api/portals').then(setPortals).catch(() => addToast('warning', 'No se pudo cargar el catálogo', 'Verifica que la API esté disponible.'));
    fetchActivity();
    if (currentUser.role === 'Administrador') fetchUsers();
  }, [currentUser]);

  const handleLogin = async (username: string, password: string): Promise<LoginStepResult> => {
    try {
      const result = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) });
      if (result.mfaSetupRequired) return { status: 'mfaSetupRequired', pendingToken: result.pendingToken, otpauthUrl: result.otpauthUrl };
      if (result.mfaRequired) return { status: 'mfaRequired', pendingToken: result.pendingToken };
      return { status: 'error', message: 'Respuesta inesperada del servidor' };
    } catch (error) {
      return { status: 'error', message: error instanceof Error ? error.message : 'No se pudo iniciar sesión' };
    }
  };

  const handleMfaConfirm = async (pendingToken: string, code: string): Promise<MfaConfirmResult> => {
    try {
      const user = await api('/api/auth/mfa/confirm', { method: 'POST', body: JSON.stringify({ pendingToken, code }) });
      setCurrentUser(user);
      addToast('success', 'Autenticación MFA exitosa', `Bienvenido a ControlCenter, ${user.name}.`);
      return { status: 'success' };
    } catch (error) {
      return { status: 'error', message: error instanceof Error ? error.message : 'Código incorrecto' };
    }
  };

  const handleLogout = () => {
    api('/api/auth/logout', { method: 'POST' }).finally(() => {
      setCurrentUser(null);
      setPortals([]);
      setActivityLogs([]);
      setUsers([]);
      setNotifications([]);
      addToast('info', 'Sesión finalizada', 'Has cerrado tu sesión en ControlCenter.');
    });
  };

  // Filter and sort portals
  const filteredPortals = useMemo(() => {
    return portals
      .filter((portal) => {
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const matches =
            portal.name.toLowerCase().includes(q) ||
            portal.category.toLowerCase().includes(q) ||
            portal.url.toLowerCase().includes(q) ||
            portal.username.toLowerCase().includes(q);
          if (!matches) return false;
        }
        if (categoryFilter !== 'Todos' && portal.category !== categoryFilter) return false;
        if (statusFilter !== 'Todos' && portal.status !== statusFilter) return false;
        return true;
      })
      .sort((a, b) => {
        if (sortOption === 'name-asc') return a.name.localeCompare(b.name, 'es');
        if (sortOption === 'name-desc') return b.name.localeCompare(a.name, 'es');
        return 0;
      });
  }, [portals, searchQuery, categoryFilter, statusFilter, sortOption]);

  const metrics = useMemo(
    () => ({
      totalVisible: filteredPortals.length,
      wordPressCount: portals.filter((p) => p.category === 'WordPress').length,
      appsCount: portals.filter((p) => p.category === 'Aplicación').length,
      activeCount: portals.filter((p) => p.status === 'Activo').length,
    }),
    [portals, filteredPortals]
  );

  const isFiltered = Boolean(searchQuery || categoryFilter !== 'Todos' || statusFilter !== 'Todos' || sortOption !== 'name-asc');
  const handleResetFilters = () => {
    setSearchQuery('');
    setCategoryFilter('Todos');
    setStatusFilter('Todos');
    setSortOption('name-asc');
  };

  // Create or edit portal
  const handleSavePortal = (portalData: Omit<Portal, 'id' | 'createdAt'>) => {
    if (editingPortal) {
      api(`/api/portals/${editingPortal.id}`, { method: 'PATCH', body: JSON.stringify(portalData) })
        .then((saved) => {
          setPortals((prev) => prev.map((p) => (p.id === saved.id ? saved : p)));
          fetchActivity();
          addToast('success', 'Portal actualizado', `"${saved.name}" se guardó correctamente.`);
        })
        .catch((error) => addToast('warning', 'No se pudo actualizar', error.message));
    } else {
      api('/api/portals', { method: 'POST', body: JSON.stringify(portalData) })
        .then((saved) => {
          setPortals((prev) => [saved, ...prev]);
          fetchActivity();
          addNotification({ title: 'Portal agregado al catálogo', message: `"${saved.name}" registrado por ${currentUser?.name}.`, type: 'portal_added', severity: 'success', portalName: saved.name });
          addToast('success', 'Portal agregado con éxito', `"${saved.name}" registrado en el catálogo.`);
        })
        .catch((error) => addToast('warning', 'No se pudo guardar', error.message));
    }
  };

  const handleOpenEditModal = (portal: Portal) => {
    setEditingPortal(portal);
    setIsAddModalOpen(true);
  };
  const handleCloseAddModal = () => {
    setIsAddModalOpen(false);
    setEditingPortal(null);
  };

  const handleDeletePortal = (portal: Portal) => {
    api(`/api/portals/${portal.id}`, { method: 'DELETE' })
      .then(() => {
        setPortals((prev) => prev.filter((p) => p.id !== portal.id));
        if (selectedPortal?.id === portal.id) {
          setIsDetailsModalOpen(false);
          setSelectedPortal(null);
        }
        fetchActivity();
        addNotification({ title: 'Portal eliminado del catálogo', message: `"${portal.name}" fue retirado por ${currentUser?.name}.`, type: 'portal_deleted', severity: 'warning', portalName: portal.name });
        addToast('warning', 'Portal eliminado', `"${portal.name}" fue eliminado del catálogo institucional.`);
      })
      .catch((error) => addToast('warning', 'No se pudo eliminar', error.message));
  };

  const handleToggleStatus = (portal: Portal) => {
    const nextStatus = portal.status === 'Activo' ? 'Inactivo' : 'Activo';
    api(`/api/portals/${portal.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        name: portal.name,
        category: portal.category,
        url: portal.url,
        username: portal.username,
        status: nextStatus,
        department: portal.department,
        description: portal.description,
      }),
    })
      .then((saved) => {
        setPortals((prev) => prev.map((p) => (p.id === saved.id ? saved : p)));
        if (selectedPortal?.id === portal.id) setSelectedPortal(saved);
        fetchActivity();
        addNotification({ title: 'Estado de portal modificado', message: `"${portal.name}" cambió a estado "${nextStatus}".`, type: 'status_changed', severity: nextStatus === 'Activo' ? 'success' : 'warning', portalName: portal.name });
        addToast('info', 'Estado actualizado', `"${portal.name}" ahora está ${nextStatus}.`);
      })
      .catch((error) => addToast('warning', 'No se pudo actualizar el estado', error.message));
  };

  const handleOpenPortal = (portal: Portal) => {
    api(`/api/portals/${portal.id}/open`, { method: 'POST' })
      .then(fetchActivity)
      .catch(() => {});
    addNotification({ title: `Portal abierto: ${portal.name}`, message: `Destino institucional: ${portal.url}`, type: 'portal_opened', severity: 'info', portalName: portal.name });
    window.open(portal.url, '_blank', 'noopener,noreferrer');
  };

  const handleCopyUser = (username: string, portalName: string) => {
    const portal = portals.find((p) => p.name === portalName);
    if (portal) api(`/api/portals/${portal.id}/copy-user`, { method: 'POST' }).then(fetchActivity).catch(() => {});
    addToast('success', 'Usuario copiado al portapapeles', `Usuario "${username}" de ${portalName}.`);
  };

  const handleCopyPassword = async (portal: Portal): Promise<string | null> => {
    try {
      const { password } = await api(`/api/portals/${portal.id}/reveal-password`, { method: 'POST' });
      fetchActivity();
      addToast('info', 'Contraseña copiada al portapapeles', `Portal: ${portal.name}. Esta acción quedó registrada.`);
      return password;
    } catch (error) {
      addToast('warning', 'No se pudo revelar la contraseña', error instanceof Error ? error.message : undefined);
      return null;
    }
  };

  const handleUpdateLogo = (dataUrl: string | null) => {
    api('/api/settings/logo', { method: 'POST', body: JSON.stringify({ dataUrl }) })
      .then(() => {
        setLogoRefreshKey((k) => k + 1);
        addToast('success', dataUrl ? 'Logo actualizado' : 'Logo eliminado');
      })
      .catch((error) => addToast('warning', 'No se pudo actualizar el logo', error.message));
  };

  const handleResetMfa = (user: UserProfile) => {
    if (!window.confirm(`¿Resetear el MFA de "${user.name}"? Deberá configurarlo de nuevo en su próximo inicio de sesión.`)) return;
    api(`/api/users/${user.id}/reset-mfa`, { method: 'POST' })
      .then(() => {
        setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, mfaEnabled: false } : u)));
        fetchActivity();
        addToast('info', 'MFA reseteado', `"${user.name}" deberá configurar MFA de nuevo.`);
      })
      .catch((error) => addToast('warning', 'No se pudo resetear MFA', error.message));
  };

  if (checkingSession) return <div className="min-h-screen bg-slate-900" />;

  if (!currentUser) {
    return (
      <>
        <AuthScreen onLogin={handleLogin} onMfaConfirm={handleMfaConfirm} />
        <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      </>
    );
  }

  const isAdmin = currentUser.role === 'Administrador';

  return (
    <div className="relative min-h-screen bg-slate-50 font-sans text-slate-900 antialiased flex overflow-hidden">
      <div aria-hidden="true" className="pointer-events-none fixed top-0 right-0 w-[500px] h-[500px] bg-indigo-100 rounded-full blur-[120px] opacity-50 -mr-48 -mt-48 z-0" />
      <div aria-hidden="true" className="pointer-events-none fixed bottom-0 left-0 w-[350px] h-[350px] bg-blue-100 rounded-full blur-[100px] opacity-50 -ml-24 -mb-24 z-0" />
      <div aria-hidden="true" className="pointer-events-none fixed top-1/2 right-1/4 w-[280px] h-[280px] bg-purple-100/40 rounded-full blur-[110px] opacity-40 z-0" />

      <Sidebar
        currentTab={currentTab}
        onSelectTab={setCurrentTab}
        user={currentUser}
        onLogout={handleLogout}
        isMobileOpen={isMobileSidebarOpen}
        onCloseMobile={() => setIsMobileSidebarOpen(false)}
        logoRefreshKey={logoRefreshKey}
      />

      <div className="flex-1 flex flex-col min-w-0 relative z-10">
        <Header
          onOpenAddModal={() => {
            setEditingPortal(null);
            setIsAddModalOpen(true);
          }}
          onOpenMobileMenu={() => setIsMobileSidebarOpen(true)}
          user={currentUser}
          onLogout={handleLogout}
          notifications={notifications}
          onMarkAsRead={handleMarkAsRead}
          onMarkAllAsRead={handleMarkAllAsRead}
          onDeleteNotification={handleDeleteNotification}
          onClearAllNotifications={handleClearAllNotifications}
        />

        <main className="flex-1 p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl w-full mx-auto">
          {currentTab === 'portales' && (
            <>
              <MetricsPanel totalVisible={metrics.totalVisible} wordPressCount={metrics.wordPressCount} appsCount={metrics.appsCount} activeCount={metrics.activeCount} />
              <SecurityBanner />
              <Toolbar
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
                categoryFilter={categoryFilter}
                onCategoryChange={setCategoryFilter}
                statusFilter={statusFilter}
                onStatusChange={setStatusFilter}
                sortOption={sortOption}
                onSortChange={setSortOption}
                onResetFilters={handleResetFilters}
                isFiltered={isFiltered}
              />

              <section id="portal-catalog-grid" aria-label="Catálogo de portales">
                <div className="mb-4 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <h2 className="text-xs font-bold tracking-widest text-slate-500 uppercase">Portales Disponibles ({filteredPortals.length})</h2>
                    {!isAdmin && <span className="text-[10px] bg-slate-200/80 text-slate-700 px-2 py-0.5 rounded-full font-bold">Modo Consulta y Acceso</span>}
                  </div>
                  <span className="text-[11px] font-semibold text-indigo-600 bg-indigo-50/80 border border-indigo-100/80 px-2.5 py-0.5 rounded-full">Red local activa</span>
                </div>

                {filteredPortals.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                    {filteredPortals.map((portal) => (
                      <PortalCard
                        key={portal.id}
                        portal={portal}
                        currentUserRole={currentUser.role}
                        onOpenPortal={handleOpenPortal}
                        onCopyUser={handleCopyUser}
                        onCopyPassword={handleCopyPassword}
                        onViewDetails={(p) => {
                          setSelectedPortal(p);
                          setIsDetailsModalOpen(true);
                        }}
                        onToggleStatus={handleToggleStatus}
                        onDeletePortal={handleDeletePortal}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="rounded-3xl border border-white/80 bg-white/70 backdrop-blur-xl p-12 text-center shadow-xl shadow-slate-200/40">
                    <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-500 border border-indigo-100">
                      <FolderSearch className="h-7 w-7" />
                    </div>
                    <h3 className="mt-4 text-base font-extrabold text-slate-800">No se encontraron portales</h3>
                    <p className="mt-1 text-xs text-slate-500 max-w-sm mx-auto">Ningún portal coincide con los filtros aplicados.</p>
                    <div className="mt-5 flex items-center justify-center gap-3">
                      <button onClick={handleResetFilters} className="rounded-xl border border-slate-200 bg-white/80 backdrop-blur-xs px-4 py-2 text-xs font-bold text-slate-700 hover:bg-white shadow-xs cursor-pointer">
                        Limpiar filtros
                      </button>
                      {isAdmin && (
                        <button
                          onClick={() => {
                            setEditingPortal(null);
                            setIsAddModalOpen(true);
                          }}
                          className="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-700 shadow-md shadow-indigo-500/30 flex items-center gap-1.5 cursor-pointer"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          <span>Registrar nuevo</span>
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </section>
            </>
          )}

          {currentTab === 'actividad' && isAdmin && <ActivityView logs={activityLogs} />}
          {currentTab === 'usuarios' && isAdmin && <UsersView users={users} onResetMfa={handleResetMfa} />}
          {currentTab === 'configuracion' && isAdmin && <SettingsView onUpdateLogo={handleUpdateLogo} logoRefreshKey={logoRefreshKey} onShowToast={addToast} />}
        </main>
      </div>

      {isAdmin && <AddPortalModal isOpen={isAddModalOpen} onClose={handleCloseAddModal} onSave={handleSavePortal} editingPortal={editingPortal} />}

      <PortalDetailsModal
        isOpen={isDetailsModalOpen}
        portal={selectedPortal}
        onClose={() => {
          setIsDetailsModalOpen(false);
          setSelectedPortal(null);
        }}
        onCopyUser={handleCopyUser}
        onCopyPassword={handleCopyPassword}
        currentUserRole={currentUser.role}
        onToggleStatus={handleToggleStatus}
      />

      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
