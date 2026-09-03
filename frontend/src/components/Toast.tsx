import { CheckCircle2, Info, AlertTriangle, X } from 'lucide-react';

export interface ToastMessage {
  id: string;
  type: 'success' | 'info' | 'warning';
  title: string;
  message?: string;
}

interface ToastContainerProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

export function ToastContainer({ toasts, onDismiss }: ToastContainerProps) {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="pointer-events-auto flex items-start gap-3 rounded-2xl border border-white/80 bg-white/85 backdrop-blur-xl p-4 shadow-2xl transition-all animate-in slide-in-from-bottom-2 fade-in duration-200"
        >
          {toast.type === 'success' && (
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-emerald-100/80 text-emerald-600 border border-emerald-200/60 shadow-2xs">
              <CheckCircle2 className="h-4 w-4" />
            </div>
          )}
          {toast.type === 'info' && (
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-indigo-100/80 text-indigo-600 border border-indigo-200/60 shadow-2xs">
              <Info className="h-4 w-4" />
            </div>
          )}
          {toast.type === 'warning' && (
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-amber-100/80 text-amber-600 border border-amber-200/60 shadow-2xs">
              <AlertTriangle className="h-4 w-4" />
            </div>
          )}

          <div className="flex-1 text-xs">
            <p className="font-extrabold text-slate-900">{toast.title}</p>
            {toast.message && (
              <p className="text-slate-500 mt-0.5 leading-normal font-medium">{toast.message}</p>
            )}
          </div>

          <button
            onClick={() => onDismiss(toast.id)}
            className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100/80 transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
