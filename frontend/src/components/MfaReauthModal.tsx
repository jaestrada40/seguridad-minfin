import { useEffect, useState } from 'react';
import { Clock3, ShieldCheck, X } from 'lucide-react';

interface Props {
  isOpen: boolean;
  action: 'reveal' | 'backup' | 'import';
  onClose: () => void;
  onSubmit: (code: string) => Promise<string | null>;
}

export function MfaReauthModal({ isOpen, action, onClose, onSubmit }: Props) {
  const [code, setCode] = useState('');
  const [seconds, setSeconds] = useState(60);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setCode(''); setError(null); setSeconds(60);
    const timer = window.setInterval(() => setSeconds((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [isOpen]);

  if (!isOpen) return null;
  const title = action === 'reveal' ? 'Confirmar copia de contraseña' : action === 'backup' ? 'Confirmar descarga de respaldo' : 'Confirmar importación Excel';
  const detail = action === 'reveal'
    ? 'Por seguridad, ingresa tu código MFA para revelar esta contraseña. Esta confirmación se consume en una sola copia.'
    : action === 'backup' ? 'Por seguridad, ingresa tu código MFA para descargar el respaldo cifrado. Esta confirmación se consume en una sola descarga.' : 'Por seguridad, ingresa tu código MFA antes de importar credenciales desde Excel.';

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!/^\d{6}$/.test(code)) { setError('Ingresa los 6 dígitos de tu aplicación autenticadora.'); return; }
    setSubmitting(true);
    const result = await onSubmit(code);
    setSubmitting(false);
    if (result) setError(result);
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="mfa-reauth-title">
      <form onSubmit={submit} className="w-full max-w-md rounded-3xl border border-white/15 bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-700"><ShieldCheck className="h-6 w-6" /></div>
          <button type="button" onClick={onClose} disabled={submitting} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X className="h-5 w-5" /></button>
        </div>
        <h2 id="mfa-reauth-title" className="mt-4 text-lg font-extrabold text-slate-900">{title}</h2>
        <p className="mt-1.5 text-sm leading-relaxed text-slate-500">{detail}</p>
        <label className="mt-5 block text-xs font-bold uppercase tracking-wider text-slate-500">Código MFA</label>
        <input autoFocus inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} className="mt-2 w-full rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 text-center font-mono text-2xl font-bold tracking-[0.45em] text-slate-900 outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100" placeholder="000000" />
        <div className="mt-3 flex items-center gap-1.5 text-xs font-medium text-slate-500"><Clock3 className="h-3.5 w-3.5 text-indigo-600" /> El código puede enviarse durante {seconds} s.</div>
        {error && <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">{error}</p>}
        <div className="mt-6 flex gap-3"><button type="button" onClick={onClose} disabled={submitting} className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-50">Cancelar</button><button type="submit" disabled={submitting || seconds === 0} className="flex-1 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-indigo-500/25 hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50">{submitting ? 'Validando…' : 'Confirmar MFA'}</button></div>
      </form>
    </div>
  );
}
