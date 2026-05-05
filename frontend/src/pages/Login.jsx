import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { ShieldAlert, Eye, EyeOff, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";

export default function LoginPage() {
  const { t } = useTranslation();
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const user = await login(email.trim(), password);
      if (user.role === "admin") {
        navigate("/admin", { replace: true });
      } else {
        navigate("/dashboard", { replace: true });
      }
    } catch (err) {
      setError(err.message || "Invalid credentials");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6 selection:bg-primary/30">
      <div className="max-w-md w-full card-premium p-8 shadow-2xl relative overflow-hidden group">
        <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-primary via-sky-400 to-primary" />
        
        <div className="flex items-center gap-4 mb-10">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center text-primary shadow-inner group-hover:scale-110 transition-transform duration-300">
            <ShieldAlert size={28} />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{t('auth.signIn')}</h1>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-widest mt-1">{t('auth.signInDesc')}</p>
          </div>
        </div>

        {error && (
          <div className="bg-destructive/10 border border-destructive/20 text-destructive p-4 rounded-xl text-sm font-semibold mb-6 animate-in slide-in-from-top-2">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <label className="label-premium">{t('auth.email')}</label>
            <input
              type="email"
              placeholder="officer@court.gov.in"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="input-premium"
            />
          </div>

          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <label className="label-premium">{t('auth.password')}</label>
              <Link to="/forgot-password" size="sm" className="text-[10px] font-bold text-primary hover:underline uppercase tracking-widest">
                {t('auth.forgotPassword')}
              </Link>
            </div>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="input-premium pr-12"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-2 text-muted-foreground hover:text-foreground transition-colors"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full btn-primary-premium py-4 text-sm font-bold uppercase tracking-[0.2em] shadow-lg shadow-primary/20"
          >
            {loading ? <Loader2 size={20} className="animate-spin mx-auto" /> : t('auth.login')}
          </button>
        </form>

        <div className="mt-10 pt-6 border-t border-border text-center">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-widest">
            {t('auth.newUser')} <Link to="/register" className="text-primary font-bold hover:underline ml-1">{t('auth.createAccount')}</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
