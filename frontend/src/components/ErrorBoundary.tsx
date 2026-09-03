import { Component, ReactNode } from 'react';

interface Props { children: ReactNode; }
interface State { error: Error | null; }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State { return { error }; }

  render() {
    if (this.state.error) return <main className="min-h-screen bg-slate-900 p-6 flex items-center justify-center text-center"><div className="max-w-lg rounded-2xl border border-rose-400/30 bg-slate-800 p-7 text-slate-100 shadow-2xl"><h1 className="text-lg font-bold text-rose-300">No se pudo cargar la aplicación</h1><p className="mt-2 text-sm text-slate-300">Recarga la página. Si continúa, comparte este mensaje:</p><pre className="mt-4 overflow-auto rounded-lg bg-slate-950 p-3 text-left text-xs text-rose-200">{this.state.error.message}</pre></div></main>;
    return this.props.children;
  }
}
