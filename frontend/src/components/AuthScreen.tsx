import { useState, useRef, useEffect, type FormEvent, type KeyboardEvent, type MutableRefObject } from 'react';
import QRCode from 'qrcode';
import { ShieldCheck, Lock, User, KeyRound, ArrowRight, ArrowLeft, AlertCircle, Eye, EyeOff, Smartphone, Clock, ShieldAlert } from 'lucide-react';
import { Logo } from './Logo';

export type LoginStepResult =
  | { status: 'mfaSetupRequired'; pendingToken: string; otpauthUrl: string }
  | { status: 'mfaRequired'; pendingToken: string }
  | { status: 'error'; message: string };

export type MfaConfirmResult = { status: 'success' } | { status: 'error'; message: string };

interface AuthScreenProps {
  onLogin: (username: string, password: string) => Promise<LoginStepResult>;
  onMfaConfirm: (pendingToken: string, code: string) => Promise<MfaConfirmResult>;
}

type AuthStep = { name: 'login' } | { name: 'mfa-setup'; pendingToken: string; otpauthUrl: string } | { name: 'mfa-verify'; pendingToken: string };

function useTotpCountdown() {
  const [secondsLeft, setSecondsLeft] = useState(30 - (Math.floor(Date.now() / 1000) % 30));
  useEffect(() => {
    const id = setInterval(() => setSecondsLeft(30 - (Math.floor(Date.now() / 1000) % 30)), 1000);
    return () => clearInterval(id);
  }, []);
  return secondsLeft;
}

