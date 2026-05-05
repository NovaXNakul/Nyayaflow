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
  Calendar,
  Eye,
  Download,
  Printer,
  X
} from "lucide-react";
import { useTranslation } from "react-i18next";
import Navbar from "../components/Navbar";
import { useAuth } from "../context/AuthContext";
import { usePreventBackButton } from "../hooks/usePreventBackButton";
import { PriorityBadge } from "../components/SharedComponents";
import { fetchCases, fetchCaseDetails, fetchMyTasks, askChat, downloadReport, fetchReportData, viewOriginalDoc } from "../api";

export default function OfficerDashboard() {
  const { t } = useTranslation();
  const { user } = useAuth();
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
  const [loadingReport, setLoadingReport] = useState(false);
  
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [showPreview, setShowPreview] = useState(false);
  const [reportData, setReportData] = useState(null);

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
      if (window.innerWidth < 1024) {
        setIsSidebarOpen(false);
      }
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

  const handlePreviewReport = async () => {
    if (!selectedCase) return;
    setLoadingReport(true);
    try {
      const data = await fetchReportData(selectedCase);
      setReportData(data);
      setShowPreview(true);
    } catch (e) {
      setGlobalError("Failed to load report preview.");
    } finally {
      setLoadingReport(false);
    }
  };

  const handleDownloadReport = async () => {
    if (!selectedCase) return;
    try {
      await downloadReport(selectedCase);
    } catch (e) {
      setGlobalError("Failed to download report.");
    }
  };

  const handleViewDocument = async () => {
    if (!selectedCase) return;
    try {
      await viewOriginalDoc(selectedCase);
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
        title={t('admin.officerWorkbench')}
        subtitle="Manage assigned compliance cases"
      />

      <div className="flex flex-1 max-w-[1600px] w-full mx-auto overflow-hidden relative">
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
              <div key={c.document_id} onClick={() => selectCase(c.document_id)} className={`group p-4 rounded-lg border-2 transition-all duration-200 cursor-pointer ${selectedCase === c.document_id ? 'bg-primary/5 border-primary shadow-sm' : 'bg-card border-transparent hover:bg-muted/50 hover:border-border'}`}>
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

        <main className="flex-1 p-6 overflow-y-auto h-[calc(100vh-4rem)] custom-scrollbar min-w-0 bg-muted/5">
          {globalError && (
            <div className="mb-6 bg-destructive/10 border border-destructive/20 text-destructive p-4 rounded-lg flex items-center justify-between shadow-sm animate-in">
              <div className="flex items-center gap-3"><AlertTriangle size={18} /><span className="text-sm font-semibold uppercase tracking-tight">{globalError}</span></div>
              <button onClick={() => setGlobalError(null)} className="p-1 hover:bg-destructive/20 rounded transition-colors"><XCircle size={18} /></button>
            </div>
          )}

          <div className="grid lg:grid-cols-12 gap-6 items-start">
            <div className="lg:col-span-8 space-y-6">
              <div className="card-premium h-auto flex flex-col min-h-[500px]">
                <div className="flex items-start justify-between mb-8 pb-6 border-b border-border">
                  <div>
                    <h2 className="text-xl font-bold tracking-tight mb-2">Compliance Workbench</h2>
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest leading-none">Review assigned court directives</p>
                  </div>
                  {selectedCase && (
                    <div className="flex flex-col items-end">
                      <span className="text-[9px] font-black text-primary uppercase tracking-widest mb-1">Active Record</span>
                      <div className="px-3 py-1.5 rounded-lg bg-muted border border-border text-xs font-bold shadow-inner">#{selectedCase}</div>
                    </div>
                  )}
                </div>

                {selectedCase && caseDetails ? (
                  <div className="space-y-8 animate-in">
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                      <div className="bg-muted/30 border border-border rounded-lg p-4 shadow-sm">
                        <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2 block flex items-center gap-1.5"><Calendar size={12} /> {t('cases.orderDate')}</label>
                        <div className="font-bold text-sm">{caseDetails.extracted_data?.date_of_order || "—"}</div>
                      </div>
                      <div className="bg-muted/30 border border-border rounded-lg p-4 shadow-sm">
                        <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2 block flex items-center gap-1.5"><Clock size={12} /> {t('cases.timeline')}</label>
                        <div className="font-bold text-sm truncate" title={caseDetails.extracted_data?.timeline}>{caseDetails.extracted_data?.timeline || "—"}</div>
                      </div>
                      <div className={`border rounded-lg p-4 shadow-sm transition-colors ${caseDetails.extracted_data?.deadline_date && new Date(caseDetails.extracted_data.deadline_date) < new Date() ? 'bg-destructive/5 border-destructive/20' : 'bg-muted/30 border-border'}`}>
                        <div className="flex items-center justify-between mb-2">
                          <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block flex items-center gap-1.5"><AlertTriangle size={12} /> {t('cases.deadline')}</label>
                          <span className={`text-[8px] font-black uppercase ${caseDetails.extracted_data?.deadline_date && new Date(caseDetails.extracted_data.deadline_date) < new Date() ? 'text-destructive' : 'text-primary'}`}>{getUrgencyText(caseDetails.extracted_data?.deadline_date)}</span>
                        </div>
                        <div className={`font-bold text-sm ${getUrgencyClasses(caseDetails.extracted_data?.deadline_date)}`}>{caseDetails.extracted_data?.deadline_date || "N/A"}</div>
                      </div>
                      <div className="bg-muted/30 border border-border rounded-lg p-4 shadow-sm">
                        <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2 block flex items-center gap-1.5"><Building2 size={12} /> {t('cases.department')}</label>
                        <div className="font-bold text-sm truncate" title={caseDetails.extracted_data?.department}>{caseDetails.extracted_data?.department || "—"}</div>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="flex items-center gap-3">
                        <div className="h-px flex-1 bg-border" />
                        <h3 className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em]">{t('cases.directives')}</h3>
                        <div className="h-px flex-1 bg-border" />
                      </div>
                      
                      <div className="bg-muted/20 rounded-lg p-6 border border-border shadow-inner">
                        <ul className="space-y-4">
                          {caseDetails.extracted_data?.directives?.map((d, i) => (
                            <li key={i} className="flex gap-4 text-sm leading-relaxed group">
                              <span className="w-6 h-6 rounded bg-card border border-border flex items-center justify-center text-primary font-bold text-[10px] shrink-0 shadow-sm group-hover:border-primary/50 transition-colors">{i + 1}</span>
                              <span className="pt-0.5 text-muted-foreground group-hover:text-foreground transition-colors">{d}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>

                    <div className="grid lg:grid-cols-2 gap-6 pb-6">
                      <div className="card-premium bg-muted/10 border-border/50 p-6 flex flex-col">
                        <h3 className="text-[10px] font-black uppercase tracking-widest mb-4 flex items-center gap-2">
                          <FileText size={14} className="text-primary" />
                          {t('cases.summary')}
                        </h3>
                        <p className="text-muted-foreground text-sm leading-relaxed mb-6 italic border-l-2 border-border pl-4">
                          {caseDetails.extracted_data?.case_details || caseDetails.extracted_data?.action_required || t('common.noData')}
                        </p>
                        
                        <div className="mt-auto space-y-3">
                          <div className="flex items-center gap-2 mb-2">
                            <Activity size={14} className="text-primary" />
                            <span className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">Procedural Steps</span>
                          </div>
                          {caseDetails.action_plan?.plan?.steps?.map((step, index) => (
                            <div key={index} className="flex items-center gap-3 p-3 rounded-lg bg-card border border-border shadow-sm">
                              <div className="w-2 h-2 rounded-full bg-primary shrink-0" />
                              <div className="min-w-0">
                                <p className="text-xs font-bold truncate">{step.step}</p>
                                <p className="text-[10px] text-muted-foreground font-medium">{step.due_date}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="card-premium bg-muted/10 border-border/50 p-6 flex flex-col">
                        <h3 className="text-[10px] font-black uppercase tracking-widest mb-4 flex items-center gap-2">
                          <Activity size={14} className="text-primary" />
                          Compliance Status
                        </h3>
                        <div className="space-y-4 mb-8">
                          <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
                            <label className="text-[10px] font-bold text-muted-foreground uppercase mb-2 block">{t('cases.priority')}</label>
                            <PriorityBadge priority={caseDetails.extracted_data?.priority || "Medium"} />
                          </div>
                          <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
                            <label className="text-[10px] font-bold text-muted-foreground uppercase mb-2 block">System Status</label>
                            <div className="flex items-center gap-2 text-sm font-bold capitalize">
                              <div className={`w-2 h-2 rounded-full ${caseDetails.status === 'approved' ? 'bg-success' : 'bg-primary'}`} />
                              {t(`status.${caseDetails.status.toLowerCase()}`)}
                            </div>
                          </div>
                        </div>

                        <div className="mt-auto grid grid-cols-1 gap-3 pt-6 border-t border-border/50">
                          <div className="flex gap-2">
                            <button onClick={handlePreviewReport} disabled={loadingReport} className="flex-1 btn-secondary-premium py-2 text-xs flex items-center justify-center gap-2">
                              {loadingReport ? <Loader2 size={14} className="animate-spin" /> : <Eye size={14} />}
                              Preview Report
                            </button>
                            <button onClick={handleDownloadReport} className="flex-1 btn-primary-premium py-2 text-xs flex items-center justify-center gap-2">
                              <Download size={14} />
                              PDF
                            </button>
                          </div>
                          <button onClick={handleViewDocument} className="w-full btn-secondary-premium py-2 text-xs flex items-center justify-center gap-2">
                            <FileText size={14} />
                            View Original Document
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground space-y-4">
                    <div className="w-16 h-16 rounded-full bg-muted/30 flex items-center justify-center border-2 border-dashed border-border">
                      <FolderOpen size={32} className="opacity-10" />
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-bold">No Case Selected</p>
                      <p className="text-[10px] max-w-[180px] mt-2 leading-relaxed">Select a case from the sidebar to begin compliance review.</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="lg:col-span-4 flex flex-col gap-6">
              <div className="card-premium p-6 flex flex-col h-[450px]">
                <div className="flex items-center justify-between mb-6 pb-4 border-b border-border">
                  <div>
                    <h3 className="text-lg font-bold leading-none">{t('admin.myTasks')}</h3>
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mt-1">Directives Checklist</p>
                  </div>
                  <button onClick={loadTasks} disabled={loadingTasks} className="p-2 rounded-lg bg-muted text-muted-foreground hover:text-primary transition-all active:scale-95 border border-border">
                    <RefreshCcw size={16} className={loadingTasks ? "animate-spin" : ""} />
                  </button>
                </div>
                
                <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-3">
                  {tasks.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-muted-foreground py-8">
                      <Activity size={24} className="opacity-10 mb-2" />
                      <p className="text-[10px] font-bold uppercase tracking-widest">{t('common.noData')}</p>
                    </div>
                  ) : (
                    tasks.map((task) => (
                      <div key={task.id} className="group p-4 rounded-xl border border-border bg-muted/20 transition-all hover:bg-card hover:border-primary/20 hover:shadow-sm animate-in">
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-[9px] font-black text-primary uppercase tracking-widest">TASK #{task.id}</span>
                          <span className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded border ${task.status === 'completed' ? 'bg-success/10 text-success border-success/20' : 'bg-warning/10 text-warning border-warning/20'}`}>
                            {task.status}
                          </span>
                        </div>
                        <p className="text-xs font-bold mb-2">Compliance Action Required</p>
                        <div className="flex items-center justify-between text-[9px] font-bold text-muted-foreground">
                          <span className="flex items-center gap-1"><FolderOpen size={10}/> CASE {task.case_id}</span>
                          <span className="flex items-center gap-1"><Calendar size={10}/> {task.deadline || 'NO DATE'}</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="card-premium p-6 flex flex-col min-h-[400px]">
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
                      <p className="text-[11px] font-medium leading-relaxed">{t('assistant.welcome')}</p>
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
                      <div className="bg-muted border border-border rounded-lg rounded-bl-none px-4 py-3 flex gap-1 shadow-sm">
                        <div className="w-1 h-1 bg-primary rounded-full animate-bounce"></div>
                        <div className="w-1 h-1 bg-primary rounded-full animate-bounce delay-100"></div>
                        <div className="w-1 h-1 bg-primary rounded-full animate-bounce delay-200"></div>
                      </div>
                    </div>
                  )}
                </div>

                <form onSubmit={handleChat} className="relative mt-auto">
                  <input 
                    className="input-premium pr-12 text-xs" 
                    placeholder={selectedCase ? t('assistant.placeholder') : t('assistant.uploadFirst')} 
                    value={chatQ} 
                    onChange={e => setChatQ(e.target.value)} 
                    disabled={!selectedCase || loadingChat} 
                  />
                  <button 
                    type="submit" 
                    disabled={!selectedCase || loadingChat || !chatQ.trim()} 
                    className="absolute right-1 top-1 p-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-md transition-all shadow-sm active:scale-95 disabled:opacity-50"
                  >
                    <Send size={14} />
                  </button>
                </form>
              </div>
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
                <h3 className="font-bold">Report Preview: CASE-{selectedCase}</h3>
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
                  className="p-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors flex items-center gap-2 text-sm font-medium"
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
                {/* A4 Content Emulation */}
                <div className="text-center mb-12">
                  <h1 className="text-3xl font-bold text-blue-900 dark:text-blue-400 mb-2 uppercase tracking-tight">Legal Case Analysis Report</h1>
                  <div className="h-1 w-24 bg-blue-900 dark:bg-blue-400 mx-auto mb-4" />
                  <p className="text-sm text-slate-500 uppercase tracking-widest font-sans">GovOS Court Intelligence System</p>
                </div>

                <div className="grid grid-cols-2 gap-y-4 text-sm font-sans mb-12 border-y border-slate-100 dark:border-slate-800 py-6">
                  <div><span className="font-bold uppercase text-slate-400 text-[10px] block">Case Identifier</span> <span className="font-bold">CASE-{selectedCase}</span></div>
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
