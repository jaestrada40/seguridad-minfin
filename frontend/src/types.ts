export type PortalCategory = 'WordPress' | 'Aplicación';
export type PortalStatus = 'Activo' | 'Inactivo';

export interface Portal {
  id: string;
  name: string;
  category: PortalCategory;
  url: string;
  username: string;
  status: PortalStatus;
  description?: string | null;
  department?: string | null;
  createdAt: string;
  hasPassword?: boolean;
  revealCount?: number;
  /** Solo se usa al enviar el formulario de alta/edición; nunca viene del backend. */
  password?: string;
}

export type FilterCategory = 'Todos' | PortalCategory;
export type FilterStatus = 'Todos' | PortalStatus;
export type SortOption = 'name-asc' | 'name-desc' | 'newest';

export type NavTab = 'portales' | 'actividad' | 'usuarios' | 'configuracion';

/** Rol real del backend. La UI solo distingue Administrador vs. el resto. */
export type UserRole = 'Administrador' | 'Operador' | 'Auditor';

export interface UserSession {
  id: string;
  username: string;
  name: string;
  role: UserRole;
}

export interface UserProfile {
  id: string;
  name: string;
  username: string;
  email: string;
  role: UserRole;
  department: string;
  authMethod: string;
  status: 'Activo' | 'Suspendido';
  lastLogin: string;
  mfaEnabled?: boolean;
}

export interface SystemInfo {
  session: {
    cookieSecure: boolean;
    corsOrigin: string;
    sessionTtlHours: number;
    mfaRequired: boolean;
    mfaAlgorithm: string;
    loginLockout: string;
    csrfHeader: string;
  };
  vault: {
    address: string;
    secretPath: string;
    engine: string;
    reachable: boolean;
    initialized: boolean | null;
    sealed: boolean | null;
    version: string | null;
  };
  catalog: {
    portalsTotal: number;
    portalsActive: number;
    portalsWithPassword: number;
    activeUsers: number;
    passwordReveals: number;
    portalsLimit: number;
  };
}

export interface ActivityLog {
  id: string;
  timestamp: string;
  user: string;
  action: string;
  portalName?: string | null;
  type: 'access' | 'copy' | 'create' | 'update' | 'delete' | 'reveal' | 'auth' | 'system';
  ipAddress: string;
}

/** Notificaciones locales y efímeras (no se persisten en el backend). */
export interface AppNotification {
  id: string;
  title: string;
  message: string;
  type: 'portal_added' | 'portal_deleted' | 'status_changed' | 'portal_opened' | 'security';
  severity: 'info' | 'success' | 'warning';
  timestamp: string;
  read: boolean;
  portalName?: string;
}
