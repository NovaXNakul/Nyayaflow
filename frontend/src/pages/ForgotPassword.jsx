import { useState } from "react";
import { Link } from "react-router-dom";
import { forgotPassword } from "../api";
import { ShieldAlert, ArrowLeft, Mail, CheckCircle2 } from "lucide-react";
import { useTranslation } from "react-i18next";

export default function ForgotPasswordPage() {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      const res = await forgotPassword(email.trim());
      setMessage(res.message || "If this email is registered, you will receive a reset link shortly.");
    } catch (err) {
      setError(err.message || "Failed to send reset link");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#020617] text-slate-900 dark:text-slate-200 flex items-center justify-center p-6 transition-colors duration-300">
      <div className="max-w-md w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-3xl p-8 shadow-2xl shadow-slate-200/50 dark:shadow-slate-950/20">
        <Link to="/login" className="inline-flex items-center gap-2 text-slate-500 dark:text-slate-400 hover:text-sky-500 dark:hover:text-white transition-colors mb-8 text-sm">
          <ArrowLeft size={16} /> {t('auth.backToLogin')}
        </Link>

        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-2xl bg-sky-500/15 flex items-center justify-center text-sky-500 dark:text-sky-400">
            <Mail size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">{t('auth.resetPassword')}</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">{t('auth.resetPasswordDesc')}</p>
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
              <p className="text-sm leading-relaxed">{message}</p>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            <label className="block">
              <span className="text-sm font-medium text-slate-500 dark:text-slate-400">{t('auth.email')}</span>
              <input
                type="email"
                placeholder="email@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="mt-2 w-full rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 px-4 py-3 text-slate-900 dark:text-white outline-none focus:border-sky-500 transition-all"
              />
            </label>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-2xl bg-sky-500 px-4 py-3 text-white font-semibold transition hover:bg-sky-400 disabled:opacity-50 shadow-lg shadow-sky-500/20"
            >
              {loading ? t('common.loading') : t('auth.sendLink')}
            </button>
          </form>
        )}

        <div className="mt-8 pt-6 border-t border-slate-800 text-center">
          <p className="text-xs text-slate-500">
            Need help? Contact the system administrator.
          </p>
        </div>
      </div>
    </div>
  );
}
