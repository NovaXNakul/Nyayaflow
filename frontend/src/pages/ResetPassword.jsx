import { useState, useEffect } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { resetPassword } from "../api";
import { ShieldAlert, KeyRound, Eye, EyeOff, CheckCircle2 } from "lucide-react";
import { useTranslation } from "react-i18next";

export default function ResetPasswordPage() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get("token");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!token) {
      setError(t('auth.invalidToken'));
    }
  }, [token, t]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      setError(t('auth.passwordMismatch'));
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters long.");
      return;
    }

    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      await resetPassword(token, password);
      setMessage("Your password has been successfully reset.");
      setTimeout(() => navigate("/login"), 3000);
    } catch (err) {
      setError(err.message || "Failed to reset password. The link might be expired.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#020617] text-slate-900 dark:text-slate-200 flex items-center justify-center p-6 transition-colors duration-300">
      <div className="max-w-md w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-3xl p-8 shadow-2xl shadow-slate-200/50 dark:shadow-slate-950/20">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-2xl bg-sky-500/15 flex items-center justify-center text-sky-500 dark:text-sky-400">
            <KeyRound size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">{t('auth.newPassword')}</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">{t('auth.newPasswordDesc')}</p>
          </div>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-300 p-3 rounded-xl mb-6 text-sm">
            {error}
          </div>
        )}

        {message ? (
          <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 p-4 rounded-xl mb-6">
            <div className="flex gap-3">
              <CheckCircle2 size={20} className="shrink-0" />
              <div>
                <p className="text-sm font-semibold">{message}</p>
                <p className="text-xs mt-1 opacity-70">Redirecting to login...</p>
              </div>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-4">
              <label className="block">
                <span className="text-sm font-medium text-slate-500 dark:text-slate-400">{t('auth.newPassword')}</span>
                <div className="relative mt-2">
                  <input
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    disabled={!token}
                    className="w-full rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 px-4 py-3 text-slate-900 dark:text-white outline-none focus:border-sky-500 pr-12 transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </label>

              <label className="block">
                <span className="text-sm font-medium text-slate-500 dark:text-slate-400">{t('auth.confirmPassword')}</span>
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  disabled={!token}
                  className="mt-2 w-full rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 px-4 py-3 text-slate-900 dark:text-white outline-none focus:border-sky-500 transition-all"
                />
              </label>
            </div>

            <button
              type="submit"
              disabled={loading || !token}
              className="w-full rounded-2xl bg-sky-500 px-4 py-3 text-white font-semibold transition hover:bg-sky-400 disabled:opacity-50 shadow-lg shadow-sky-500/20"
            >
              {loading ? t('common.loading') : t('auth.resetPassword')}
            </button>
          </form>
        )}

        {!message && (
          <div className="mt-8 pt-6 border-t border-slate-200 dark:border-slate-800 text-center">
            <Link to="/login" className="text-xs text-slate-500 hover:text-sky-400 transition-colors">
              {t('auth.alreadyRegistered')}
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
