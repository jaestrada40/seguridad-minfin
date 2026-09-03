import { FormEvent, useEffect, useState } from 'react';
import { X, KeyRound, ShieldAlert, Eye, EyeOff } from 'lucide-react';

interface ChangePasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (currentPassword: string, newPassword: string) => Promise<string | null>;
}

export function ChangePasswordModal({ isOpen, onClose, onSubmit }: ChangePasswordModalProps) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setShowPasswords(false);
    setError('');
    setSaving(false);
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 8) {
      setError('La nueva contraseña debe tener al menos 8 caracteres.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('La confirmación no coincide con la nueva contraseña.');
      return;
    }
    if (newPassword === currentPassword) {
      setError('La nueva contraseña debe ser distinta de la actual.');
      return;
    }
    setSaving(true);
    const err = await onSubmit(currentPassword, newPassword);
    setSaving(false);
    if (err) {
      setError(err);
      return;
    }
    onClose();
  };

  const inputClass =
    'w-full rounded-xl border border-slate-200/80 bg-white/80 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity" onClick={onClose} />

      <div className="relative w-full max-w-md rounded-3xl border border-white/80 bg-white/90 backdrop-blur-2xl p-6 sm:p-7 shadow-2xl z-10 animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-100 shadow-2xs">
              <KeyRound className="h-5 w-5 stroke-[2.5]" />
            </div>
            <div>
              <h2 className="text-lg font-extrabold text-slate-900">Cambiar mi contraseña</h2>
              <p className="text-xs text-slate-500 font-medium">Actualiza la contraseña de tu propia cuenta</p>
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
            <label className="block font-bold text-slate-700 mb-1.5 text-[11px] uppercase tracking-wider">Contraseña actual *</label>
            <input
              type={showPasswords ? 'text' : 'password'}
              required
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className={inputClass}
            />
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1.5 text-[11px] uppercase tracking-wider">Nueva contraseña *</label>
            <input
              type={showPasswords ? 'text' : 'password'}
              required
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Mínimo 8 caracteres"
              className={inputClass}
            />
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1.5 text-[11px] uppercase tracking-wider">Confirmar nueva contraseña *</label>
            <input
              type={showPasswords ? 'text' : 'password'}
              required
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className={inputClass}
            />
          </div>

          <button
            type="button"
            onClick={() => setShowPasswords((v) => !v)}
            className="inline-flex items-center gap-1.5 text-[11px] font-bold text-slate-500 hover:text-slate-700 transition-colors cursor-pointer"
          >
            {showPasswords ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            <span>{showPasswords ? 'Ocultar contraseñas' : 'Mostrar contraseñas'}</span>
          </button>

          <div className="flex items-center justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 transition-all cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-lg shadow-indigo-500/25 hover:bg-indigo-700 transition-all cursor-pointer disabled:opacity-60"
            >
              <KeyRound className="h-3.5 w-3.5" />
              <span>{saving ? 'Guardando...' : 'Cambiar contraseña'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
