import { useState, useEffect, type FormEvent } from 'react';
import { X, Plus, ShieldAlert, Eye, EyeOff, KeyRound } from 'lucide-react';
import { Portal, PortalCategory, PortalStatus } from '../types';

interface AddPortalModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (portal: Omit<Portal, 'id' | 'createdAt'>) => void;
  editingPortal?: Portal | null;
}

export function AddPortalModal({ isOpen, onClose, onSave, editingPortal }: AddPortalModalProps) {
  const isEditing = !!editingPortal;
  const [name, setName] = useState('');
  const [category, setCategory] = useState<PortalCategory>('WordPress');
  const [url, setUrl] = useState('https://');
  const [username, setUsername] = useState('');
  const [status, setStatus] = useState<PortalStatus>('Activo');
  const [department, setDepartment] = useState('');
  const [description, setDescription] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setName(editingPortal?.name ?? '');
    setCategory(editingPortal?.category ?? 'WordPress');
    setUrl(editingPortal?.url ?? 'https://');
    setUsername(editingPortal?.username ?? '');
    setStatus(editingPortal?.status ?? 'Activo');
    setDepartment(editingPortal?.department ?? '');
    setDescription(editingPortal?.description ?? '');
    setPassword('');
    setShowPassword(false);
    setError('');
  }, [isOpen, editingPortal]);

  if (!isOpen) return null;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Por favor ingresa el nombre del portal');
      return;
    }
    if (!url.trim() || !url.startsWith('http')) {
      setError('Por favor ingresa una URL válida (ej. https://demo.local/...)');
      return;
    }
    if (!username.trim()) {
      setError('Por favor define un usuario de acceso');
      return;
    }

    const payload: Omit<Portal, 'id' | 'createdAt'> = {
      name: name.trim(),
      category,
      url: url.trim(),
      username: username.trim(),
      status,
      department: department.trim() || undefined,
      description: description.trim() || undefined,
    };
    if (!isEditing && password.trim()) {
      payload.password = password;
    } else if (isEditing && password.trim()) {
      payload.password = password;
    }

    onSave(payload);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity" onClick={onClose} />

      <div
        id="modal-add-portal"
        className="relative w-full max-w-lg rounded-3xl border border-white/80 bg-white/90 backdrop-blur-2xl p-6 sm:p-7 shadow-2xl z-10 animate-in fade-in zoom-in-95 duration-150"
      >
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-100 shadow-2xs">
              <Plus className="h-5 w-5 stroke-[2.5]" />
            </div>
            <div>
              <h2 className="text-lg font-extrabold text-slate-900">{isEditing ? 'Editar portal' : 'Agregar nuevo portal'}</h2>
              <p className="text-xs text-slate-500 font-medium">
                {isEditing ? 'Actualiza los datos de este acceso institucional' : 'Registro en el catálogo de accesos institucionales'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors cursor-pointer">
            <X className="h-5 w-5" />
          </button>
        </div>

        {error && (
          <div className="mt-4 flex items-center gap-2 rounded-xl border border-red-200/80 bg-red-50/80 p-3 text-xs text-red-700">
            <ShieldAlert className="h-4 w-4 shrink-0 text-red-500" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-5 space-y-4 text-xs">
          <div>
            <label className="block font-bold text-slate-700 mb-1.5 text-[11px] uppercase tracking-wider">Nombre del portal *</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej. Sistema Integrado de Finanzas"
              className="w-full rounded-xl border border-slate-200/80 bg-white/80 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-slate-700 mb-1.5 text-[11px] uppercase tracking-wider">Categoría *</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as PortalCategory)}
                className="w-full rounded-xl border border-slate-200/80 bg-white/80 px-3.5 py-2.5 text-sm text-slate-900 focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all cursor-pointer font-medium"
              >
                <option value="WordPress">WordPress</option>
                <option value="Aplicación">Aplicación</option>
              </select>
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1.5 text-[11px] uppercase tracking-wider">Estado *</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as PortalStatus)}
                className="w-full rounded-xl border border-slate-200/80 bg-white/80 px-3.5 py-2.5 text-sm text-slate-900 focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all cursor-pointer font-medium"
              >
                <option value="Activo">Activo</option>
                <option value="Inactivo">Inactivo</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1.5 text-[11px] uppercase tracking-wider">URL del portal *</label>
            <input
              type="url"
              required
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://demo.local/mi-portal"
              className="w-full rounded-xl border border-slate-200/80 bg-white/80 px-3.5 py-2.5 font-mono text-xs text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all"
            />
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1.5 text-[11px] uppercase tracking-wider">Usuario de acceso *</label>
            <input
              type="text"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Ej. consulta-demo"
              className="w-full rounded-xl border border-slate-200/80 bg-white/80 px-3.5 py-2.5 font-mono text-xs text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all"
            />
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1.5 text-[11px] uppercase tracking-wider">
              Contraseña <span className="text-slate-400 font-normal normal-case">(opcional, se guarda cifrada)</span>
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                }}
                autoComplete="new-password"
                placeholder={isEditing && editingPortal?.hasPassword ? 'Dejar vacío para no cambiarla' : 'Contraseña real del portal'}
                className="w-full rounded-xl border border-slate-200/80 bg-white/80 px-3.5 py-2.5 pr-10 font-mono text-xs text-slate-900 placeholder:text-slate-400 placeholder:font-sans focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {isEditing && editingPortal?.hasPassword && <p className="mt-1 text-[11px] text-slate-500">Déjalo vacío para conservar la contraseña actual.</p>}
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1.5 text-[11px] uppercase tracking-wider">Departamento u Órgano Responsable</label>
            <input
              type="text"
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              placeholder="Ej. Departamento de Finanzas"
              className="w-full rounded-xl border border-slate-200/80 bg-white/80 px-3.5 py-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all"
            />
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1.5 text-[11px] uppercase tracking-wider">Descripción</label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Breve detalle del propósito del portal."
              className="w-full rounded-xl border border-slate-200/80 bg-white/80 px-3.5 py-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all"
            />
          </div>

          <div className="flex items-start gap-2 rounded-xl border border-indigo-200/70 bg-indigo-50/60 p-2.5 text-indigo-900">
            <KeyRound className="h-3.5 w-3.5 shrink-0 mt-0.5 text-indigo-600" />
            <span className="text-[11px] leading-relaxed">La contraseña se cifra en el servidor; cada vez que alguien la revela queda registrado en Actividad.</span>
          </div>

          <div className="mt-6 flex items-center justify-end gap-3 border-t border-slate-100 pt-5">
            <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 bg-white/80 px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-white transition-all shadow-2xs cursor-pointer">
              Cancelar
            </button>
            <button type="submit" className="rounded-xl bg-indigo-600 px-5 py-2.5 text-xs font-bold text-white shadow-lg shadow-indigo-500/25 hover:bg-indigo-700 active:scale-98 transition-all cursor-pointer">
              {isEditing ? 'Guardar cambios' : 'Guardar en catálogo'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