export function AuthScreen({ onLogin, onMfaConfirm }: AuthScreenProps) {
  const [step, setStep] = useState<AuthStep>({ name: 'login' });

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [otpDigits, setOtpDigits] = useState<string[]>(['', '', '', '', '', '']);
  const [mfaError, setMfaError] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const otpInputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const secondsLeft = useTotpCountdown();

  useEffect(() => {
    if (step.name !== 'mfa-setup') return;
    QRCode.toDataURL(step.otpauthUrl, { margin: 1, width: 200 }).then(setQrDataUrl).catch(() => setQrDataUrl(''));
  }, [step]);

  useEffect(() => {
    if (step.name === 'mfa-setup' || step.name === 'mfa-verify') {
      setTimeout(() => otpInputRefs.current[0]?.focus(), 100);
    }
  }, [step.name]);

  const handleLoginSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoginError(null);

    const cleanUser = username.trim();
    const cleanPass = password.trim();
    if (!cleanUser || !cleanPass) {
      setLoginError('Por favor ingresa tu nombre de usuario y contraseña.');
      return;
    }

    setIsSubmitting(true);
    const result = await onLogin(cleanUser, cleanPass);
    setIsSubmitting(false);

    if (result.status === 'error') {
      setLoginError(result.message);
      return;
    }
    setOtpDigits(['', '', '', '', '', '']);
    setMfaError(null);
    if (result.status === 'mfaSetupRequired') {
      setStep({ name: 'mfa-setup', pendingToken: result.pendingToken, otpauthUrl: result.otpauthUrl });
    } else {
      setStep({ name: 'mfa-verify', pendingToken: result.pendingToken });
    }
  };

  const handleOtpChange = (index: number, val: string) => {
    const cleaned = val.replace(/\D/g, '');
    const newDigits = [...otpDigits];

    if (cleaned.length > 1) {
      const pasted = cleaned.slice(0, 6).split('');
      for (let i = 0; i < 6; i++) newDigits[i] = pasted[i] || '';
      setOtpDigits(newDigits);
      otpInputRefs.current[Math.min(pasted.length, 5)]?.focus();
      return;
    }

    newDigits[index] = cleaned;
    setOtpDigits(newDigits);
    if (cleaned && index < 5) otpInputRefs.current[index + 1]?.focus();
  };

  const handleOtpKeyDown = (index: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !otpDigits[index] && index > 0) {
      otpInputRefs.current[index - 1]?.focus();
    }
  };

  const handleMfaSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (step.name === 'login') return;

    const code = otpDigits.join('');
    if (code.length < 6) {
      setMfaError('Por favor ingresa los 6 dígitos del código de verificación.');
      return;
    }

    setIsSubmitting(true);
    const result = await onMfaConfirm(step.pendingToken, code);
    setIsSubmitting(false);

    if (result.status === 'error') {
      setMfaError(result.message);
      setOtpDigits(['', '', '', '', '', '']);
      otpInputRefs.current[0]?.focus();
    }
  };

  return (
    <div className="relative min-h-screen w-full flex items-center justify-center p-4 bg-slate-900 text-slate-100 overflow-hidden selection:bg-indigo-500 selection:text-white">
      <div className="absolute top-1/4 left-1/4 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-indigo-600/20 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 translate-x-1/2 translate-y-1/2 w-96 h-96 bg-sky-500/15 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute top-2/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-purple-600/15 rounded-full blur-[100px] pointer-events-none" />

      <div className="relative w-full max-w-md z-10">
        <div className="flex flex-col items-center text-center mb-8">
          <Logo size={96} className="mb-4" />
          <h1 className="text-2xl font-black tracking-tight text-white flex items-center gap-2">
            ControlCenter
            <span className="rounded-lg bg-indigo-500/20 px-2 py-0.5 text-xs font-bold text-indigo-300 border border-indigo-400/30">Local</span>
          </h1>
          <p className="text-xs text-slate-400 font-medium mt-1">Portal institucional de gestión y catálogo seguro</p>
        </div>

        <div id="auth-card" className="rounded-3xl border border-white/10 bg-slate-800/80 backdrop-blur-2xl p-6 sm:p-8 shadow-2xl shadow-slate-950/60 transition-all">
          {step.name === 'login' && (
            <div>
              <div className="border-b border-slate-700/60 pb-4 mb-6">
                <h2 className="text-lg font-extrabold text-white">Inicio de Sesión</h2>
                <p className="text-xs text-slate-400 mt-0.5">Ingresa tus credenciales institucionales para continuar.</p>
              </div>

              {loginError && (
                <div id="login-error-alert" className="mb-5 flex items-start gap-2.5 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-200 animate-in fade-in duration-150">
                  <AlertCircle className="h-4 w-4 shrink-0 text-red-400 mt-0.5" />
                  <span>{loginError}</span>
                </div>
              )}

              <form onSubmit={handleLoginSubmit} className="space-y-4">
                <div>
                  <label htmlFor="input-username" className="block text-[11px] font-bold uppercase tracking-wider text-slate-300 mb-1.5">
                    Usuario institucional
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                      <User className="h-4 w-4" />
                    </div>
                    <input
                      id="input-username"
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      required
                      autoComplete="username"
                      className="w-full rounded-xl border border-slate-700 bg-slate-900/80 py-2.5 pl-10 pr-3.5 text-sm text-white placeholder:text-slate-500 focus:border-indigo-500 focus:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="input-password" className="block text-[11px] font-bold uppercase tracking-wider text-slate-300 mb-1.5">
                    Contraseña
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                      <Lock className="h-4 w-4" />
                    </div>
                    <input
                      id="input-password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      autoComplete="current-password"
                      className="w-full rounded-xl border border-slate-700 bg-slate-900/80 py-2.5 pl-10 pr-10 text-sm text-white placeholder:text-slate-500 focus:border-indigo-500 focus:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-200 transition-colors"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <button
                  id="btn-login-submit"
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full mt-2 flex items-center justify-center gap-2 rounded-xl bg-indigo-600 py-3 text-xs font-bold text-white shadow-lg shadow-indigo-600/30 hover:bg-indigo-500 active:scale-98 transition-all cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <span>Validando credenciales...</span>
                  ) : (
                    <>
                      <span>Continuar con verificación MFA</span>
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </button>
              </form>
            </div>
          )}

          {step.name === 'mfa-setup' && (
            <div>
              <button
                type="button"
                onClick={() => setStep({ name: 'login' })}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-white mb-4 transition-colors cursor-pointer"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                <span>Volver al inicio de sesión</span>
              </button>

              <div className="border-b border-slate-700/60 pb-4 mb-5">
                <div className="flex items-center gap-2.5 mb-1.5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                    <Smartphone className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-extrabold text-white">Configure su MFA</h2>
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-indigo-300 uppercase tracking-wider">Paso 2 de 2 · Primera vez</span>
                  </div>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed mt-2">
                  Escanee el código con Google Authenticator, Authy o similar, y luego ingrese el código de 6 dígitos generado.
                </p>
              </div>

              <div className="flex justify-center mb-5">
                {qrDataUrl ? (
                  <img src={qrDataUrl} alt="Código QR para configurar MFA" className="rounded-xl border-4 border-white" />
                ) : (
                  <div className="w-[200px] h-[200px] rounded-xl bg-slate-700/50 animate-pulse" />
                )}
              </div>

              {mfaError && (
                <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-200 animate-in fade-in duration-150">
                  <ShieldAlert className="h-4 w-4 shrink-0 text-red-400 mt-0.5" />
                  <span>{mfaError}</span>
                </div>
              )}

              <form onSubmit={handleMfaSubmit} className="space-y-5">
                <OtpInputs digits={otpDigits} refs={otpInputRefs} onChange={handleOtpChange} onKeyDown={handleOtpKeyDown} secondsLeft={secondsLeft} />
                <button
                  id="btn-verify-mfa"
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-indigo-600 py-3 text-xs font-bold text-white shadow-lg shadow-indigo-600/30 hover:bg-indigo-500 active:scale-98 transition-all cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <span>Verificando...</span>
                  ) : (
                    <>
                      <KeyRound className="h-4 w-4" />
                      <span>Confirmar y acceder a ControlCenter</span>
                    </>
                  )}
                </button>
              </form>
            </div>
          )}

          {step.name === 'mfa-verify' && (
            <div>
              <button
                type="button"
                onClick={() => setStep({ name: 'login' })}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-white mb-4 transition-colors cursor-pointer"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                <span>Volver al inicio de sesión</span>
              </button>

              <div className="border-b border-slate-700/60 pb-4 mb-5">
                <div className="flex items-center gap-2.5 mb-1.5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                    <Smartphone className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-extrabold text-white">Autenticación MFA</h2>
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-indigo-300 uppercase tracking-wider">Paso 2 de 2 · Verificación en dos pasos</span>
                  </div>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed mt-2">Introduce el código de 6 dígitos generado en tu aplicación autenticadora.</p>
              </div>

              {mfaError && (
                <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-200 animate-in fade-in duration-150">
                  <ShieldAlert className="h-4 w-4 shrink-0 text-red-400 mt-0.5" />
                  <span>{mfaError}</span>
                </div>
              )}

              <form onSubmit={handleMfaSubmit} className="space-y-5">
                <OtpInputs digits={otpDigits} refs={otpInputRefs} onChange={handleOtpChange} onKeyDown={handleOtpKeyDown} secondsLeft={secondsLeft} />
                <button
                  id="btn-verify-mfa"
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-indigo-600 py-3 text-xs font-bold text-white shadow-lg shadow-indigo-600/30 hover:bg-indigo-500 active:scale-98 transition-all cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <span>Verificando autenticación...</span>
                  ) : (
                    <>
                      <KeyRound className="h-4 w-4" />
                      <span>Verificar y acceder a ControlCenter</span>
                    </>
                  )}
                </button>
              </form>
            </div>
          )}
        </div>

        <div className="mt-6 text-center text-[11px] text-slate-500 flex items-center justify-center gap-1.5">
          <Lock className="h-3.5 w-3.5 text-slate-600" />
          <span>Acceso restringido a personal autorizado por la Dirección de TI</span>
        </div>
      </div>
    </div>
  );
}

