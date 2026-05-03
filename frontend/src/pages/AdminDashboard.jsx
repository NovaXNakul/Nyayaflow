import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  Loader2,
  CheckCircle2,
  XCircle,
  Calendar,
  AlertTriangle,
  ArrowRight,
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
  Menu,
} from "lucide-react";
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
} from "../api";
import { PriorityBadge } from "../components/SharedComponents";

export default function AdminDashboard() {
  const { logout, user } = useAuth();
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
  const [loadingUpload, setLoadingUpload] = useState(false);
  const [loadingExtract, setLoadingExtract] = useState(false);
  const [loadingAction, setLoadingAction] = useState(false);
  const [loadingVerify, setLoadingVerify] = useState(false);
  const [loadingDashboard, setLoadingDashboard] = useState(false);
  const [loadingCases, setLoadingCases] = useState(false);
  const [loadingChat, setLoadingChat] = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [assignmentMessage, setAssignmentMessage] = useState(null);
  const [taskMessage, setTaskMessage] = useState(null);

  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [directivesExpanded, setDirectivesExpanded] = useState(false);

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
      setGlobalError("Failed to load admin dashboard. Please authenticate and ensure backend is running.");
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
      setGlobalError("Failed to load case details.");
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
      setAssignmentMessage("Case assigned successfully.");
      loadCases();
      setAssignmentTarget(assignmentTarget);
    } catch (err) {
      console.error("Assign error:", err);
      setAssignmentMessage(err.message || "Failed to assign case.");
    }
  };

  const handleCreateTask = async () => {
    if (!taskForm.case_id || !taskForm.assigned_to) {
      setTaskMessage("Please select a case and officer for the task.");
      return;
    }
    setTaskMessage(null);
    try {
      await createTask(taskForm.case_id, Number(taskForm.assigned_to), taskForm.status, taskForm.deadline || null);
      setTaskForm({ ...taskForm, status: "pending", deadline: "" });
      setTaskMessage("Task created successfully.");
      loadTasks();
    } catch (err) {
      console.error("Task creation error:", err);
      setTaskMessage(err.message || "Could not create task.");
    }
  };

  const getUrgencyClasses = (dateStr) => {
    if (!dateStr) return "";
    const deadline = new Date(dateStr);
    const now = new Date();
    const diff = (deadline - now) / (1000 * 60 * 60 * 24);
    if (diff < 0) return "text-red-500 font-bold animate-pulse";
    if (diff < 5) return "text-orange-500 font-bold";
    return "text-emerald-400 font-bold";
  };

  const getUrgencyText = (dateStr) => {
    if (!dateStr) return "Not Specified";
    const deadline = new Date(dateStr);
    if (isNaN(deadline.getTime())) return "Not Specified";
    const now = new Date();
    const diff = Math.ceil((deadline - now) / (1000 * 60 * 60 * 24));
    if (diff < 0) return `${Math.abs(diff)} days overdue!`;
    if (diff === 0) return "Due today!";
    return `${diff} days left`;
  };

  const assignedName = (caseItem) => {
    const officer = users.find((u) => u.id === caseItem.assigned_to);
    return officer ? officer.username : caseItem.assigned_to ? `Officer ${caseItem.assigned_to}` : "Unassigned";
  };

  return (
    <div className="min-h-screen bg-[#020617] text-slate-200 font-sans selection:bg-sky-500/30 flex flex-col">
      <nav className="sticky top-0 z-50 bg-slate-900/80 backdrop-blur-xl border-b border-white/5">
        <div className="max-w-[1600px] mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors"
              title="Toggle Sidebar"
            >
              {isSidebarOpen ? <Menu size={20} /> : <FolderOpen size={20} />}
            </button>
            <div className="w-8 h-8 rounded-lg bg-sky-500 flex items-center justify-center text-white shadow-lg shadow-sky-500/20">
              <ShieldAlert size={18} />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white tracking-tight leading-none hidden sm:block">Admin Command Center</h1>
              <p className="text-[10px] text-sky-400 font-medium uppercase tracking-wider mt-0.5 hidden sm:block">Multi-user legal workflow</p>
            </div>
          </div>

          <div className="flex items-center gap-4 text-sm font-medium">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-800 border border-slate-700">
              <Activity size={14} className="text-emerald-400" />
              <span className="text-slate-300 hidden sm:inline">{user?.username || "Admin"}</span>
            </div>
            <button
              onClick={() => {
                logout();
                navigate("/login", { replace: true });
              }}
              className="text-slate-400 hover:text-white"
            >
              Logout
            </button>
          </div>
        </div>
      </nav>

      <div className="flex flex-1 max-w-[1600px] w-full mx-auto overflow-hidden relative">
        <aside className={`transition-all duration-300 ease-in-out border-r border-slate-800 bg-slate-900/95 md:bg-slate-900/30 flex flex-col h-[calc(100vh-4rem)] absolute md:relative z-40 ${isSidebarOpen ? 'w-80 translate-x-0' : 'w-80 -translate-x-full md:translate-x-0 md:w-0 md:opacity-0 md:border-none'}`}>
          <div className="p-4 border-b border-slate-800 flex justify-between items-center min-w-[320px]">
            <h2 className="font-semibold text-slate-200 flex items-center gap-2"><FolderOpen size={18} className="text-sky-400" /> Case History</h2>
            <button onClick={loadCases} className="text-slate-400 hover:text-white" disabled={loadingCases}>
              <RefreshCcw size={14} className={loadingCases ? "animate-spin" : ""} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-2 min-w-[320px]">
            {cases.length === 0 && !loadingCases && (
              <div className="text-center text-slate-500 text-sm py-8">No cases found.</div>
            )}
            {cases.map((c) => (
              <div
                key={c.document_id}
                onClick={() => handleSelectCase(c.document_id)}
                className={`p-3 rounded-xl border cursor-pointer transition-colors ${docId === c.document_id ? 'bg-sky-900/20 border-sky-500/50' : 'bg-slate-900 border-slate-800 hover:border-slate-600'}`}
              >
                <div className="flex justify-between items-start mb-2">
                  <div className="text-sm font-medium text-slate-200 truncate w-40" title={c.file_name}>{c.file_name}</div>
                  <div className={`text-[10px] px-2 py-0.5 rounded uppercase font-bold ${c.status === 'approved' ? 'bg-emerald-500/20 text-emerald-400' : c.status === 'rejected' ? 'bg-red-500/20 text-red-400' : 'bg-slate-800 text-slate-300'}`}>
                    {c.status}
                  </div>
                </div>
                <div className="flex justify-between items-center">
                  <div className="text-xs text-slate-400 truncate w-32"><Building2 size={10} className="inline mr-1" />{c.department}</div>
                  <PriorityBadge priority={c.priority} />
                </div>
                <div className="text-xs text-slate-500 mt-2">{assignedName(c)}</div>
              </div>
            ))}
          </div>
        </aside>

        {isSidebarOpen && <div className="fixed inset-0 bg-black/50 z-30 md:hidden" onClick={() => setIsSidebarOpen(false)} />}

        <main className="flex-1 p-4 md:p-6 space-y-8 overflow-y-auto h-[calc(100vh-4rem)] custom-scrollbar min-w-0">
          {globalError && (
            <div className="bg-red-500/10 border border-red-500/30 text-red-400 p-4 rounded-xl flex items-center justify-between">
              <div className="flex items-center gap-3">
                <AlertTriangle size={18} />
                <span className="text-sm font-medium">{globalError}</span>
              </div>
              <button onClick={() => setGlobalError(null)} className="text-red-400/50 hover:text-red-400">
                <XCircle size={18} />
              </button>
            </div>
          )}

          <div className="grid lg:grid-cols-12 gap-6 items-start">
            <div className="lg:col-span-4 space-y-6">
              <div className="panel relative overflow-hidden group">
                <div className="absolute inset-0 bg-gradient-to-br from-sky-500/5 to-purple-500/5 z-0" />
                <div className="relative z-10">
                  <div className="flex items-center gap-2 mb-6">
                    <div className="w-6 h-6 rounded bg-slate-800 flex items-center justify-center border border-slate-700 text-sky-400">1</div>
                    <h2 className="text-lg font-semibold text-white">Ingest Document</h2>
                  </div>

                  <div className="border-2 border-dashed border-slate-700/50 hover:border-sky-500/50 transition-colors rounded-xl p-8 text-center bg-slate-800/20 mb-4">
                    <input
                      type="file"
                      id="file-upload"
                      className="hidden"
                      accept=".pdf"
                      onChange={(e) => setFile(e.target.files?.[0] || null)}
                    />
                    <label htmlFor="file-upload" className="cursor-pointer flex flex-col items-center">
                      <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                        <UploadCloud size={24} className="text-sky-400" />
                      </div>
                      <span className="text-sm font-medium text-slate-200">{file ? file.name : "Click to browse or drag file"}</span>
                      <span className="text-xs text-slate-500 mt-1">Supports PDF</span>
                    </label>
                  </div>

                  <button
                    className="w-full btn-primary flex items-center justify-center gap-2 py-3 disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={!file || loadingUpload || loadingExtract}
                    onClick={handleUpload}
                  >
                    {loadingUpload || loadingExtract ? (
                      <><Loader2 size={18} className="animate-spin" /> Processing...</>
                    ) : (
                      <><FileText size={18} /> Analyze New Document</>
                    )}
                  </button>

                  {docId && (
                    <div className="mt-4 flex items-center justify-between text-xs text-slate-400 bg-slate-800/50 p-2 rounded-lg border border-slate-700/50">
                      <span>Active ID</span>
                      <span className="font-mono text-sky-400">{String(docId)}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="lg:col-span-8 h-full">
              {extractRes && extractRes.extracted_data ? (
                <div className="panel border-sky-500/20 bg-gradient-to-br from-slate-900 to-slate-900/80 shadow-2xl shadow-sky-900/10 h-full flex flex-col justify-between">
                  <div>
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between mb-8 gap-4">
                      <div>
                        <div className="flex items-center gap-2 text-sky-400 mb-2">
                          <AlertTriangle size={18} />
                          <span className="text-sm font-bold uppercase tracking-wider">Recommended Action</span>
                        </div>
                        <h2 className="text-2xl md:text-3xl font-bold text-white tracking-tight leading-snug line-clamp-4" title={editForm?.action_required || extractRes?.extracted_data?.action_required}>
                          {editForm?.action_required || extractRes?.extracted_data?.action_required || "Awaiting Analysis"}
                        </h2>
                      </div>
                      <div className="shrink-0">
                        <PriorityBadge priority={editForm?.priority || extractRes?.extracted_data?.priority} />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                      <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
                        <div className="text-slate-400 text-xs font-medium mb-1 flex items-center gap-1.5"><Calendar size={12} /> Order Date</div>
                        <div className="font-semibold text-white">{extractRes?.extracted_data?.date_of_order || "—"}</div>
                      </div>
                      <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
                        <div className="text-slate-400 text-xs font-medium mb-1 flex items-center gap-1.5"><Clock size={12} /> Timeline</div>
                        <div className="font-semibold text-white truncate" title={extractRes?.extracted_data?.timeline}>{extractRes?.extracted_data?.timeline || "—"}</div>
                      </div>
                      <div className={`border rounded-xl p-4 relative overflow-hidden ${editForm?.deadline_date && new Date(editForm.deadline_date) < new Date() ? 'bg-red-500/20 border-red-500/50' : editForm?.deadline_date ? 'bg-sky-500/10 border-sky-500/30' : 'bg-slate-800/50 border-slate-700/50'}`}>
                        <div className="text-slate-400 text-xs font-medium mb-1 flex items-center justify-between gap-1.5 relative z-10">
                          <span className="flex items-center gap-1"><AlertTriangle size={12} /> Deadline</span>
                          <span className={`text-[10px] uppercase font-bold tracking-wider ${editForm?.deadline_date && new Date(editForm.deadline_date) < new Date() ? 'text-red-400' : 'text-sky-400'}`}>{getUrgencyText(editForm?.deadline_date)}</span>
                        </div>
                        <div className={`relative z-10 ${getUrgencyClasses(editForm?.deadline_date)}`}>{editForm?.deadline_date || "Not Specified"}</div>
                      </div>
                      <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
                        <div className="text-slate-400 text-xs font-medium mb-1 flex items-center gap-1.5"><Building2 size={12} /> Department</div>
                        <div className="font-semibold text-white truncate" title={editForm?.department || extractRes?.extracted_data?.department}>{editForm?.department || extractRes?.extracted_data?.department || "—"}</div>
                      </div>
                    </div>
                  </div>

                  <div className="bg-slate-950/50 rounded-xl p-5 border border-slate-800 mt-auto">
                    <div className="flex items-center justify-between cursor-pointer select-none group" onClick={() => setDirectivesExpanded(!directivesExpanded)}>
                      <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider group-hover:text-white transition-colors">Key Directives</h3>
                      <button className="text-slate-400 group-hover:text-white transition-colors p-1 bg-slate-900 rounded border border-slate-800">
                        {directivesExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                      </button>
                    </div>

                    <div className={`transition-all duration-300 ease-in-out overflow-hidden ${directivesExpanded ? 'max-h-[500px] mt-4 opacity-100' : 'max-h-[80px] mt-3 opacity-80'}`}>
                      <ul className="space-y-3">
                        {extractRes?.extracted_data?.directives?.map((d, i) => (
                          <li key={i} className="flex gap-3 text-sm text-slate-300 leading-relaxed">
                            <span className="text-sky-500 mt-0.5 shrink-0"><ChevronRight size={16} /></span>
                            <span className={directivesExpanded ? '' : 'line-clamp-1'}>{d}</span>
                          </li>
                        ))}
                        {(!extractRes?.extracted_data?.directives || extractRes?.extracted_data?.directives?.length === 0) && (
                          <li className="text-sm text-slate-500 italic">No specific directives extracted.</li>
                        )}
                      </ul>
                    </div>

                    {!directivesExpanded && extractRes?.extracted_data?.directives?.length > 0 && (
                      <div className="text-xs text-sky-400 mt-3 cursor-pointer font-medium hover:text-sky-300 inline-block px-2 py-1 bg-sky-500/10 rounded" onClick={() => setDirectivesExpanded(true)}>
                        Expand all directives...
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="h-full min-h-[300px] border-2 border-dashed border-slate-800 rounded-2xl flex flex-col items-center justify-center text-slate-500 p-8 text-center bg-slate-900/20">
                  <ShieldAlert size={48} className="mb-4 opacity-20" />
                  <p className="text-lg font-medium text-slate-400">Waiting for Document</p>
                  <p className="text-sm mt-2 max-w-md">Upload or select a court decision to see AI-generated insights, recommended actions, and critical deadlines.</p>
                </div>
              )}
            </div>
          </div>

          {extractRes && extractRes.extracted_data && (
            <div className="grid lg:grid-cols-2 gap-6 items-start">
              <div className="panel flex flex-col h-full">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded bg-slate-800 flex items-center justify-center border border-slate-700 text-sky-400">2</div>
                    <h2 className="text-lg font-semibold text-white">Execution Plan</h2>
                  </div>
                  {!actionRes && (
                    <button className="btn-primary py-1.5 px-3 text-sm flex items-center gap-2" onClick={handleGenerateAction} disabled={loadingAction}>
                      {loadingAction ? <Loader2 size={14} className="animate-spin" /> : <Activity size={14} />}
                      Generate Plan
                    </button>
                  )}
                </div>

                {actionRes ? (
                  <div className="space-y-0 relative flex-1 ml-3 border-l-2 border-slate-800 pl-6 pb-4">
                    {actionRes.plan?.steps?.map((step, i) => (
                      <div key={i} className="relative mb-6 last:mb-0 group">
                        <div className="absolute -left-[35px] top-1 w-4 h-4 rounded-full bg-slate-800 border-2 border-sky-500 z-10 group-hover:scale-125 transition-transform" />
                        <div className="bg-slate-950/50 border border-slate-800 group-hover:border-sky-500/30 transition-colors rounded-xl p-4">
                          <h3 className="font-semibold text-white mb-2 leading-tight">{step.step}</h3>
                          <div className="flex flex-wrap gap-3 text-xs text-slate-400">
                            <span className="flex items-center gap-1 bg-slate-900 px-2 py-1 rounded border border-slate-800"><Building2 size={12} /> {step.owner}</span>
                            <span className={`flex items-center gap-1 bg-slate-900 px-2 py-1 rounded border border-slate-800 ${getUrgencyClasses(step.due_date)}`}><Calendar size={12} /> Due: {step.due_date}</span>
                          </div>
                          <p className="text-xs text-slate-500 mt-2 bg-slate-900/50 p-2 rounded border border-slate-800/50"><span className="font-medium text-slate-400">Evidence Required:</span> {step.evidence_required}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex-1 border-2 border-dashed border-slate-800 rounded-xl flex flex-col items-center justify-center text-slate-500 p-8 text-center bg-slate-900/20">
                    <Activity size={32} className="mb-3 opacity-20" />
                    <p className="text-sm">Click generate to create a step-by-step compliance plan.</p>
                  </div>
                )}
              </div>

              <div className="panel flex flex-col h-full bg-gradient-to-br from-slate-900 to-slate-950 border-emerald-500/10">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded bg-slate-800 flex items-center justify-center border border-slate-700 text-emerald-400">3</div>
                    <h2 className="text-lg font-semibold text-white">Final Review</h2>
                  </div>
                  {extractRes.status && (
                    <div className="text-xs uppercase px-2 py-1 bg-slate-800 rounded text-slate-300 font-bold">{extractRes.status}</div>
                  )}
                </div>

                <div className="flex-1 space-y-4 overflow-y-auto mb-6 pr-2 custom-scrollbar max-h-[400px]">
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-400 mb-1">Action Required</label>
                      <input className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-sm text-white focus:border-sky-500 focus:ring-1 focus:ring-sky-500 outline-none transition-all" value={editForm?.action_required || ""} onChange={e => setEditForm({ ...editForm, action_required: e.target.value })} />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-400 mb-1">Priority</label>
                        <select className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-sm text-white focus:border-sky-500 outline-none" value={editForm?.priority || "Medium"} onChange={e => setEditForm({ ...editForm, priority: e.target.value })}>
                          <option value="High">High</option>
                          <option value="Medium">Medium</option>
                          <option value="Low">Low</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-400 mb-1">Deadline Date</label>
                        <input type="date" className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-sm text-white focus:border-sky-500 outline-none [color-scheme:dark]" value={editForm?.deadline_date || ""} onChange={e => setEditForm({ ...editForm, deadline_date: e.target.value })} />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-400 mb-1">Department</label>
                      <input className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-sm text-white focus:border-sky-500 outline-none" value={editForm?.department || ""} onChange={e => setEditForm({ ...editForm, department: e.target.value })} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-400 mb-1">Case Summary</label>
                      <textarea className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-sm text-white focus:border-sky-500 outline-none resize-none h-24" value={editForm?.case_details || ""} onChange={e => setEditForm({ ...editForm, case_details: e.target.value })} />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 mt-auto pt-4 border-t border-slate-800/50">
                  <button className="btn-secondary flex items-center justify-center gap-2 py-3 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/30 disabled:opacity-50" disabled={loadingVerify || extractRes?.status === 'rejected'} onClick={() => handleVerify("reject")}> <XCircle size={18} /> Reject </button>
                  <button className="btn-primary bg-emerald-600 hover:bg-emerald-500 shadow-emerald-600/20 flex items-center justify-center gap-2 py-3 disabled:opacity-50" disabled={loadingVerify || extractRes?.status === 'approved'} onClick={() => handleVerify("approve")}> {loadingVerify ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle2 size={18} />} Approve & Save </button>
                  {extractRes?.status === 'approved' && (
                    <button className="btn-primary bg-sky-600 hover:bg-sky-500 shadow-sky-600/20 flex items-center justify-center gap-2 py-3 col-span-2 mt-1" onClick={() => window.open(`http://localhost:8000/download/${docId}`)}><FileText size={18} /> Download Report</button>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="grid lg:grid-cols-12 gap-6 items-start">
            <div className="lg:col-span-5 panel flex flex-col h-[500px]">
              <div className="flex items-center gap-2 mb-4 pb-4 border-b border-slate-800">
                <div className="w-8 h-8 rounded-full bg-sky-500/10 flex items-center justify-center text-sky-400"><MessageSquare size={16} /></div>
                <div>
                  <h2 className="font-semibold text-white leading-tight">Legal AI Assistant</h2>
                  <p className="text-xs text-slate-400">Ask questions about the active document</p>
                </div>
              </div>

              <div ref={chatScrollRef} className="flex-1 overflow-y-auto mb-4 space-y-4 pr-2 custom-scrollbar">
                {chatHistory.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-slate-500 text-sm text-center">
                    <MessageSquare size={24} className="mb-2 opacity-20" />
                    <p>Ask about deadlines, penalties,<br />or specific legal clauses.</p>
                  </div>
                ) : (
                  chatHistory.map((msg, i) => (
                    <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${msg.role === 'user' ? 'bg-sky-600 text-white rounded-br-sm' : 'bg-slate-800 text-slate-200 border border-slate-700 rounded-bl-sm'}`}>
                        {msg.content}
                      </div>
                    </div>
                  ))
                )}
                {loadingChat && (
                  <div className="flex justify-start">
                    <div className="bg-slate-800 border border-slate-700 rounded-2xl rounded-bl-sm px-4 py-3 flex gap-1">
                      <div className="w-2 h-2 bg-sky-400 rounded-full animate-bounce"></div>
                      <div className="w-2 h-2 bg-sky-400 rounded-full animate-bounce" style={{ animationDelay: "0.2s" }}></div>
                      <div className="w-2 h-2 bg-sky-400 rounded-full animate-bounce" style={{ animationDelay: "0.4s" }}></div>
                    </div>
                  </div>
                )}
              </div>

              <form onSubmit={handleChat} className="relative mt-auto">
                <input className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-4 pr-12 py-3 text-sm text-white focus:border-sky-500 outline-none" placeholder={docId ? "Ask a question..." : "Upload a document first..."} value={chatQ} onChange={e => setChatQ(e.target.value)} disabled={!docId || loadingChat} />
                <button type="submit" disabled={!docId || loadingChat || !chatQ.trim()} className="absolute right-2 top-2 p-1.5 bg-sky-600 hover:bg-sky-500 text-white rounded-lg transition-colors disabled:opacity-50"><Send size={16} /></button>
              </form>
            </div>

            <div className="lg:col-span-7 panel h-[500px] flex flex-col">
              <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-800">
                <div>
                  <h2 className="font-semibold text-white text-lg">System Dashboard</h2>
                  <p className="text-xs text-slate-400">Overview of all approved cases</p>
                </div>
                <button onClick={loadDashboard} disabled={loadingDashboard} className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors">
                  <RefreshCcw size={16} className={loadingDashboard ? "animate-spin" : ""} />
                </button>
              </div>

              {dashboard ? (
                <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-6">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 flex flex-col items-center justify-center">
                      <div className="text-3xl font-bold text-white mb-1">{(dashboard && dashboard.approved_cases) ? dashboard.approved_cases.length : 0}</div>
                      <div className="text-xs font-medium text-slate-400 uppercase tracking-wider">Total Approved</div>
                    </div>
                    <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 flex flex-col items-center justify-center">
                      <div className="text-3xl font-bold text-sky-400 mb-1">{Object.keys((dashboard && dashboard.department_breakdown) || {}).length}</div>
                      <div className="text-xs font-medium text-slate-400 uppercase tracking-wider">Departments</div>
                    </div>
                    <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 flex flex-col items-center justify-center">
                      <div className="text-3xl font-bold text-red-400 mb-1">{(dashboard && dashboard.priority_breakdown) ? (dashboard.priority_breakdown.High || 0) : 0}</div>
                      <div className="text-xs font-medium text-red-500/70 uppercase tracking-wider">High Priority</div>
                    </div>
                    <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 flex flex-col items-center justify-center">
                      <div className="text-3xl font-bold text-amber-400 mb-1">{(dashboard && dashboard.deadlines) ? dashboard.deadlines.length : 0}</div>
                      <div className="text-xs font-medium text-amber-500/70 uppercase tracking-wider">Deadlines</div>
                    </div>
                  </div>

                  <div className="grid md:grid-cols-2 gap-6">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-300 mb-3">By Department</h3>
                      <div className="space-y-2">
                        {Object.entries(dashboard.department_breakdown || {}).map(([dept, count]) => (
                          <div key={dept} className="flex items-center justify-between bg-slate-950 border border-slate-800 px-3 py-2 rounded-lg text-sm">
                            <span className="text-slate-300 truncate pr-2">{dept}</span>
                            <span className="bg-slate-800 text-white font-mono px-2 py-0.5 rounded text-xs">{count}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-slate-300 mb-3">By Priority</h3>
                      <div className="space-y-2">
                        {['High', 'Medium', 'Low'].map((p) => {
                          const count = dashboard.priority_breakdown?.[p] || 0;
                          return (
                            <div key={p} className="flex items-center justify-between bg-slate-950 border border-slate-800 px-3 py-2 rounded-lg text-sm">
                              <PriorityBadge priority={p} />
                              <span className="bg-slate-800 text-white font-mono px-2 py-0.5 rounded text-xs">{count}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex items-center justify-center text-slate-500"><Loader2 className="animate-spin mr-2" /> Loading Dashboard...</div>
              )}
            </div>
          </div>

          <div className="grid lg:grid-cols-12 gap-6">
            <div className="lg:col-span-7 panel bg-slate-950/80 border border-slate-800 p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-lg font-semibold text-white">Case Assignment</h2>
                  <p className="text-sm text-slate-400">Assign the selected case to an officer.</p>
                </div>
              </div>

              <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Selected Case</label>
                    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-3 text-sm text-slate-300">{docId ? `Case #${docId}` : "Pick a case from the history list"}</div>
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Assign to Officer</label>
                    <select className="w-full rounded-2xl border border-slate-800 bg-slate-900 px-4 py-3 text-sm text-white outline-none focus:border-sky-500" value={assignmentTarget} onChange={(e) => setAssignmentTarget(e.target.value)}>
                      <option value="">Select officer</option>
                      {users.map((u) => <option key={u.id} value={u.id}>{u.username} ({u.email})</option>)}
                    </select>
                  </div>
                </div>
                <button disabled={!docId || !assignmentTarget} onClick={handleAssignCase} className="btn-primary w-full py-3 rounded-2xl text-white disabled:opacity-50">Assign Case</button>
                {assignmentMessage && <p className="text-sm text-slate-300">{assignmentMessage}</p>}
              </div>
            </div>

            <div className="lg:col-span-5 panel bg-slate-950/80 border border-slate-800 p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-lg font-semibold text-white">Create Task</h2>
                  <p className="text-sm text-slate-400">Add a new officer task for the selected case.</p>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-xs text-slate-400">Case</label>
                  <input type="text" readOnly value={taskForm.case_id ? `#${taskForm.case_id}` : "Select a case"} className="mt-2 w-full rounded-2xl border border-slate-800 bg-slate-900 px-4 py-3 text-sm text-slate-300 outline-none" />
                </div>
                <div>
                  <label className="text-xs text-slate-400">Officer</label>
                  <select className="mt-2 w-full rounded-2xl border border-slate-800 bg-slate-900 px-4 py-3 text-sm text-white outline-none" value={taskForm.assigned_to} onChange={e => setTaskForm({ ...taskForm, assigned_to: e.target.value })}>
                    <option value="">Pick officer</option>
                    {users.map((u) => <option key={u.id} value={u.id}>{u.username}</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-slate-400">Status</label>
                    <select className="mt-2 w-full rounded-2xl border border-slate-800 bg-slate-900 px-4 py-3 text-sm text-white outline-none" value={taskForm.status} onChange={e => setTaskForm({ ...taskForm, status: e.target.value })}>
                      <option value="pending">Pending</option>
                      <option value="in-progress">In Progress</option>
                      <option value="completed">Completed</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-slate-400">Deadline</label>
                    <input type="date" value={taskForm.deadline} onChange={e => setTaskForm({ ...taskForm, deadline: e.target.value })} className="mt-2 w-full rounded-2xl border border-slate-800 bg-slate-900 px-4 py-3 text-sm text-white outline-none" />
                  </div>
                </div>
                <button disabled={!taskForm.case_id || !taskForm.assigned_to} onClick={handleCreateTask} className="btn-primary w-full py-3 rounded-2xl text-white disabled:opacity-50">Create Task</button>
                {taskMessage && <p className="text-sm text-slate-300">{taskMessage}</p>}
              </div>
            </div>
          </div>

          <div className="grid lg:grid-cols-12 gap-6">
            <div className="lg:col-span-12 panel bg-slate-950/80 border border-slate-800 p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-lg font-semibold text-white">Tasks Overview</h2>
                  <p className="text-sm text-slate-400">Monitor task status across assigned cases.</p>
                </div>
                <button onClick={loadTasks} disabled={loadingTasks} className="text-slate-400 hover:text-white">Refresh</button>
              </div>
              <div className="space-y-3">
                {tasks.length === 0 ? (
                  <div className="text-slate-500 text-sm">No tasks created yet.</div>
                ) : (
                  tasks.map((task) => (
                    <div key={task.id} className="rounded-2xl border border-slate-800 bg-slate-900 p-4 grid sm:grid-cols-3 gap-4">
                      <div>
                        <p className="text-slate-400 text-xs uppercase tracking-wider">Task</p>
                        <p className="text-white font-medium">#{task.id} for case #{task.case_id}</p>
                      </div>
                      <div>
                        <p className="text-slate-400 text-xs uppercase tracking-wider">Assigned Officer</p>
                        <p className="text-white font-medium">{users.find((u) => u.id === task.assigned_to)?.username || `Officer ${task.assigned_to}`}</p>
                      </div>
                      <div className="flex flex-col gap-2">
                        <span className="text-slate-400 text-xs uppercase tracking-wider">Status</span>
                        <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${task.status === 'completed' ? 'bg-emerald-500/15 text-emerald-300' : task.status === 'in-progress' ? 'bg-yellow-500/15 text-amber-300' : 'bg-slate-800 text-slate-300'}`}>{task.status}</span>
                        <p className="text-slate-500 text-xs">{task.deadline || 'No deadline'}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
