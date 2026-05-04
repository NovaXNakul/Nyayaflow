import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("officer");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await register(username.trim(), email.trim(), password, role);
      navigate("/login", { replace: true });
    } catch (err) {
      setError(err.message || "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#020617] text-slate-200 flex items-center justify-center p-6">
      <div className="max-w-lg w-full bg-slate-950 border border-slate-800 rounded-3xl p-8 shadow-2xl shadow-slate-950/20">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-white">Create Account</h1>
          <p className="text-sm text-slate-400">Register as an officer or initial admin for the workflow system.</p>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-300 p-3 rounded-xl mb-4">{error}</div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <label className="block">
            <span className="text-sm text-slate-400">Username</span>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              className="mt-2 w-full rounded-2xl border border-slate-800 bg-slate-900 px-4 py-3 text-white outline-none focus:border-sky-500"
            />
          </label>

          <label className="block">
            <span className="text-sm text-slate-400">Email</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="mt-2 w-full rounded-2xl border border-slate-800 bg-slate-900 px-4 py-3 text-white outline-none focus:border-sky-500"
            />
          </label>

          <label className="block">
            <span className="text-sm text-slate-400">Password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="mt-2 w-full rounded-2xl border border-slate-800 bg-slate-900 px-4 py-3 text-white outline-none focus:border-sky-500"
            />
          </label>

          <label className="block">
            <span className="text-sm text-slate-400">Role</span>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="mt-2 w-full rounded-2xl border border-slate-800 bg-slate-900 px-4 py-3 text-white outline-none focus:border-sky-500"
            >
              <option value="officer">Officer</option>
              <option value="admin">Admin</option>
            </select>
            <p className="text-xs text-slate-500 mt-2">Admin registration is restricted after initial setup.</p>
          </label>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-2xl bg-sky-500 px-4 py-3 text-white font-semibold transition hover:bg-sky-400 disabled:opacity-50"
          >
            {loading ? "Creating account..." : "Register"}
          </button>
        </form>

        <p className="text-sm text-slate-500 mt-6 text-center">
          Already registered? <Link to="/login" className="text-sky-400 hover:text-sky-300">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
