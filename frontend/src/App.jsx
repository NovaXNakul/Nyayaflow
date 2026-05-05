import { useState, useEffect, useRef } from "react";
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
} from "lucide-react";
import { useTranslation } from "react-i18next";
import Navbar from "./components/Navbar";
import {
  askChat,
  extractData,
  fetchDashboard,
  fetchCases,
  fetchCaseDetails,
  generateAction,
  uploadFile,
  verifyData,
  translateFullData
} from "./api";
import { PriorityBadge } from "./components/SharedComponents";

export default function App() {
  const { t, i18n } = useTranslation();
  
  const [file, setFile] = useState(null);
  const [docId, setDocId] = useState(null);
  const [extractRes, setExtractRes] = useState(null);
  const [actionRes, setActionRes] = useState(null);
  const [dashboard, setDashboard] = useState(null);
  const [cases, setCases] = useState([]);
  const [globalError, setGlobalError] = useState(null);
  const chatScrollRef = useRef(null);

  const [editForm, setEditForm] = useState({});
  const [chatQ, setChatQ] = useState("");
  const [chatHistory, setChatHistory] = useState([]);
  
  const [loadingUpload, setLoadingUpload] = useState(false);
  const [loadingExtract, setLoadingExtract] = useState(false);
  const [loadingAction, setLoadingAction] = useState(false);
  const [loadingVerify, setLoadingVerify] = useState(false);
  const [loadingDashboard, setLoadingDashboard] = useState(false);
  const [loadingCases, setLoadingCases] = useState(false);
  const [loadingChat, setLoadingChat] = useState(false);
  const [loadingTranslate, setLoadingTranslate] = useState(false);

  const [language, setLanguage] = useState(i18n.language === 'en' ? 'English' : i18n.language === 'hi' ? 'Hindi' : 'Kannada');
  const [translatedContent, setTranslatedContent] = useState(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [directivesExpanded, setDirectivesExpanded] = useState(false);
  const [reportLang, setReportLang] = useState(i18n.language);

  useEffect(() => {
    loadDashboard();
    loadCases();
  }, []);

  useEffect(() => {
    const lang = i18n.language === 'en' ? 'English' : i18n.language === 'hi' ? 'Hindi' : 'Kannada';
    setLanguage(lang);
    setReportLang(i18n.language);
  }, [i18n.language]);

  useEffect(() => {
    if (docId && extractRes?.status !== 'processing') {
      fetchTranslation(docId, language);
    }
  }, [language, docId, extractRes?.status, actionRes]);

  const fetchTranslation = async (caseId, targetLanguage) => {
    if (!caseId || !targetLanguage || targetLanguage === 'English') {
      setTranslatedContent(null);
      return;
    }
    try {
      setLoadingTranslate(true);
      const result = await translateFullData(caseId, targetLanguage);
      setTranslatedContent(result);
    } catch (err) {
      console.error('Translation failed:', err);
    } finally {
      setLoadingTranslate(false);
    }
  };

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

  const handleSelectCase = async (id) => {
    setLoadingCases(true);
    try {
      const data = await fetchCaseDetails(id);
      setDocId(id);
      setExtractRes({ extracted_data: data.extracted_data, status: data.status });
      setActionRes(data.action_plan || null);
      setChatHistory([]);
      if (window.innerWidth < 1024) setIsSidebarOpen(false);
    } catch (err) {
      console.error(err);
      setGlobalError("Failed to load case details.");
    } finally {
      setLoadingCases(false);
    }
  };

  const handleUpload = async () => {
    if (!file) return;
    setLoadingUpload(true);
    setGlobalError(null);
    try {
      const r = await uploadFile(file);
      const id = r.document_id;
      setDocId(id);
      const extract = await extractData(id);
      setExtractRes(extract);
      setEditForm(extract.extracted_data || {});
      loadCases();
    } catch (e) {
      console.error("Upload error:", e);
      setGlobalError("Failed to upload and analyze document.");
    } finally {
      setLoadingUpload(false);
    }
  };

  const handleGenerateAction = async () => {
    if (!docId) return;
    setLoadingAction(true);
    try {
      const r = await generateAction(docId, language);
      setActionRes(r);
    } catch (e) {
      console.error("Action error:", e);
      setGlobalError("Failed to generate action plan.");
    } finally {
      setLoadingAction(false);
    }
  };

  const handleVerify = async (decision) => {
    if (!docId) return;
    setLoadingVerify(true);
    try {
      await verifyData(docId, decision, (decision === 'edit' || decision === 'approve') ? editForm : null);
      await loadDashboard();
      await loadCases();
      setExtractRes(prev => ({
        ...prev,
        extracted_data: editForm,
        status: decision === 'approve' ? 'approved' : decision === 'reject' ? 'rejected' : 'edited'
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
    setChatHistory(prev => [...prev, { role: 'user', content: question }]);
    setLoadingChat(true);
    try {
      const r = await askChat(docId, question, language);
      setChatHistory(prev => [...prev, { role: 'assistant', content: r.answer }]);
    } catch (err) {
      console.error("Chat error:", err);
      setChatHistory(prev => [...prev, { role: 'assistant', content: "Error generating response." }]);
    } finally {
      setLoadingChat(false);
    }
  };

  const getVal = (field, fallback = "") => {
    if (translatedContent) {
      if (field === 'action_required') return translatedContent.recommended_action || fallback;
      if (field === 'directives') return translatedContent.directives || extractRes?.extracted_data?.directives || [];
      if (field === 'case_details') return translatedContent.summary || editForm?.case_details || fallback;
      if (field === 'deadline_date') return translatedContent.deadline_date || editForm?.deadline_date || fallback;
      if (field === 'priority') return translatedContent.priority || editForm?.priority || fallback;
      if (field === 'department') return translatedContent.department || editForm?.department || fallback;
      if (field === 'action_steps') return translatedContent.action_steps || actionRes?.plan?.steps || [];
    }
    if (field === 'action_required') return editForm?.action_required || extractRes?.extracted_data?.action_required || fallback;
    if (field === 'directives') return extractRes?.extracted_data?.directives || [];
    if (field === 'case_details') return editForm?.case_details || extractRes?.extracted_data?.case_details || fallback;
    if (field === 'deadline_date') return editForm?.deadline_date || extractRes?.extracted_data?.deadline_date || fallback;
    if (field === 'priority') return extractRes?.extracted_data?.priority || fallback;
    if (field === 'department') return editForm?.department || extractRes?.extracted_data?.department || fallback;
    if (field === 'action_steps') return actionRes?.plan?.steps || [];
    return fallback;
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col page-transition font-sans">
      <Navbar 
        isSidebarOpen={isSidebarOpen} 
        setIsSidebarOpen={setIsSidebarOpen}
        title={t('common.dashboard')}
        subtitle="Decision Intelligence"
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
              <div key={c.document_id} onClick={() => handleSelectCase(c.document_id)} className={`group p-4 rounded-lg border-2 transition-all duration-200 cursor-pointer ${docId === c.document_id ? 'bg-primary/5 border-primary shadow-sm' : 'bg-card border-transparent hover:bg-muted/50 hover:border-border'}`}>
                <div className="flex justify-between items-start mb-2">
                  <div className="text-sm font-bold truncate pr-2 group-hover:text-primary transition-colors" title={c.file_name}>{c.file_name}</div>
                  <div className={`text-[10px] px-2 py-0.5 rounded font-bold border uppercase ${c.status === 'approved' ? 'bg-success/10 text-success border-success/20' : 'bg-muted text-muted-foreground border-border'}`}>{t(`status.${c.status.toLowerCase()}`)}</div>
                </div>
                <div className="flex justify-between items-center">
                  <div className="text-xs font-medium text-muted-foreground flex items-center gap-1 truncate max-w-[150px]"><Building2 size={12} />{c.department}</div>
                  <PriorityBadge priority={c.priority} />
                </div>
              </div>
            ))}
          </div>
        </aside>

        {isSidebarOpen && <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-30 md:hidden animate-in" onClick={() => setIsSidebarOpen(false)} />}

        <main className="flex-1 p-6 space-y-8 overflow-y-auto h-[calc(100vh-4rem)] custom-scrollbar min-w-0">
          {globalError && (
            <div className="bg-destructive/10 border border-destructive/20 text-destructive p-4 rounded-lg flex items-center justify-between shadow-sm animate-in">
              <div className="flex items-center gap-3"><AlertTriangle size={18} /><span className="text-sm font-semibold">{globalError}</span></div>
              <button onClick={() => setGlobalError(null)} className="p-1 hover:bg-destructive/20 rounded transition-colors"><XCircle size={18} /></button>
            </div>
          )}

          <div className="grid lg:grid-cols-12 gap-6 items-start">
            <div className="lg:col-span-4 space-y-6">
              <div className="card-premium relative overflow-hidden group">
                <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent z-0" />
                <div className="relative z-10">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">1</div>
                    <h2 className="text-lg font-bold">{t('cases.ingest')}</h2>
                  </div>

                  <div className="border-2 border-dashed border-border hover:border-primary transition-colors rounded-lg p-8 text-center bg-muted/30 mb-4 group-hover:bg-muted/50">
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
            </div>

            <div className="lg:col-span-8 h-full">
              {extractRes && extractRes.extracted_data ? (
                <div className="card-premium h-full flex flex-col justify-between">
                  <div>
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between mb-8 gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 text-primary mb-2">
                          <AlertTriangle size={18} />
                          <span className="text-[10px] font-bold uppercase tracking-widest">{t('cases.actionRequired')}</span>
                        </div>
                        <h2 className="text-2xl font-bold tracking-tight leading-tight line-clamp-3">
                          {getVal('action_required', "Awaiting Analysis")}
                        </h2>
                      </div>
                      <div className="shrink-0">
                        <PriorityBadge priority={getVal('priority', 'Medium')} />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                      <div className="bg-muted/30 border border-border rounded-lg p-4">
                        <div className="text-muted-foreground text-[10px] font-bold uppercase tracking-wider mb-2 flex items-center gap-1.5"><Calendar size={14} /> {t('cases.orderDate')}</div>
                        <div className="font-semibold truncate">{extractRes?.extracted_data?.date_of_order || "—"}</div>
                      </div>
                      <div className="bg-muted/30 border border-border rounded-lg p-4">
                        <div className="text-muted-foreground text-[10px] font-bold uppercase tracking-wider mb-2 flex items-center gap-1.5"><Clock size={14} /> {t('cases.timeline')}</div>
                        <div className="font-semibold truncate" title={getVal('timeline')}>{getVal('timeline', "—")}</div>
                      </div>
                      <div className="bg-muted/30 border border-border rounded-lg p-4">
                        <div className="text-muted-foreground text-[10px] font-bold uppercase tracking-wider mb-2 flex items-center gap-1.5"><AlertTriangle size={14} /> {t('cases.deadline')}</div>
                        <div className="font-bold text-primary">{getVal('deadline_date', "Not Specified")}</div>
                      </div>
                      <div className="bg-muted/30 border border-border rounded-lg p-4">
                        <div className="text-muted-foreground text-[10px] font-bold uppercase tracking-wider mb-2 flex items-center gap-1.5"><Building2 size={14} /> {t('cases.department')}</div>
                        <div className="font-semibold truncate" title={getVal('department')}>{getVal('department', "—")}</div>
                      </div>
                    </div>
                  </div>

                  <div className="bg-muted/30 rounded-lg p-6 border border-border mt-auto">
                    <div className="flex items-center justify-between cursor-pointer select-none group" onClick={() => setDirectivesExpanded(!directivesExpanded)}>
                      <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground group-hover:text-foreground transition-colors">{t('cases.directives')}</h3>
                      <button className="text-muted-foreground group-hover:text-foreground transition-colors p-1 bg-card rounded border border-border">
                        {directivesExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                      </button>
                    </div>

                    <div className={`transition-all duration-300 ease-in-out overflow-hidden ${directivesExpanded ? 'max-h-[500px] mt-4 opacity-100' : 'max-h-[80px] mt-3 opacity-60'}`}>
                      <ul className="space-y-2">
                        {getVal('directives', []).map((d, i) => (
                          <li key={i} className="flex gap-3 text-sm leading-relaxed text-muted-foreground">
                            <span className="text-primary mt-0.5 shrink-0 font-bold">•</span>
                            <span className={directivesExpanded ? 'text-foreground' : 'line-clamp-1'}>{d}</span>
                          </li>
                        ))}
                        {getVal('directives', []).length === 0 && (
                          <li className="text-sm text-muted-foreground italic">{t('cases.noDirectives')}</li>
                        )}
                      </ul>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="h-full min-h-[400px] border-2 border-dashed border-border rounded-lg flex flex-col items-center justify-center text-muted-foreground p-8 text-center bg-card">
                  <ShieldAlert size={48} className="mb-4 opacity-10" />
                  <p className="text-lg font-bold">{t('cases.waitingForDocument')}</p>
                  <p className="text-sm mt-2 max-w-md">{t('cases.waitingDesc')}</p>
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
