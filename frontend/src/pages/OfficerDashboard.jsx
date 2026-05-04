import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  Loader2,
  AlertTriangle,
  XCircle,
  Clock,
  RefreshCcw,
  FileText,
  ChevronRight,
  ChevronDown,
  MessageSquare,
  Send,
  Building2,
  Activity,
  FolderOpen,
  Menu,
  Calendar,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { usePreventBackButton } from "../hooks/usePreventBackButton";
import { PriorityBadge } from "../components/SharedComponents";
import { fetchCases, fetchCaseDetails, fetchMyTasks, askChat } from "../api";

export default function OfficerDashboard() {
  const { logout, user } = useAuth();
  const navigate = useNavigate();
  usePreventBackButton("/login");
  const chatScrollRef = useRef(null);
  const [cases, setCases] = useState([]);
  const [selectedCase, setSelectedCase] = useState(null);
  const [caseDetails, setCaseDetails] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [chatQ, setChatQ] = useState("");
  const [chatHistory, setChatHistory] = useState([]);
  const [globalError, setGlobalError] = useState(null);
  const [loadingCases, setLoadingCases] = useState(false);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [loadingChat, setLoadingChat] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [directivesExpanded, setDirectivesExpanded] = useState(false);

  useEffect(() => {
    if (!user) {
      navigate("/login", { replace: true });
      return;
    }
    loadCases();
    loadTasks();
  }, [user]);

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [chatHistory, loadingChat]);

  const loadCases = async () => {
    setLoadingCases(true);
    try {
      const data = await fetchCases();
      setCases(Array.isArray(data) ? data : []);
      setGlobalError(null);
    } catch (e) {
      console.error(e);
      setGlobalError("Could not load assigned cases.");
    } finally {
      setLoadingCases(false);
    }
  };

  const loadTasks = async () => {
    setLoadingTasks(true);
    try {
      const data = await fetchMyTasks();
      setTasks(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error(e);
      setTasks([]);
    } finally {
      setLoadingTasks(false);
    }
  };

  const selectCase = async (id) => {
    setLoadingDetails(true);
    try {
      const data = await fetchCaseDetails(id);
      setSelectedCase(id);
      setCaseDetails(data);
      setChatHistory([]);
      setDirectivesExpanded(false);
    } catch (e) {
      console.error(e);
      setGlobalError("Unable to load case details.");
    } finally {
      setLoadingDetails(false);
    }
  };

  const handleChat = async (e) => {
    e.preventDefault();
    if (!chatQ.trim() || !selectedCase || loadingChat) return;

    const question = chatQ;
    setChatQ("");
    setChatHistory(prev => [...prev, { role: "user", content: question }]);
    setLoadingChat(true);

    try {
      const r = await askChat(selectedCase, question);
      if (!r || !r.answer) throw new Error("Invalid response");
      setChatHistory(prev => [...prev, { role: "assistant", content: r.answer }]);
    } catch (err) {
      console.error(err);
      setChatHistory(prev => [...prev, { role: "assistant", content: "AI assistant unavailable. Try again later." }]);
    } finally {
      setLoadingChat(false);
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

  return (
    <div className="min-h-screen bg-[#020617] text-slate-200 font-sans selection:bg-sky-500/30 flex flex-col">
      <nav className="sticky top-0 z-50 bg-slate-900/80 backdrop-blur-xl border-b border-white/5">
        <div className="max-w-[1600px] mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors">
              {isSidebarOpen ? <Menu size={20} /> : <FolderOpen size={20} />}
            </button>
            <div className="w-8 h-8 rounded-lg bg-sky-500 flex items-center justify-center text-white shadow-lg shadow-sky-500/20">
              <Building2 size={18} />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white tracking-tight leading-none hidden sm:block">Officer Workbench</h1>
              <p className="text-[10px] text-sky-400 font-medium uppercase tracking-wider mt-0.5 hidden sm:block">Assigned case management</p>
            </div>
          </div>

          <div className="flex items-center gap-4 text-sm font-medium">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-800 border border-slate-700">
              <Activity size={14} className="text-emerald-400" />
              <span className="text-slate-300 hidden sm:inline">{user?.username || "Officer"}</span>
            </div>
            <button onClick={() => { logout(); navigate("/login", { replace: true }); }} className="text-slate-400 hover:text-white">Logout</button>
          </div>
        </div>
      </nav>

      <div className="flex flex-1 max-w-[1600px] w-full mx-auto overflow-hidden relative">
        <aside className={`transition-all duration-300 ease-in-out border-r border-slate-800 bg-slate-900/95 md:bg-slate-900/30 flex flex-col h-[calc(100vh-4rem)] absolute md:relative z-40 ${isSidebarOpen ? 'w-80 translate-x-0' : 'w-80 -translate-x-full md:translate-x-0 md:w-0 md:opacity-0 md:border-none'}`}>
          <div className="p-4 border-b border-slate-800 flex justify-between items-center min-w-[320px]">
            <h2 className="font-semibold text-slate-200 flex items-center gap-2"><FolderOpen size={18} className="text-sky-400" /> Assigned Cases</h2>
            <button onClick={loadCases} className="text-slate-400 hover:text-white" disabled={loadingCases}>
              <RefreshCcw size={14} className={loadingCases ? "animate-spin" : ""} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-2 min-w-[320px]">
            {cases.length === 0 && !loadingCases && <div className="text-center text-slate-500 text-sm py-8">No assigned cases available.</div>}
            {cases.map((c) => (
              <div key={c.document_id} onClick={() => selectCase(c.document_id)} className={`p-3 rounded-xl border cursor-pointer transition-colors ${selectedCase === c.document_id ? 'bg-sky-900/20 border-sky-500/50' : 'bg-slate-900 border-slate-800 hover:border-slate-600'}`}>
                <div className="flex justify-between items-start mb-2">
                  <div className="text-sm font-medium text-slate-200 truncate w-40" title={c.file_name}>{c.file_name}</div>
                  <div className={`text-[10px] px-2 py-0.5 rounded uppercase font-bold ${c.status === 'approved' ? 'bg-emerald-500/20 text-emerald-400' : c.status === 'rejected' ? 'bg-red-500/20 text-red-400' : 'bg-slate-800 text-slate-300'}`}>{c.status}</div>
                </div>
                <div className="flex justify-between items-center">
                  <div className="text-xs text-slate-400 truncate w-32"><Building2 size={10} className="inline mr-1" />{c.department}</div>
                  <PriorityBadge priority={c.priority} />
                </div>
              </div>
            ))}
          </div>
        </aside>

        {isSidebarOpen && <div className="fixed inset-0 bg-black/50 z-30 md:hidden" onClick={() => setIsSidebarOpen(false)} />}

        <main className="flex-1 p-4 md:p-6 space-y-8 overflow-y-auto h-[calc(100vh-4rem)] custom-scrollbar min-w-0">
          {globalError && (
            <div className="bg-red-500/10 border border-red-500/30 text-red-400 p-4 rounded-xl flex items-center justify-between">
              <div className="flex items-center gap-3"><AlertTriangle size={18} /><span className="text-sm font-medium">{globalError}</span></div>
              <button onClick={() => setGlobalError(null)} className="text-red-400/50 hover:text-red-400"><XCircle size={18} /></button>
            </div>
          )}

          <div className="grid lg:grid-cols-12 gap-6 items-start">
            <div className="lg:col-span-8 space-y-6">
              <div className="panel border-sky-500/20 bg-gradient-to-br from-slate-900 to-slate-900/80 shadow-2xl shadow-sky-900/10 h-full">
                <div className="p-6">
                  <div className="flex items-center justify-between mb-6">
                    <div>
                      <h2 className="text-2xl font-bold text-white">Officer Case Summary</h2>
                      <p className="text-sm text-slate-400">Review your assigned case and complete required actions.</p>
                    </div>
                    {selectedCase && <div className="text-xs uppercase px-2 py-1 rounded bg-slate-800 text-slate-300">Case #{selectedCase}</div>}
                  </div>

                  {selectedCase && caseDetails ? (
                    <>
                      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
                          <div className="text-slate-400 text-xs font-medium mb-1 flex items-center gap-1.5"><Calendar size={12} /> Order Date</div>
                          <div className="font-semibold text-white">{caseDetails.extracted_data?.date_of_order || "—"}</div>
                        </div>
                        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
                          <div className="text-slate-400 text-xs font-medium mb-1 flex items-center gap-1.5"><Clock size={12} /> Timeline</div>
                          <div className="font-semibold text-white truncate" title={caseDetails.extracted_data?.timeline}>{caseDetails.extracted_data?.timeline || "—"}</div>
                        </div>
                        <div className={`border rounded-xl p-4 ${caseDetails.extracted_data?.deadline_date && new Date(caseDetails.extracted_data.deadline_date) < new Date() ? 'bg-red-500/20 border-red-500/50' : caseDetails.extracted_data?.deadline_date ? 'bg-sky-500/10 border-sky-500/30' : 'bg-slate-800/50 border-slate-700/50'}`}>
                          <div className="text-slate-400 text-xs font-medium mb-1 flex items-center justify-between gap-1.5">
                            <span className="flex items-center gap-1"><AlertTriangle size={12} /> Deadline</span>
                            <span className={`text-[10px] uppercase font-bold tracking-wider ${caseDetails.extracted_data?.deadline_date && new Date(caseDetails.extracted_data.deadline_date) < new Date() ? 'text-red-400' : 'text-sky-400'}`}>{getUrgencyText(caseDetails.extracted_data?.deadline_date)}</span>
                          </div>
                          <div className={`relative z-10 ${getUrgencyClasses(caseDetails.extracted_data?.deadline_date)}`}>{caseDetails.extracted_data?.deadline_date || "Not Specified"}</div>
                        </div>
                        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
                          <div className="text-slate-400 text-xs font-medium mb-1 flex items-center gap-1.5"><Building2 size={12} /> Department</div>
                          <div className="font-semibold text-white truncate" title={caseDetails.extracted_data?.department}>{caseDetails.extracted_data?.department || "—"}</div>
                        </div>
                      </div>

                      <div className="bg-slate-950/50 rounded-xl p-5 border border-slate-800">
                        <div className="flex items-center justify-between cursor-pointer select-none group" onClick={() => setDirectivesExpanded(!directivesExpanded)}>
                          <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider group-hover:text-white transition-colors">Key Directives</h3>
                          <button className="text-slate-400 group-hover:text-white transition-colors p-1 bg-slate-900 rounded border border-slate-800">
                            {directivesExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                          </button>
                        </div>

                        <div className={`transition-all duration-300 ease-in-out overflow-hidden ${directivesExpanded ? 'max-h-[500px] mt-4 opacity-100' : 'max-h-[80px] mt-3 opacity-80'}`}>
                          <ul className="space-y-3">
                            {caseDetails.extracted_data?.directives?.map((d, i) => (
                              <li key={i} className="flex gap-3 text-sm text-slate-300 leading-relaxed">
                                <span className="text-sky-500 mt-0.5 shrink-0"><ChevronRight size={16} /></span>
                                <span className={directivesExpanded ? '' : 'line-clamp-1'}>{d}</span>
                              </li>
                            ))}
                            {(!caseDetails.extracted_data?.directives || caseDetails.extracted_data?.directives.length === 0) && (
                              <li className="text-sm text-slate-500 italic">No directives extracted yet.</li>
                            )}
                          </ul>
                        </div>
                      </div>

                      <div className="grid lg:grid-cols-2 gap-6">
                        <div className="panel bg-slate-950/80 border border-slate-800 p-6">
                          <h3 className="text-sm font-semibold text-white mb-4">Summary & Plan</h3>
                          <p className="text-slate-300 text-sm mb-4">{caseDetails.extracted_data?.summary || caseDetails.extracted_data?.action_required || "No summary available."}</p>
                          {caseDetails.action_plan?.plan?.steps?.map((step, index) => (
                            <div key={index} className="mb-4 rounded-2xl border border-slate-800 bg-slate-900 p-4">
                              <p className="text-sm font-semibold text-white">{step.step}</p>
                              <p className="text-xs text-slate-400 mt-1">Due: {step.due_date}</p>
                            </div>
                          ))}
                        </div>
                        <div className="panel bg-slate-950/80 border border-slate-800 p-6">
                          <h3 className="text-sm font-semibold text-white mb-4">Next Actions</h3>
                          <div className="space-y-3">
                            <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
                              <p className="text-slate-400 text-xs uppercase tracking-wider mb-2">Current Priority</p>
                              <PriorityBadge priority={caseDetails.extracted_data?.priority || "Medium"} />
                            </div>
                            <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
                              <p className="text-slate-400 text-xs uppercase tracking-wider mb-2">Deadline</p>
                              <p className={`text-sm ${getUrgencyClasses(caseDetails.extracted_data?.deadline_date)}`}>{caseDetails.extracted_data?.deadline_date || "Not set"}</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="min-h-[260px] rounded-3xl border border-dashed border-slate-800 bg-slate-900/40 flex items-center justify-center text-slate-500 text-center p-6">
                      {loadingDetails ? "Loading selected case..." : "Select an assigned case to view details."}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="lg:col-span-4 space-y-6">
              <div className="panel bg-slate-950/80 border border-slate-800 p-6 h-full">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-lg font-semibold text-white">Tasks</h2>
                    <p className="text-sm text-slate-400">Your pending and in-progress tasks.</p>
                  </div>
                  <button onClick={loadTasks} disabled={loadingTasks} className="text-slate-400 hover:text-white">Refresh</button>
                </div>
                <div className="space-y-4">
                  {tasks.length === 0 ? (
                    <div className="text-slate-500 text-sm">No tasks assigned yet.</div>
                  ) : (
                    tasks.map((task) => (
                      <div key={task.id} className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-sm font-semibold text-white">Task #{task.id}</p>
                          <span className={`text-[10px] uppercase px-2 py-1 rounded-full ${task.status === 'completed' ? 'bg-emerald-500/15 text-emerald-300' : task.status === 'in-progress' ? 'bg-yellow-500/15 text-amber-300' : 'bg-slate-800 text-slate-300'}`}>{task.status}</span>
                        </div>
                        <p className="text-slate-400 text-xs">Case #{task.case_id}</p>
                        <p className="text-slate-500 text-xs mt-2">Deadline: {task.deadline || 'None'}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="grid lg:grid-cols-12 gap-6 items-start pb-10">
            <div className="lg:col-span-12 panel flex flex-col h-[420px]">
              <div className="flex items-center gap-2 mb-4 pb-4 border-b border-slate-800">
                <div className="w-8 h-8 rounded-full bg-sky-500/10 flex items-center justify-center text-sky-400"><MessageSquare size={16} /></div>
                <div>
                  <h2 className="font-semibold text-white leading-tight">Legal AI Assistant</h2>
                  <p className="text-xs text-slate-400">Ask questions about the selected case.</p>
                </div>
              </div>

              <div ref={chatScrollRef} className="flex-1 overflow-y-auto mb-4 space-y-4 pr-2 custom-scrollbar">
                {chatHistory.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-slate-500 text-sm text-center">
                    <MessageSquare size={24} className="mb-2 opacity-20" />
                    <p>Ask about deadlines, priorities, or evidence requirements.</p>
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
                <input className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-4 pr-12 py-3 text-sm text-white focus:border-sky-500 outline-none" placeholder={selectedCase ? "Ask a question..." : "Select a case first..."} value={chatQ} onChange={e => setChatQ(e.target.value)} disabled={!selectedCase || loadingChat} />
                <button type="submit" disabled={!selectedCase || loadingChat || !chatQ.trim()} className="absolute right-2 top-2 p-1.5 bg-sky-600 hover:bg-sky-500 text-white rounded-lg transition-colors disabled:opacity-50"><Send size={16} /></button>
              </form>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
