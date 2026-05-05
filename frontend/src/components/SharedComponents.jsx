import { AlertTriangle, Clock, CheckCircle2 } from "lucide-react";
import { useTranslation } from "react-i18next";

export const PriorityBadge = ({ priority }) => {
  const { t } = useTranslation();
  
  const styles = {
    High: "bg-destructive/10 text-destructive border-destructive/20",
    Medium: "bg-warning/10 text-warning border-warning/20",
    Low: "bg-success/10 text-success border-success/20",
  };
  
  const icons = {
    High: <AlertTriangle size={14} />,
    Medium: <Clock size={14} />,
    Low: <CheckCircle2 size={14} />,
  };

  const labelKey = priority ? priority.toLowerCase() : "unknown";

  return (
    <div className={`px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 border ${styles[priority] || "bg-muted text-muted-foreground border-border"}`}>
      {icons[priority] || <Clock size={14} />}
      {t(`status.${labelKey}`)}
    </div>
  );
};
