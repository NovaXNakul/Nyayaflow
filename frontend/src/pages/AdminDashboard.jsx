import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  Loader2,
  CheckCircle2,
  XCircle,
  Calendar,
  AlertTriangle,
  Clock,
  RefreshCcw,
  FileText,
  UploadCloud,
  ChevronRight,
  ChevronDown,
  MessageSquare,
  ShieldAlert,
  Send,
  Building2,
  Activity,
  FolderOpen,
  Eye,
  Download,
  Printer,
  X
} from "lucide-react";
import { useTranslation } from "react-i18next";
import Navbar from "../components/Navbar";
import { useAuth } from "../context/AuthContext";
import { usePreventBackButton } from "../hooks/usePreventBackButton";
import {
  askChat,
  extractData,
  fetchDashboard,
  fetchCases,
  fetchCaseDetails,
  generateAction,
  uploadFile,
  verifyData,
  fetchUsers,
  assignCase,
  createTask,
  fetchAllTasks,
  sendInvite,
  downloadReport,
  fetchReportData,
  viewOriginalDoc
} from "../api";
import { PriorityBadge } from "../components/SharedComponents";

export default function AdminDashboard() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  usePreventBackButton("/login");
  
  const [file, setFile] = useState(null);
  const [docId, setDocId] = useState(null);
  const [extractRes, setExtractRes] = useState(null);
  const [actionRes, setActionRes] = useState(null);
  const [dashboard, setDashboard] = useState(null);
  const [cases, setCases] = useState([]);
  const [users, setUsers] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [globalError, setGlobalError] = useState(null);
  const chatScrollRef = useRef(null);

  const [editForm, setEditForm] = useState({});
  const [chatQ, setChatQ] = useState("");
  const [chatHistory, setChatHistory] = useState([]);
  const [taskForm, setTaskForm] = useState({ assigned_to: "", status: "pending", deadline: "", case_id: null });
  const [assignmentTarget, setAssignmentTarget] = useState("");
  const [inviteForm, setInviteForm] = useState({ email: "", name: "" });
  const [inviteMessage, setInviteMessage] = useState(null);
  const [loadingInvite, setLoadingInvite] = useState(false);
  
  const [loadingUpload, setLoadingUpload] = useState(false);
  const [loadingExtract, setLoadingExtract] = useState(false);
  const [loadingAction, setLoadingAction] = useState(false);
  const [loadingVerify, setLoadingVerify] = useState(false);
  const [loadingDashboard, setLoadingDashboard] = useState(false);
  const [loadingCases, setLoadingCases] = useState(false);
  const [loadingChat, setLoadingChat] = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [loadingReport, setLoadingReport] = useState(false);
  
  const [assignmentMessage, setAssignmentMessage] = useState(null);
  const [taskMessage, setTaskMessage] = useState(null);
  const [reportLang, setReportLang] = useState(i18n.language || "en");

  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [directivesExpanded, setDirectivesExpanded] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [reportData, setReportData] = useState(null);

  useEffect(() => {
    if (!user) {
      navigate("/login", { replace: true });
      return;
    }
    loadDashboard();
    loadCases();
    loadUsers();
    loadTasks();
  }, [user]);

  useEffect(() => {
    setReportLang(i18n.language);
  }, [i18n.language]);

  useEffect(() => {
    if (extractRes && extractRes.extracted_data) {
      setEditForm(extractRes.extracted_data || {});
      setDirectivesExpanded(false);
    }
  }, [extractRes]);

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [chatHistory, loadingChat]);

  const loadDashboard = async () => {
    setLoadingDashboard(true);
    try {
      const data = await fetchDashboard();
      setDashboard(data);
      setGlobalError(null);
    } catch (e) {
      console.error(e);
      setGlobalError(t('common.error') + ": " + t('dashboard.failedLoad'));
    } finally {
      setLoadingDashboard(false);
    }
  };

  const loadCases = async () => {
    setLoadingCases(true);
    try {
      const data = await fetchCases();
      setCases(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error("Failed to load cases", e);
      setCases([]);
    } finally {
      setLoadingCases(false);
    }
  };

  const loadUsers = async () => {
    setLoadingUsers(true);
    try {
      const data = await fetchUsers();
      setUsers(data || []);
      setGlobalError(null);
    } catch (e) {
      console.error("Failed to load users", e);
      setUsers([]);
    } finally {
      setLoadingUsers(false);
    }
  };

  const loadTasks = async () => {
    setLoadingTasks(true);
    try {
      const data = await fetchAllTasks();
      setTasks(data || []);
      setGlobalError(null);
    } catch (e) {
      console.error("Failed to load tasks", e);
      setTasks([]);
    } finally {
      setLoadingTasks(false);
    }
  };

  const handleSelectCase = async (id) => {
    setLoadingExtract(true);
    setGlobalError(null);
    try {
      const data = await fetchCaseDetails(id);
      setDocId(id);
      setExtractRes({ extracted_data: data.extracted_data, status: data.status });
      if (data.action_plan) {
        setActionRes(data.action_plan);
      } else {
        setActionRes(null);
      }
      setChatHistory([]);
      setTaskForm(prev => ({ ...prev, case_id: id }));
      setAssignmentTarget(data.assigned_to || "");
      if (window.innerWidth < 1024) {
        setIsSidebarOpen(false);
      }
    } catch (e) {
      console.error(e);
      setGlobalError(t('common.error'));
    } finally {
      setLoadingExtract(false);
    }
  };

  const handleUpload = async () => {
    if (!file) return;
    setLoadingUpload(true);
    setGlobalError(null);
    try {
      const r = await uploadFile(file);
      const docIdValue = r.document_id;
      setDocId(docIdValue);
      await handleExtract(docIdValue);
      loadCases();
    } catch (e) {
      console.error("Upload error:", e);
      setGlobalError("Failed to upload and analyze document: " + (e.message || "Unknown error"));
    } finally {
      setLoadingUpload(false);
    }
  };

  const handleExtract = async (id = docId) => {
    if (!id) return;
    setLoadingExtract(true);
    setGlobalError(null);
    try {
      const r = await extractData(id);
      if (!r) throw new Error("Empty response from server");
      setExtractRes(r);
      loadCases();
    } catch (e) {
      console.error("Extraction error:", e);
      setGlobalError("Failed to extract insights from the document: " + e.message);
    } finally {
      setLoadingExtract(false);
    }
  };

  const handleGenerateAction = async () => {
    if (!docId) return;
    setLoadingAction(true);
    setGlobalError(null);
    try {
      const r = await generateAction(docId);
      if (!r || !r.plan) throw new Error("Invalid action plan response");
      setActionRes(r);
    } catch (e) {
      console.error("Action generation error:", e);
      setGlobalError("Failed to generate action plan.");
    } finally {
      setLoadingAction(false);
    }
  };

  const handleVerify = async (decision) => {
    if (!docId) return;
    setLoadingVerify(true);
    setGlobalError(null);
    try {
      await verifyData(docId, decision, decision === "approve" || decision === "edit" ? editForm : null);
      await loadDashboard();
      await loadCases();
      setExtractRes(prev => ({
        ...prev,
        extracted_data: editForm,
        status: decision === "approve" ? "approved" : decision === "reject" ? "rejected" : "edited",
      }));
    } catch (e) {
      console.error("Verification error:", e);
      setGlobalError("Failed to verify document.");
    } finally {
      setLoadingVerify(false);
    }
  };

  const handleChat = async (e) => {
    e.preventDefault();
    if (!chatQ.trim() || !docId || loadingChat) return;

    const question = chatQ;
    setChatQ("");
    setChatHistory(prev => [...prev, { role: "user", content: question }]);
    setLoadingChat(true);
    try {
      const r = await askChat(docId, question);
      if (!r || !r.answer) throw new Error("Invalid chat response");
      setChatHistory(prev => [...prev, { role: "assistant", content: r.answer }]);
    } catch (err) {
      console.error("Chat error:", err);
      setChatHistory(prev => [...prev, { role: "assistant", content: "Error generating response. The AI might be unavailable." }]);
    } finally {
      setLoadingChat(false);
    }
  };

  const handleAssignCase = async () => {
    if (!docId || !assignmentTarget) return;
    setAssignmentMessage(null);
    try {
      await assignCase(docId, Number(assignmentTarget));
      setAssignmentMessage({ type: 'success', text: "Case assigned successfully." });
      loadCases();
    } catch (err) {
      console.error("Assign error:", err);
      setAssignmentMessage({ type: 'error', text: err.message || "Failed to assign case." });
    }
  };

  const handleCreateTask = async () => {
    if (!taskForm.case_id || !taskForm.assigned_to) {
      setTaskMessage({ type: 'error', text: "Please select a case and officer for the task." });
      return;
    }
    setTaskMessage(null);
    try {
      await createTask(taskForm.case_id, Number(taskForm.assigned_to), taskForm.status, taskForm.deadline || null);
      setTaskForm({ ...taskForm, status: "pending", deadline: "" });
      setTaskMessage({ type: 'success', text: "Task created successfully." });
      loadTasks();
    } catch (err) {
      console.error("Task creation error:", err);
      setTaskMessage({ type: 'error', text: err.message || "Could not create task." });
    }
  };

  const handleInvite = async (e) => {
    e.preventDefault();
    if (!inviteForm.email.trim()) return;
    setLoadingInvite(true);
    setInviteMessage(null);
    try {
      await sendInvite(inviteForm.email.trim(), inviteForm.name.trim());
      setInviteMessage({ type: 'success', text: "Invitation sent successfully." });
      setInviteForm({ email: "", name: "" });
    } catch (err) {
      console.error("Invite error:", err);
      setInviteMessage({ type: 'error', text: err.message || "Failed to send invitation." });
    } finally {
      setLoadingInvite(false);
    }
  };

  const handlePreviewReport = async () => {
    if (!docId) return;
    setLoadingReport(true);
    try {
      const data = await fetchReportData(docId);
      setReportData(data);
      setShowPreview(true);
    } catch (e) {
      setGlobalError("Failed to load report preview.");
    } finally {
      setLoadingReport(false);
    }
  };

  const handleDownloadReport = async () => {
    if (!docId) return;
    try {
      await downloadReport(docId, reportLang);
    } catch (e) {
      setGlobalError("Failed to download report.");
    }
  };

  const handleViewOriginal = async () => {
    if (!docId) return;
    try {
      await viewOriginalDoc(docId);
    } catch (e) {
      setGlobalError("Failed to view original document.");
    }
  };

  const getUrgencyClasses = (dateStr) => {
    if (!dateStr) return "text-muted-foreground";
    const deadline = new Date(dateStr);
    const now = new Date();
    const diff = (deadline - now) / (1000 * 60 * 60 * 24);
    if (diff < 0) return "text-destructive font-bold animate-pulse";
    if (diff < 5) return "text-warning font-bold";
    return "text-success font-bold";
  };

  const getUrgencyText = (dateStr) => {
    if (!dateStr) return "Not Specified";
    const deadline = new Date(dateStr);
    if (isNaN(deadline.getTime())) return "Not Specified";
    const now = new Date();
    const diff = Math.ceil((deadline - now) / (1000 * 60 * 60 * 24));
    if (diff < 0) return `${Math.abs(diff)} ${t('dashboard.daysOverdue')}!`;
    if (diff === 0) return t('dashboard.dueToday');
    return `${diff} ${t('dashboard.daysLeft')}`;
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col page-transition">
      <Navbar 
        isSidebarOpen={isSidebarOpen} 
        setIsSidebarOpen={setIsSidebarOpen}
        title={t('common.dashboard')}
        subtitle="Admin Control Panel"
      />

      <div className="flex flex-1 max-w-[1600px] w-full mx-auto overflow-hidden relative">
        {/* Sidebar: Case History */}
        <aside className={`transition-all duration-300 ease-in-out border-r border-border bg-card flex flex-col h-[calc(100vh-4rem)] absolute md:relative z-40 ${isSidebarOpen ? 'w-80 translate-x-0' : 'w-80 -translate-x-full md:translate-x-0 md:w-0 md:opacity-0 md:border-none'}`}>
          <div className="p-6 border-b border-border flex justify-between items-center min-w-[320px]">
            <h2 className="font-bold flex items-center gap-2 text-lg"><FolderOpen size={20} className="text-primary" /> {t('common.cases')}</h2>
            <button onClick={loadCases} className="p-2 rounded-lg hover:bg-muted text-muted-foreground transition-colors" disabled={loadingCases}>
              <RefreshCcw size={16} className={loadingCases ? "animate-spin" : ""} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-3 min-w-[320px]">
            {cases.length === 0 && !loadingCases && (
              <div className="text-center py-12">
                <Activity size={32} className="mx-auto mb-3 opacity-20" />
                <p className="text-sm font-medium text-muted-foreground">{t('common.noData')}</p>
              </div>
            )}
            {cases.map((c) => (
              <div key={c.document_id} onClick={() => handleSelectCase(c.document_id)} className={`group p-4 rounded-lg border-2 transition-all duration-200 cursor-pointer ${docId === c.document_id ? 'bg-primary/5 border-primary shadow-sm' : 'bg-card border-transparent hover:bg-muted/50 hover:border-border'}`}>
                <div className="flex justify-between items-start mb-2">
                  <div className="text-sm font-bold truncate pr-2 group-hover:text-primary transition-colors" title={c.file_name}>{c.file_name}</div>
                  <div className={`text-[10px] px-2 py-0.5 rounded font-bold border uppercase ${c.status === 'approved' ? 'bg-success/10 text-success border-success/20' : 'bg-muted text-muted-foreground border-border'}`}>{t(`status.${c.status.toLowerCase()}`)}</div>
                </div>
                <div className="flex justify-between items-center">
                  <div className="text-xs font-medium text-muted-foreground flex items-center gap-1 truncate max-w-[150px]"><Building2 size={12} />{c.department}</div>
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={(e) => { e.stopPropagation(); viewOriginalDoc(c.document_id); }}
                      className="p-1 hover:bg-primary/20 rounded text-muted-foreground hover:text-primary transition-colors"
                      title="View Original Document"
                    >
                      <Eye size={12} />
                    </button>
                    <PriorityBadge priority={c.priority} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </aside>

        {isSidebarOpen && <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-30 md:hidden animate-in" onClick={() => setIsSidebarOpen(false)} />}

        <main className="flex-1 p-6 space-y-8 overflow-y-auto h-[calc(100vh-4rem)] custom-scrollbar min-w-0 bg-muted/5">
          {globalError && (
            <div className="bg-destructive/10 border border-destructive/20 text-destructive p-4 rounded-lg flex items-center justify-between shadow-sm animate-in">
              <div className="flex items-center gap-3"><AlertTriangle size={18} /><span className="text-sm font-semibold">{globalError}</span></div>
              <button onClick={() => setGlobalError(null)} className="p-1 hover:bg-destructive/20 rounded transition-colors"><XCircle size={18} /></button>
            </div>
          )}

          <div className="grid lg:grid-cols-12 gap-6 items-start">
            {/* Upload Section */}
            <div className="lg:col-span-4 space-y-6">
              <div className="card-premium relative overflow-hidden group">
                <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent z-0" />
                <div className="relative z-10">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">1</div>
                    <h2 className="text-lg font-bold">{t('cases.upload')}</h2>
                  </div>

                  <div className="border-2 border-dashed border-border hover:border-primary transition-colors rounded-lg p-8 text-center bg-muted/30 mb-4 group-hover:bg-muted/50 shadow-inner">
                    <input
                      type="file"
                      id="file-upload"
                      className="hidden"
                      accept=".pdf"
                      onChange={(e) => setFile(e.target.files?.[0] || null)}
                    />
                    <label htmlFor="file-upload" className="cursor-pointer flex flex-col items-center">
                      <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform duration-200">
                        <UploadCloud size={24} className="text-primary" />
                      </div>
                      <span className="text-sm font-semibold">{file ? file.name : t('cases.browseFile')}</span>
                      <span className="text-xs text-muted-foreground mt-1">{t('cases.supportsPdf')}</span>
                    </label>
                  </div>

                  <button
                    className="w-full btn-primary-premium flex items-center justify-center gap-2"
                    disabled={!file || loadingUpload || loadingExtract}
                    onClick={handleUpload}
                  >
                    {loadingUpload || loadingExtract ? (
                      <><Loader2 size={18} className="animate-spin" /> {t('common.loading')}</>
                    ) : (
                      <><FileText size={18} /> {t('cases.analyze')}</>
                    )}
                  </button>

                  {docId && (
                    <div className="mt-4 flex items-center justify-between text-[10px] font-bold bg-muted/50 p-3 rounded-lg border border-border">
                      <span className="text-muted-foreground uppercase tracking-wider">{t('common.activeId')}</span>
                      <span className="font-mono text-primary">#{String(docId)}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Assignment Card */}
              {docId && (
                <div className="card-premium space-y-4">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">A</div>
                    <h2 className="text-lg font-bold">{t('admin.assignment')}</h2>
                  </div>
                  <p className="text-xs text-muted-foreground">{t('dashboard.assignDesc')}</p>
                  
                  <div>
                    <label className="label-premium">{t('admin.assignTo')}</label>
                    <select 
                      className="input-premium" 
                      value={assignmentTarget} 
                      onChange={e => setAssignmentTarget(e.target.value)}
                    >
                      <option value="">{t('dashboard.selectOfficer')}</option>
                      {users.filter(u => u.role === 'officer').map(u => (
                        <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
                      ))}
                    </select>
                  </div>

                  <button 
                    className="w-full btn-secondary-premium"
                    disabled={!assignmentTarget || loadingUsers}
                    onClick={handleAssignCase}
                  >
                    {t('common.save')}
                  </button>

                  {assignmentMessage && (
                    <p className={`text-xs font-medium text-center ${assignmentMessage.type === 'success' ? 'text-success' : 'text-destructive'}`}>
                      {assignmentMessage.text}
                    </p>
                  )}
                </div>
              )}

              {/* Invite Officer Card */}
              <div className="card-premium space-y-4">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center text-indigo-500 font-bold text-sm">I</div>
                  <h2 className="text-lg font-bold">Invite Officer</h2>
                </div>
                <p className="text-xs text-muted-foreground">Add new members via secure invite link.</p>
                
                <form onSubmit={handleInvite} className="space-y-4">
                  <div>
                    <label className="label-premium">Officer Email</label>
                    <input 
                      className="input-premium" 
                      placeholder="officer@gov.in"
                      value={inviteForm.email}
                      onChange={e => setInviteForm({ ...inviteForm, email: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <label className="label-premium">Officer Name (Optional)</label>
                    <input 
                      className="input-premium" 
                      placeholder="Full Name"
                      value={inviteForm.name}
                      onChange={e => setInviteForm({ ...inviteForm, name: e.target.value })}
                    />
                  </div>

                  <button 
                    type="submit"
                    className="w-full btn-primary-premium bg-indigo-600 hover:bg-indigo-700 shadow-indigo-200"
                    disabled={loadingInvite}
                  >
                    {loadingInvite ? <Loader2 size={16} className="animate-spin" /> : "Send Invitation"}
                  </button>
                </form>

                {inviteMessage && (
                  <p className={`text-xs font-medium text-center p-2 rounded ${inviteMessage.type === 'success' ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'}`}>
                    {inviteMessage.text}
                  </p>
                )}
              </div>
            </div>

            {/* Analysis Results */}
            <div className="lg:col-span-8 h-auto space-y-6">
              {extractRes && extractRes.extracted_data ? (
                <div className="card-premium h-auto flex flex-col justify-between">
                  <div>
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between mb-8 gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 text-primary mb-2">
                          <AlertTriangle size={18} />
                          <span className="text-[10px] font-bold uppercase tracking-widest">{t('cases.actionRequired')}</span>
                        </div>
                        <h2 className="text-2xl font-bold tracking-tight leading-tight line-clamp-3">
                          {editForm?.action_required || extractRes?.extracted_data?.action_required || "Awaiting Analysis"}
                        </h2>
                      </div>
                      <div className="shrink-0">
                        <PriorityBadge priority={editForm?.priority || extractRes?.extracted_data?.priority} />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                      <div className="bg-muted/30 border border-border rounded-lg p-4 shadow-sm">
                        <div className="text-muted-foreground text-[10px] font-bold uppercase tracking-wider mb-2 flex items-center gap-1.5"><Calendar size={14} /> {t('cases.orderDate')}</div>
                        <div className="font-semibold truncate">{extractRes?.extracted_data?.date_of_order || "—"}</div>
                      </div>
                      <div className="bg-muted/30 border border-border rounded-lg p-4 shadow-sm">
                        <div className="text-muted-foreground text-[10px] font-bold uppercase tracking-wider mb-2 flex items-center gap-1.5"><Clock size={14} /> {t('cases.timeline')}</div>
                        <div className="font-semibold truncate" title={extractRes?.extracted_data?.timeline}>{extractRes?.extracted_data?.timeline || "—"}</div>
                      </div>
                      <div className={`border rounded-lg p-4 relative overflow-hidden shadow-sm ${editForm?.deadline_date && new Date(editForm.deadline_date) < new Date() ? 'bg-destructive/5 border-destructive/20' : editForm?.deadline_date ? 'bg-primary/5 border-primary/20' : 'bg-muted/30 border-border'}`}>
                        <div className="text-muted-foreground text-[10px] font-bold uppercase tracking-wider mb-2 flex items-center justify-between gap-1.5 relative z-10">
                          <span className="flex items-center gap-1"><AlertTriangle size={14} /> {t('cases.deadline')}</span>
                          <span className={`text-[9px] font-bold ${editForm?.deadline_date && new Date(editForm.deadline_date) < new Date() ? 'text-destructive' : 'text-primary'}`}>{getUrgencyText(editForm?.deadline_date)}</span>
                        </div>
                        <div className={`relative z-10 font-bold ${getUrgencyClasses(editForm?.deadline_date)}`}>{editForm?.deadline_date || "Not Specified"}</div>
                      </div>
                      <div className="bg-muted/30 border border-border rounded-lg p-4 shadow-sm">
                        <div className="text-muted-foreground text-[10px] font-bold uppercase tracking-wider mb-2 flex items-center gap-1.5"><Building2 size={14} /> {t('cases.department')}</div>
                        <div className="font-semibold truncate" title={editForm?.department || extractRes?.extracted_data?.department}>{editForm?.department || extractRes?.extracted_data?.department || "—"}</div>
                      </div>
                    </div>
                  </div>

                  <div className="bg-muted/20 rounded-lg p-6 border border-border mt-auto shadow-inner">
                    <div className="flex items-center justify-between cursor-pointer select-none group" onClick={() => setDirectivesExpanded(!directivesExpanded)}>
                      <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground group-hover:text-foreground transition-colors">{t('cases.directives')}</h3>
                      <button className="text-muted-foreground group-hover:text-foreground transition-colors p-1 bg-card rounded border border-border shadow-sm">
                        {directivesExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                      </button>
                    </div>

                    <div className={`transition-all duration-300 ease-in-out overflow-hidden ${directivesExpanded ? 'max-h-[500px] mt-4 opacity-100' : 'max-h-[80px] mt-3 opacity-60'}`}>
                      <ul className="space-y-2">
                        {extractRes?.extracted_data?.directives?.map((d, i) => (
                          <li key={i} className="flex gap-3 text-sm leading-relaxed text-muted-foreground">
                            <span className="text-primary mt-0.5 shrink-0 font-bold">•</span>
                            <span className={directivesExpanded ? 'text-foreground font-medium' : 'line-clamp-1'}>{d}</span>
                          </li>
                        ))}
                        {(!extractRes?.extracted_data?.directives || extractRes?.extracted_data?.directives?.length === 0) && (
                          <li className="text-sm text-muted-foreground italic">{t('cases.noDirectives')}</li>
                        )}
                      </ul>
                    </div>

                    {!directivesExpanded && extractRes?.extracted_data?.directives?.length > 0 && (
                      <div className="text-xs text-primary mt-3 cursor-pointer font-bold hover:underline inline-block" onClick={() => setDirectivesExpanded(true)}>
                        {t('cases.expandDirectives')}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="h-full min-h-[500px] border-2 border-dashed border-border rounded-lg flex flex-col items-center justify-center text-muted-foreground p-8 text-center bg-card shadow-inner">
                  <ShieldAlert size={48} className="mb-4 opacity-10" />
                  <p className="text-lg font-bold">{t('cases.waitingForDocument')}</p>
                  <p className="text-sm mt-2 max-w-md">{t('cases.waitingDesc')}</p>
                </div>
              )}
            </div>
          </div>

          {/* Execution Plan & Review Section */}
          {extractRes && extractRes.extracted_data && (
            <div className="grid lg:grid-cols-2 gap-6 items-stretch">
              <div className="card-premium flex flex-col h-auto min-h-[600px]">
                <div className="flex items-center justify-between mb-8">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">2</div>
                    <h2 className="text-lg font-bold">{t('cases.executionPlan')}</h2>
                  </div>
                  {!actionRes && (
                    <button className="btn-primary-premium h-9 px-4 text-xs shadow-sm" onClick={handleGenerateAction} disabled={loadingAction}>
                      {loadingAction ? <Loader2 size={14} className="animate-spin mr-2" /> : <Activity size={14} className="mr-2" />}
                      {t('cases.generatePlan')}
                    </button>
                  )}
                </div>

                {actionRes ? (
                  <div className="space-y-0 relative flex-1 ml-4 border-l-2 border-border pl-6 pb-4">
                    {actionRes.plan?.steps?.map((step, i) => (
                      <div key={i} className="relative mb-8 last:mb-0 group">
                        <div className="absolute -left-[33px] top-1 w-3.5 h-3.5 rounded-full bg-background border-2 border-primary z-10 group-hover:scale-125 transition-transform duration-200 shadow-sm" />
                        <div className="bg-muted/20 border border-border group-hover:border-primary/30 transition-all rounded-lg p-5 shadow-sm hover:shadow-md">
                          <h3 className="font-bold mb-3 leading-tight">{step.step}</h3>
                          <div className="flex flex-wrap gap-2 text-[10px] font-bold uppercase mb-3">
                            <span className="flex items-center gap-1 bg-card px-2 py-1 rounded border border-border shadow-sm"><Building2 size={12} /> {step.owner}</span>
                            <span className={`flex items-center gap-1 bg-card px-2 py-1 rounded border border-border shadow-sm ${getUrgencyClasses(step.due_date)}`}><Calendar size={12} /> {step.due_date}</span>
                          </div>
                          <p className="text-xs text-muted-foreground bg-card/50 p-3 rounded border border-border shadow-inner"><span className="font-bold text-foreground">Evidence:</span> {step.evidence_required}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex-1 border-2 border-dashed border-border rounded-lg flex flex-col items-center justify-center text-muted-foreground p-8 text-center bg-muted/20 shadow-inner">
                    <Activity size={32} className="mb-3 opacity-10" />
                    <p className="text-sm font-bold">{t('cases.generatePlan')}</p>
                  </div>
                )}
              </div>

              <div className="card-premium flex flex-col h-auto min-h-[600px]">
                <div className="flex items-center justify-between mb-8 pb-4 border-b border-border">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-success/10 flex items-center justify-center text-success font-bold text-sm">3</div>
                    <h2 className="text-lg font-bold">{t('cases.finalReview')}</h2>
                  </div>
                  {extractRes.status && (
                    <div className="text-[10px] uppercase px-3 py-1 bg-muted rounded font-black border border-border text-muted-foreground shadow-sm">{extractRes.status}</div>
                  )}
                </div>

                <div className="flex-1 space-y-6 mb-6 pr-2">
                  <div className="space-y-4">
                    <div>
                      <label className="label-premium">{t('cases.actionRequired')}</label>
                      <input className="input-premium shadow-sm" value={editForm?.action_required || ""} onChange={e => setEditForm({ ...editForm, action_required: e.target.value })} />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="label-premium">{t('cases.priority')}</label>
                        <select className="input-premium shadow-sm" value={editForm?.priority || "Medium"} onChange={e => setEditForm({ ...editForm, priority: e.target.value })}>
                          <option value="High">High</option>
                          <option value="Medium">Medium</option>
                          <option value="Low">Low</option>
                        </select>
                      </div>
                      <div>
                        <label className="label-premium">{t('cases.deadline')}</label>
                        <input type="date" className="input-premium shadow-sm [color-scheme:light] dark:[color-scheme:dark]" value={editForm?.deadline_date || ""} onChange={e => setEditForm({ ...editForm, deadline_date: e.target.value })} />
                      </div>
                    </div>
                    <div>
                      <label className="label-premium">{t('cases.department')}</label>
                      <input className="input-premium shadow-sm" value={editForm?.department || ""} onChange={e => setEditForm({ ...editForm, department: e.target.value })} />
                    </div>
                    <div>
                      <label className="label-premium">{t('cases.summary')}</label>
                      <textarea className="input-premium shadow-sm resize-none h-32" value={editForm?.case_details || ""} onChange={e => setEditForm({ ...editForm, case_details: e.target.value })} />
                    </div>
                  </div>
                </div>

                <div className="pt-6 border-t border-border space-y-5 bg-card mt-auto">
                  <div className="flex flex-col gap-2">
                    <label className="label-premium">{t('cases.selectReportLang')}</label>
                    <select 
                      value={reportLang}
                      onChange={(e) => setReportLang(e.target.value)}
                      className="input-premium shadow-sm"
                    >
                      <option value="en">English</option>
                      <option value="hi">हिंदी (Hindi)</option>
                      <option value="kn">ಕನ್ನಡ (Kannada)</option>
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <button
                      className="btn-secondary-premium border-destructive/20 text-destructive hover:bg-destructive hover:text-white shadow-sm transition-all active:scale-95"
                      disabled={loadingVerify || extractRes?.status === 'rejected'}
                      onClick={() => handleVerify("reject")}
                    >
                      <XCircle size={16} className="mr-2" /> {t('cases.reject')}
                    </button>
                    <button
                      className="btn-primary-premium bg-success hover:bg-success/90 shadow-sm transition-all active:scale-95"
                      disabled={loadingVerify || extractRes?.status === 'approved'}
                      onClick={() => handleVerify("approve")}
                    >
                      {loadingVerify ? <Loader2 size={16} className="animate-spin mr-2" /> : <CheckCircle2 size={16} className="mr-2" />}
                      {t('cases.approve')}
                    </button>
                  </div>
                  
                  {extractRes?.status === 'approved' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                      <button
                        className="btn-secondary-premium flex items-center justify-center gap-2 shadow-sm transition-all active:scale-95 py-3"
                        onClick={handlePreviewReport}
                        disabled={loadingReport}
                      >
                        {loadingReport ? <Loader2 size={16} className="animate-spin" /> : <Eye size={16} />}
                        Preview Report
                      </button>
                      <button
                        className="btn-primary-premium flex items-center justify-center gap-2 shadow-sm transition-all active:scale-95 py-3"
                        onClick={handleDownloadReport}
                      >
                        <Download size={16} />
                        Download PDF
                      </button>
                    </div>
                  )}
                  {docId && (
                    <button onClick={handleViewOriginal} className="w-full text-xs font-bold text-muted-foreground hover:text-primary transition-colors flex items-center justify-center gap-2 py-2 border-t border-border/50 mt-2">
                      <FileText size={14} /> View Original Document Source
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Assistant & System Dashboard */}
          <div className="grid lg:grid-cols-12 gap-6 items-stretch pb-10">
            <div className="lg:col-span-5 card-premium flex flex-col h-auto min-h-[550px]">
              <div className="flex items-center gap-3 mb-6 pb-4 border-b border-border">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary shadow-inner">
                  <MessageSquare size={20} />
                </div>
                <div>
                  <h2 className="text-lg font-bold leading-none">{t('assistant.title')}</h2>
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mt-1">{t('assistant.questions')}</p>
                </div>
              </div>

              <div ref={chatScrollRef} className="flex-1 overflow-y-auto mb-6 space-y-4 pr-2 custom-scrollbar">
                {chatHistory.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-muted-foreground text-center px-4">
                    <div className="w-16 h-16 rounded-full bg-muted/30 flex items-center justify-center mb-4 border border-border">
                      <MessageSquare size={32} className="opacity-10" />
                    </div>
                    <p className="text-xs font-medium leading-relaxed max-w-[200px]">{t('assistant.welcome')}</p>
                  </div>
                ) : (
                  chatHistory.map((msg, i) => (
                    <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-in`}>
                      <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm shadow-sm ${msg.role === 'user' ? 'bg-primary text-primary-foreground rounded-br-none' : 'bg-muted border border-border rounded-bl-none'}`}>
                        {msg.content}
                      </div>
                    </div>
                  ))
                )}
                {loadingChat && (
                  <div className="flex justify-start">
                    <div className="bg-muted border border-border rounded-lg rounded-bl-none px-4 py-3 flex gap-1.5 shadow-sm">
                      <div className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce"></div>
                      <div className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce delay-100"></div>
                      <div className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce delay-200"></div>
                    </div>
                  </div>
                )}
              </div>

              <form onSubmit={handleChat} className="relative mt-auto">
                <input 
                  className="input-premium pr-12 shadow-inner" 
                  placeholder={docId ? t('assistant.placeholder') : t('assistant.uploadFirst')} 
                  value={chatQ} 
                  onChange={e => setChatQ(e.target.value)} 
                  disabled={!docId || loadingChat} 
                />
                <button 
                  type="submit" 
                  disabled={!docId || loadingChat || !chatQ.trim()} 
                  className="absolute right-1.5 top-1.5 p-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-md transition-all disabled:opacity-50 active:scale-95 shadow-sm"
                >
                  <Send size={16} />
                </button>
              </form>
            </div>

            <div className="lg:col-span-7 card-premium h-full min-h-[550px] flex flex-col">
              <div className="flex items-center justify-between mb-6 pb-4 border-b border-border">
                <div>
                  <h2 className="text-lg font-bold leading-none">{t('dashboard.systemDashboard')}</h2>
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mt-1">{t('dashboard.dashboardOverview')}</p>
                </div>
                <button 
                  onClick={loadDashboard} 
                  disabled={loadingDashboard} 
                  className="p-2.5 rounded-lg bg-muted text-muted-foreground hover:text-primary transition-all active:scale-95 border border-border shadow-sm"
                >
                  <RefreshCcw size={18} className={loadingDashboard ? "animate-spin" : ""} />
                </button>
              </div>

              {dashboard ? (
                <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-8">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <div className="bg-card border border-border rounded-xl p-5 flex flex-col items-center justify-center shadow-sm hover:shadow-md transition-all group">
                      <div className="text-3xl font-black mb-1 group-hover:scale-110 transition-transform">{(dashboard && dashboard.approved_cases) ? dashboard.approved_cases.length : 0}</div>
                      <div className="text-[9px] font-black text-muted-foreground uppercase tracking-[0.15em] text-center leading-tight">{t('dashboard.totalApproved')}</div>
                    </div>
                    <div className="bg-primary/5 border border-primary/20 rounded-xl p-5 flex flex-col items-center justify-center shadow-sm hover:shadow-md transition-all group">
                      <div className="text-3xl font-black text-primary mb-1 group-hover:scale-110 transition-transform">{Object.keys((dashboard && dashboard.department_breakdown) || {}).length}</div>
                      <div className="text-[9px] font-black text-primary uppercase tracking-[0.15em] text-center leading-tight">{t('dashboard.departments')}</div>
                    </div>
                    <div className="bg-destructive/5 border border-destructive/20 rounded-xl p-5 flex flex-col items-center justify-center shadow-sm hover:shadow-md transition-all group">
                      <div className="text-3xl font-black text-destructive mb-1 group-hover:scale-110 transition-transform">{(dashboard && dashboard.priority_breakdown) ? (dashboard.priority_breakdown.High || 0) : 0}</div>
                      <div className="text-[9px] font-black text-destructive uppercase tracking-[0.15em] text-center leading-tight">{t('dashboard.highPriority')}</div>
                    </div>
                    <div className="bg-warning/5 border border-warning/20 rounded-xl p-5 flex flex-col items-center justify-center shadow-sm hover:shadow-md transition-all group">
                      <div className="text-3xl font-black text-warning mb-1 group-hover:scale-110 transition-transform">{(dashboard && dashboard.deadlines) ? dashboard.deadlines.length : 0}</div>
                      <div className="text-[9px] font-black text-warning uppercase tracking-[0.15em] text-center leading-tight">{t('dashboard.deadlines')}</div>
                    </div>
                  </div>

                  <div className="grid md:grid-cols-2 gap-8">
                    <div>
                      <h3 className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-4 flex items-center gap-2">
                        <Activity size={14} className="text-primary" />
                        {t('dashboard.byDepartment')}
                      </h3>
                      <div className="space-y-2">
                        {Object.entries(dashboard.department_breakdown || {}).map(([dept, count]) => (dept !== "unknown" && (
                          <div key={dept} className="flex items-center justify-between bg-muted/20 border border-border px-4 py-3 rounded-lg transition-all hover:bg-muted/40 group">
                            <span className="text-sm font-bold truncate pr-2 group-hover:text-primary transition-colors">{dept}</span>
                            <span className="bg-card text-foreground font-black px-3 py-1 rounded text-xs border border-border shadow-sm">{count}</span>
                          </div>
                        )))}
                      </div>
                    </div>
                    <div>
                      <h3 className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-4 flex items-center gap-2">
                        <Activity size={14} className="text-primary" />
                        {t('dashboard.byPriority')}
                      </h3>
                      <div className="space-y-2">
                        {['High', 'Medium', 'Low'].map((p) => {
                          const count = dashboard.priority_breakdown?.[p] || 0;
                          return (
                            <div key={p} className="flex items-center justify-between bg-muted/20 border border-border px-4 py-3 rounded-lg transition-all hover:bg-muted/40">
                              <PriorityBadge priority={p} />
                              <span className="bg-card text-foreground font-black px-3 py-1 rounded text-xs border border-border shadow-sm">{count}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground space-y-4">
                  <div className="w-10 h-10 rounded-full border-4 border-muted border-t-primary animate-spin" />
                  <p className="text-xs font-bold uppercase tracking-widest">{t('common.loading')}</p>
                </div>
              )}
            </div>
          </div>
        </main>
      </div>

      {/* Report Preview Modal */}
      {showPreview && reportData && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in">
          <div className="bg-white dark:bg-slate-900 w-full max-w-4xl h-[90vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden">
            <div className="p-4 border-b border-border flex items-center justify-between bg-card">
              <div className="flex items-center gap-2">
                <FileText className="text-primary" size={20} />
                <h3 className="font-bold">Report Preview: CASE-{docId}</h3>
              </div>
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => window.print()} 
                  className="p-2 rounded-lg hover:bg-muted transition-colors flex items-center gap-2 text-sm font-medium"
                >
                  <Printer size={18} /> Print
                </button>
                <button 
                  onClick={handleDownloadReport} 
                  className="p-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors flex items-center gap-2 text-sm font-medium shadow-sm"
                >
                  <Download size={18} /> Download PDF
                </button>
                <button 
                  onClick={() => setShowPreview(false)} 
                  className="p-2 hover:bg-destructive/10 hover:text-destructive rounded-lg transition-colors"
                >
                  <X size={20} />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-8 bg-slate-50 dark:bg-slate-950 custom-scrollbar">
              <div className="bg-white dark:bg-slate-900 shadow-xl border border-slate-200 dark:border-slate-800 mx-auto min-h-[1000px] p-12 max-w-[800px] text-slate-900 dark:text-slate-100 font-serif leading-relaxed">
                <div className="text-center mb-12">
                  <h1 className="text-3xl font-bold text-blue-900 dark:text-blue-400 mb-2 uppercase tracking-tight">Legal Case Analysis Report</h1>
                  <div className="h-1 w-24 bg-blue-900 dark:bg-blue-400 mx-auto mb-4" />
                  <p className="text-sm text-slate-500 uppercase tracking-widest font-sans">GovOS Court Intelligence System</p>
                </div>

                <div className="grid grid-cols-2 gap-y-4 text-sm font-sans mb-12 border-y border-slate-100 dark:border-slate-800 py-6">
                  <div><span className="font-bold uppercase text-slate-400 text-[10px] block">Case Identifier</span> <span className="font-bold">CASE-{docId}</span></div>
                  <div><span className="font-bold uppercase text-slate-400 text-[10px] block">Date of Report</span> <span>{new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</span></div>
                  <div><span className="font-bold uppercase text-slate-400 text-[10px] block">Order Date</span> <span>{reportData.extracted_data?.date_of_order || 'N/A'}</span></div>
                  <div><span className="font-bold uppercase text-slate-400 text-[10px] block">Department</span> <span>{reportData.extracted_data?.department || 'General Administration'}</span></div>
                </div>

                <section className="mb-10">
                  <h2 className="text-lg font-bold border-b-2 border-slate-100 dark:border-slate-800 pb-1 mb-4 text-slate-800 dark:text-slate-200 uppercase font-sans tracking-wide">1. Case Summary</h2>
                  <p className="text-[15px]">{reportData.extracted_data?.case_details || 'No summary provided.'}</p>
                </section>

                <section className="mb-10">
                  <h2 className="text-lg font-bold border-b-2 border-slate-100 dark:border-slate-800 pb-1 mb-4 text-slate-800 dark:text-slate-200 uppercase font-sans tracking-wide">2. Key Facts</h2>
                  <ul className="list-disc pl-5 space-y-2 text-[15px]">
                    {reportData.extracted_data?.borrower && <li><strong>Primary Party:</strong> {reportData.extracted_data.borrower}</li>}
                    {reportData.extracted_data?.loan_amount && <li><strong>Value/Amount:</strong> {reportData.extracted_data.loan_amount}</li>}
                    {reportData.extracted_data?.co_borrowers?.length > 0 && <li><strong>Associated Parties:</strong> {reportData.extracted_data.co_borrowers.join(', ')}</li>}
                  </ul>
                </section>

                <section className="mb-10">
                  <h2 className="text-lg font-bold border-b-2 border-slate-100 dark:border-slate-800 pb-1 mb-4 text-slate-800 dark:text-slate-200 uppercase font-sans tracking-wide">3. Legal Analysis</h2>
                  <p className="text-[15px]">{reportData.extracted_data?.action_required || 'Mandatory compliance required.'}</p>
                </section>

                <section className="mb-10">
                  <h2 className="text-lg font-bold border-b-2 border-slate-100 dark:border-slate-800 pb-1 mb-4 text-slate-800 dark:text-slate-200 uppercase font-sans tracking-wide">4. Mandatory Directives</h2>
                  <ul className="space-y-3">
                    {reportData.extracted_data?.directives?.map((d, i) => (
                      <li key={i} className="flex gap-3 text-[15px]">
                        <span className="font-bold text-slate-400 shrink-0">•</span>
                        <span>{d}</span>
                      </li>
                    ))}
                  </ul>
                </section>

                <section className="mb-10">
                  <h2 className="text-lg font-bold border-b-2 border-slate-100 dark:border-slate-800 pb-1 mb-4 text-slate-800 dark:text-slate-200 uppercase font-sans tracking-wide">5. Recommended Actions</h2>
                  <div className="space-y-4">
                    {reportData.action_plan?.plan?.steps?.map((s, i) => (
                      <div key={i} className="border-l-4 border-blue-500/20 pl-4 py-1">
                        <p className="font-bold text-[15px]">{s.step}</p>
                        <p className="text-xs font-sans text-slate-500 mt-1 uppercase tracking-wider">Owner: {s.owner} | Due: {s.due_date}</p>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="mb-10">
                  <h2 className="text-lg font-bold border-b-2 border-slate-100 dark:border-slate-800 pb-1 mb-4 text-slate-800 dark:text-slate-200 uppercase font-sans tracking-wide">6. Conclusion</h2>
                  <p className="text-[15px] italic text-slate-600 dark:text-slate-400">
                    {reportData.action_plan?.compliance_notes || 'Immediate attention to the above directives is required.'}
                  </p>
                </section>

                <div className="mt-20 pt-10 border-t border-slate-100 dark:border-slate-800 text-center text-[10px] text-slate-400 font-sans uppercase tracking-[0.2em]">
                  END OF REPORT • GENERATED BY GOVOS AI
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
