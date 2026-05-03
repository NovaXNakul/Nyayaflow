import { AlertTriangle, Clock, CheckCircle2 } from "lucide-react";

export const PriorityBadge = ({ priority }) => {
  const styles = {
    High: "bg-red-500/10 text-red-500 border-red-500/20",
    Medium: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
    Low: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
  };
  const icon = {
    High: <AlertTriangle size={14} />,
    Medium: <Clock size={14} />,
    Low: <CheckCircle2 size={14} />,
  };

  return (
    <div className={`px-3 py-1.5 rounded-full text-xs font-semibold border flex items-center gap-1.5 ${styles[priority] || "bg-slate-500/10 text-slate-400 border-slate-500/20"}`}>
      {icon[priority] || <Clock size={14} />}
      {priority ? priority.toUpperCase() : "UNKNOWN"}
    </div>
  );
};
