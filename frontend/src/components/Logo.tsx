import { useEffect, useState } from 'react';

interface LogoProps {
  size?: number;
  className?: string;
  /** Fuerza recarga del logo (ej. tras subir uno nuevo desde Configuración). */
  refreshKey?: number;
}

/**
 * Muestra el logo institucional configurado en /api/settings.
 * Mientras carga, o si nunca se configuró uno, muestra un skeleton.
 */
export function Logo({ size = 40, className = '', refreshKey = 0 }: LogoProps) {
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/settings')
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setLogoDataUrl(d.logoDataUrl || null); })
      .catch(() => { if (!cancelled) setLogoDataUrl(null); });
    return () => { cancelled = true; };
  }, [refreshKey]);

  if (!logoDataUrl) {
    return (
      <div
        style={{ width: size, height: size }}
        className={`rounded-xl bg-slate-700/40 animate-pulse shrink-0 ${className}`}
        title="Sin logo institucional configurado"
      />
    );
  }

  return (
    <img
      src={logoDataUrl}
      alt="Logo institucional"
      style={{ height: size, width: 'auto', maxWidth: '100%' }}
      className={`object-contain shrink-0 ${className}`}
    />
  );
}
