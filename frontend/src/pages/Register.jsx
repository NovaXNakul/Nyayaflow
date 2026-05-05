import { useState, useEffect } from "react";
import { useNavigate, Link, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { ShieldAlert, Eye, EyeOff, Loader2, CheckCircle2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { validateInvite } from "../api";

export default function RegisterPage() {
  const { t } = useTranslation();
  const { register } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [role, setRole] = useState("officer");
  const [token, setToken] = useState(null);
  
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [validating, setValidating] = useState(false);
  const [isInviteMode, setIsInviteMode] = useState(false);

  useEffect(() => {
    const queryParams = new URLSearchParams(location.search);
    const inviteToken = queryParams.get("token");
    if (inviteToken) {
      setToken(inviteToken);
      setIsInviteMode(true);
      checkInvite(inviteToken);
    }
  }, [location]);

  const checkInvite = async (inviteToken) => {
    setValidating(true);
    try {
      const res = await validateInvite(inviteToken);
      setEmail(res.email);
      if (res.name) setName(res.name);
      setRole(res.role);
    } catch (err) {
      setError("Invalid or expired invitation link.");
      setIsInviteMode(false);
    } finally {
      setValidating(false);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      // Use the existing register function which now handles tokens internally if provided
      await register(name.trim(), email.trim(), password, role, token);
      navigate("/login", { replace: true });
    } catch (err) {
      setError(err.message || "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  if (validating) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
        <Loader2 size={48} className="text-primary animate-spin mb-4" />
        <p className="text-sm font-bold uppercase tracking-widest text-muted-foreground animate-pulse">Validating Invitation...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6 selection:bg-primary/30">
      <div className="max-w-md w-full card-premium p-8 shadow-2xl relative overflow-hidden group">
        <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-primary via-sky-400 to-primary" />
        
        <div className="flex items-center gap-4 mb-10">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center text-primary shadow-inner group-hover:scale-110 transition-transform duration-300">
            <ShieldAlert size={28} />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              {isInviteMode ? "Join as Officer" : t('auth.createAccount')}
            </h1>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-widest mt-1">
              {isInviteMode ? "You've been invited to join the team" : t('auth.registerDesc')}
            </p>
          </div>
        </div>

        {isInviteMode && (
          <div className="bg-primary/5 border border-primary/20 p-4 rounded-xl mb-6 flex items-start gap-3">
            <CheckCircle2 size={18} className="text-primary shrink-0 mt-0.5" />
            <p className="text-xs font-medium text-primary leading-relaxed">
              This invitation link is valid for <strong>{email}</strong>. Please complete your profile to activate your account.
            </p>
          </div>
        )}

        {error && (
          <div className="bg-destructive/10 border border-destructive/20 text-destructive p-4 rounded-xl text-sm font-semibold mb-6 animate-in slide-in-from-top-2">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <label className="label-premium">{t('auth.fullName')}</label>
            <input
              type="text"
              placeholder="Officer Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="input-premium"
            />
          </div>

          <div className="space-y-2">
            <label className="label-premium">{t('auth.email')}</label>
            <input
              type="email"
              placeholder="officer@court.gov.in"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={isInviteMode}
              className={`input-premium ${isInviteMode ? 'bg-muted/50 cursor-not-allowed opacity-80' : ''}`}
            />
          </div>

          <div className="space-y-2">
            <label className="label-premium">{t('auth.password')}</label>
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

          {!isInviteMode && (
            <div className="space-y-2">
              <label className="label-premium">{t('auth.role')}</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="input-premium"
              >
                <option value="officer">{t('roles.officer')}</option>
                <option value="admin">{t('roles.admin')}</option>
              </select>
              <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">{t('auth.adminRestricted')}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={loading || (isInviteMode && !email)}
            className="w-full btn-primary-premium py-4 text-sm font-bold uppercase tracking-[0.2em] shadow-lg shadow-primary/20 mt-4"
          >
            {loading ? <Loader2 size={20} className="animate-spin mx-auto" /> : (isInviteMode ? "Activate Account" : t('auth.register'))}
          </button>
        </form>

        <div className="mt-10 pt-6 border-t border-border text-center">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-widest">
            {t('auth.alreadyRegistered')} <Link to="/login" className="text-primary font-bold hover:underline ml-1">{t('auth.signIn')}</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