function OtpInputs({
  digits,
  refs,
  onChange,
  onKeyDown,
  secondsLeft,
}: {
  digits: string[];
  refs: MutableRefObject<(HTMLInputElement | null)[]>;
  onChange: (index: number, val: string) => void;
  onKeyDown: (index: number, e: KeyboardEvent<HTMLInputElement>) => void;
  secondsLeft: number;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="text-[11px] font-bold uppercase tracking-wider text-slate-300">Código de seguridad (6 dígitos)</label>
        <span className="inline-flex items-center gap-1 text-[11px] text-slate-400">
          <Clock className="h-3 w-3" />
          Cambia en {secondsLeft}s
        </span>
      </div>
      <div className="flex justify-between gap-2 sm:gap-2.5">
        {digits.map((digit, idx) => (
          <input
            key={idx}
            ref={(el) => {
              refs.current[idx] = el;
            }}
            type="text"
            inputMode="numeric"
            maxLength={1}
            value={digit}
            onChange={(e) => onChange(idx, e.target.value)}
            onKeyDown={(e) => onKeyDown(idx, e)}
            className="h-12 w-11 sm:w-12 rounded-xl border border-slate-700 bg-slate-900/90 text-center text-lg font-mono font-bold text-white focus:border-indigo-500 focus:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 transition-all"
          />
        ))}
      </div>
    </div>
  );
}
