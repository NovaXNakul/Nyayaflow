import { useState, useEffect } from "react";
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
  MessageSquare,
  ShieldAlert,
  Send,
  Building2,
  Activity
} from "lucide-react";
import {
  askChat,
  extractData,
  fetchDashboard,
  generateAction,
  uploadFile,
  verifyData,
} from "./api";

// ==== Components ==== //

const PriorityBadge = ({ priority }) => {
  const styles = {
    High: "bg-red-500/10 text-red-500 border-red-500/20",
    Medium: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
    Low: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
  };
  const icon = {
    High: <AlertTriangle size={14} />,
    Medium: <Clock size={14} />,
    Low: <CheckCircle2 size={14} />
  };
  
  return (
    <div className={`px-3 py-1.5 rounded-full text-xs font-semibold border flex items-center gap-1.5 ${styles[priority] || "bg-slate-500/10 text-slate-400 border-slate-500/20"}`}>
      {icon[priority]}
      {priority ? priority.toUpperCase() : "UNKNOWN"}
    </div>
  );
};

export default function App() {
  console.log("App Component Init");
  // ==== State ==== //
  const [file, setFile] = useState(null);
  const [docId, setDocId] = useState(null);
  const [extractRes, setExtractRes] = useState(null);
  const [actionRes, setActionRes] = useState(null);
  const [dashboard, setDashboard] = useState(null);
  const [globalError, setGlobalError] = useState(null); 
  
  // Form State
  const [editForm, setEditForm] = useState({});
  const [chatQ, setChatQ] = useState("");
  const [chatHistory, setChatHistory] = useState([]);

  // ==== Loading flags ==== //
  const [loadingUpload, setLoadingUpload] = useState(false);
  const [loadingExtract, setLoadingExtract] = useState(false);
  const [loadingAction, setLoadingAction] = useState(false);
  const [loadingVerify, setLoadingVerify] = useState(false);
  const [loadingDashboard, setLoadingDashboard] = useState(false);
  const [loadingChat, setLoadingChat] = useState(false);

  // Initial dashboard load
  useEffect(() => {
    loadDashboard();
  }, []);

  // Update form when extraction happens
  useEffect(() => {
    console.log("ExtractRes Effect", { hasData: !!extractRes?.extracted_data });
    if (extractRes && extractRes.extracted_data) {
      setEditForm(extractRes.extracted_data || {});
    }
  }, [extractRes]);

  const loadDashboard = async () => {
    setLoadingDashboard(true);
    try {
      const data = await fetchDashboard();
      setDashboard(data);
      setGlobalError(null);
    } catch (e) {
      console.error(e);
      setGlobalError("Failed to connect to backend server. Make sure it is running on port 8000.");
    }
    setLoadingDashboard(false);
  };

  const handleUpload = async () => {
    if (!file) return;
    setLoadingUpload(true);
    setGlobalError(null);
    console.log("Starting upload for file:", file.name);
    try {
      const r = await uploadFile(file);
      console.log("Upload success, document_id:", r.document_id);
      setDocId(r.document_id);
      
      // Auto trigger extraction
      await handleExtract(r.document_id);
    } catch (e) {
      console.error("Upload error:", e);
      setGlobalError("Failed to upload and analyze document. Please check the backend connection.");
    } finally {
      setLoadingUpload(false);
    }
  };

  const handleExtract = async (id = docId) => {
    if (!id) return;
    setLoadingExtract(true);
    setGlobalError(null);
    console.log("Requesting extraction for ID:", id);
    try {
      const r = await extractData(id);
      console.log("Extraction response:", r);
      
      if (!r || !r.extracted_data) {
        throw new Error("Invalid extraction response: missing extracted_data");
      }
      
      setExtractRes(r);
    } catch (e) {
      console.error("Extraction error:", e);
      setGlobalError("Failed to extract insights from the document.");
    } finally {
      setLoadingExtract(false);
    }
  };

  const handleGenerateAction = async () => {
    if (!docId) return;
    setLoadingAction(true);
    setGlobalError(null);
    console.log("Generating action plan for ID:", docId);
    try {
      const r = await generateAction(docId);
      console.log("Action plan response:", r);
      if (!r || !r.plan) {
        throw new Error("Invalid action plan response");
      }
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
    console.log("Verifying document:", docId, "Decision:", decision);
    try {
      await verifyData(docId, decision, decision === 'edit' ? editForm : null);
      console.log("Verification success");
      await loadDashboard();
      
      // Reset flow if approved or rejected
      if (decision !== 'edit') {
        setFile(null);
        setDocId(null);
        setExtractRes(null);
        setActionRes(null);
      }
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
    console.log("Sending chat question:", question);
    try {
      const r = await askChat(docId, question);
      console.log("Chat response:", r);
      if (!r || !r.answer) {
        throw new Error("Invalid chat response");
      }
      setChatHistory(prev => [...prev, { role: 'assistant', content: r.answer }]);
    } catch (err) {
      console.error("Chat error:", err);
      setChatHistory(prev => [...prev, { role: 'assistant', content: "Sorry, I couldn't process that request." }]);
    } finally {
      setLoadingChat(false);
    }
  };

  console.log("App Rendering", { docId, hasExtractRes: !!extractRes, hasDashboard: !!dashboard });
  // ==== Render ==== //
  return (
    <div className="min-h-screen bg-[#020617] text-slate-200 font-sans selection:bg-sky-500/30">
      
      {/* Top Navigation / Header */}
      <nav className="sticky top-0 z-50 bg-slate-900/50 backdrop-blur-xl border-b border-white/5">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-sky-500 flex items-center justify-center text-white shadow-lg shadow-sky-500/20">
              <ShieldAlert size={18} />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white tracking-tight leading-none">Decision Intelligence</h1>
              <p className="text-[10px] text-sky-400 font-medium uppercase tracking-wider mt-0.5">GovOS AI Platform</p>
            </div>
          </div>
          
          <div className="flex items-center gap-4 text-sm font-medium">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-800 border border-slate-700">
              <Activity size={14} className="text-emerald-400" />
              <span className="text-slate-300">System Online</span>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto p-6 space-y-8 pb-20">
        
        {/* Error Banner */}
        {globalError && (
          <div
            className="bg-red-500/10 border border-red-500/30 text-red-400 p-4 rounded-xl flex items-center justify-between"
          >
              <div className="flex items-center gap-3">
                <AlertTriangle size={18} />
                <span className="text-sm font-medium">{globalError}</span>
              </div>
              <button onClick={() => setGlobalError(null)} className="text-red-400/50 hover:text-red-400">
                <XCircle size={18} />
              </button>
            </div>
          )}


        {/* ========================================================= */}
        {/* ROW 1: Document Ingestion & The Decision Engine Card       */}
        {/* ========================================================= */}
        <div className="grid lg:grid-cols-12 gap-6 items-start">
          
          {/* Left Column: Upload */}
          <div className="lg:col-span-4 space-y-6">
            <div 
              className="panel relative overflow-hidden group"
            >
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
                    <span className="text-sm font-medium text-slate-200">
                      {file ? file.name : "Click to browse or drag file"}
                    </span>
                    <span className="text-xs text-slate-500 mt-1">Supports PDF</span>
                  </label>
                </div>

                <button
                  className="w-full btn-primary flex items-center justify-center gap-2 py-3"
                  disabled={!file || loadingUpload || loadingExtract}
                  onClick={handleUpload}
                >
                  {loadingUpload || loadingExtract ? (
                    <><Loader2 size={18} className="animate-spin" /> Processing with AI...</>
                  ) : (
                    <><FileText size={18} /> Analyze Document</>
                  )}
                </button>
                
                {docId && (
                  <div className="mt-4 flex items-center justify-between text-xs text-slate-400 bg-slate-800/50 p-2 rounded-lg border border-slate-700/50">
                    <span>Document ID</span>
                    <span className="font-mono text-sky-400">{docId.substring(0,8)}...</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right Column: The DECISION CARD */}
          <div className="lg:col-span-8">
            {extractRes && extractRes.extracted_data ? (
              <div
                className="panel border-sky-500/20 bg-gradient-to-br from-slate-900 to-slate-900/80 shadow-2xl shadow-sky-900/10"
              >
                    <div className="flex items-start justify-between mb-8">
                      <div>
                        <div className="flex items-center gap-2 text-sky-400 mb-2">
                          <AlertTriangle size={18} />
                          <span className="text-sm font-bold uppercase tracking-wider">Recommended Action</span>
                        </div>
                        <h2 className="text-4xl font-bold text-white tracking-tight leading-tight">
                          {extractRes?.extracted_data?.action_required || "Awaiting Analysis"}
                        </h2>
                      </div>
                      <PriorityBadge priority={extractRes?.extracted_data?.priority} />
                    </div>
  
                    {/* Metrics Grid */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                      <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
                        <div className="text-slate-400 text-xs font-medium mb-1 flex items-center gap-1.5"><Calendar size={12}/> Order Date</div>
                        <div className="font-semibold text-white">{extractRes?.extracted_data?.date_of_order || "—"}</div>
                      </div>
                      <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
                        <div className="text-slate-400 text-xs font-medium mb-1 flex items-center gap-1.5"><Clock size={12}/> Timeline</div>
                        <div className="font-semibold text-white">{extractRes?.extracted_data?.timeline || "—"}</div>
                      </div>
                      <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-16 h-16 bg-red-500/10 rounded-full -mr-8 -mt-8 blur-xl" />
                        <div className="text-red-400 text-xs font-medium mb-1 flex items-center gap-1.5 relative z-10"><AlertTriangle size={12}/> Deadline</div>
                        <div className="font-bold text-white relative z-10">{extractRes?.extracted_data?.deadline_date || "—"}</div>
                      </div>
                      <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
                        <div className="text-slate-400 text-xs font-medium mb-1 flex items-center gap-1.5"><Building2 size={12}/> Department</div>
                        <div className="font-semibold text-white truncate" title={extractRes?.extracted_data?.department}>{extractRes?.extracted_data?.department || "—"}</div>
                      </div>
                    </div>

                  {/* Directives */}
                  <div className="bg-slate-950/50 rounded-xl p-5 border border-slate-800">
                    <h3 className="text-sm font-semibold text-slate-300 mb-3 uppercase tracking-wider">Key Directives</h3>
                    <ul className="space-y-2">
                      {extractRes?.extracted_data?.directives?.map((d, i) => (
                        <li key={i} className="flex gap-3 text-sm text-slate-300 leading-relaxed">
                          <span className="text-sky-500 mt-0.5"><ChevronRight size={16} /></span>
                          {d}
                        </li>
                      ))}
                      {(!extractRes?.extracted_data?.directives || extractRes?.extracted_data?.directives?.length === 0) && (
                        <li className="text-sm text-slate-500 italic">No specific directives extracted.</li>
                      )}
                    </ul>
                  </div>
                </div>
              ) : (
                <div className="h-full min-h-[300px] border-2 border-dashed border-slate-800 rounded-2xl flex flex-col items-center justify-center text-slate-500 p-8 text-center bg-slate-900/20">
                  <ShieldAlert size={48} className="mb-4 opacity-20" />
                  <p className="text-lg font-medium text-slate-400">Waiting for Document</p>
                  <p className="text-sm mt-2 max-w-md">Upload a court decision to see AI-generated insights, recommended actions, and critical deadlines.</p>
                </div>
              )}
          </div>
        </div>

        {/* ========================================================= */}
        {/* ROW 2: Action Plan & Verification                          */}
        {/* ========================================================= */}
        {extractRes && extractRes.extracted_data && (
          <div 
            className="grid lg:grid-cols-2 gap-6 items-start"
          >
              
              {/* Action Plan Generator */}
              <div className="panel flex flex-col h-full">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded bg-slate-800 flex items-center justify-center border border-slate-700 text-sky-400">2</div>
                    <h2 className="text-lg font-semibold text-white">Execution Plan</h2>
                  </div>
                  {!actionRes && (
                    <button
                      className="btn-primary py-1.5 px-3 text-sm flex items-center gap-2"
                      onClick={handleGenerateAction}
                      disabled={loadingAction}
                    >
                      {loadingAction ? <Loader2 size={14} className="animate-spin"/> : <Activity size={14}/>}
                      Generate Plan
                    </button>
                  )}
                </div>

                {actionRes ? (
                  <div className="space-y-4 flex-1">
                    {actionRes.plan?.steps?.map((step, i) => (
                      <div key={i} className="group bg-slate-950/50 border border-slate-800 hover:border-sky-500/30 transition-colors rounded-xl p-4">
                        <div className="flex items-start gap-3">
                          <div className="w-6 h-6 rounded-full bg-slate-800 flex items-center justify-center text-xs font-bold text-slate-400 shrink-0 mt-0.5 group-hover:bg-sky-500/20 group-hover:text-sky-400 transition-colors">
                            {i+1}
                          </div>
                          <div>
                            <h3 className="font-semibold text-white mb-2 leading-tight">{step.step}</h3>
                            <div className="flex flex-wrap gap-3 text-xs text-slate-400">
                              <span className="flex items-center gap-1 bg-slate-900 px-2 py-1 rounded border border-slate-800">
                                <Building2 size={12}/> {step.owner}
                              </span>
                              <span className="flex items-center gap-1 bg-slate-900 px-2 py-1 rounded border border-slate-800">
                                <Calendar size={12}/> Due: {step.due_date}
                              </span>
                            </div>
                            <p className="text-xs text-slate-500 mt-2 bg-slate-900/50 p-2 rounded border border-slate-800/50">
                              <span className="font-medium text-slate-400">Evidence Required:</span> {step.evidence_required}
                            </p>
                          </div>
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

              {/* Verification & Final Review */}
              <div className="panel flex flex-col h-full bg-gradient-to-br from-slate-900 to-slate-950 border-emerald-500/10">
                <div className="flex items-center gap-2 mb-6">
                  <div className="w-6 h-6 rounded bg-slate-800 flex items-center justify-center border border-slate-700 text-emerald-400">3</div>
                  <h2 className="text-lg font-semibold text-white">Final Review</h2>
                </div>

                <div className="flex-1 space-y-4 overflow-y-auto mb-6 pr-2 custom-scrollbar max-h-[400px]">
                  {/* Editable Form generated from JSON */}
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-400 mb-1">Action Required</label>
                      <input 
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-sm text-white focus:border-sky-500 focus:ring-1 focus:ring-sky-500 outline-none transition-all"
                        value={editForm?.action_required || ""}
                        onChange={e => setEditForm({...editForm, action_required: e.target.value})}
                      />
                    </div>
                    
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-400 mb-1">Priority</label>
                        <select 
                          className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-sm text-white focus:border-sky-500 outline-none"
                          value={editForm?.priority || "Medium"}
                          onChange={e => setEditForm({...editForm, priority: e.target.value})}
                        >
                          <option value="High">High</option>
                          <option value="Medium">Medium</option>
                          <option value="Low">Low</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-400 mb-1">Deadline Date</label>
                        <input 
                          type="date"
                          className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-sm text-white focus:border-sky-500 outline-none [color-scheme:dark]"
                          value={editForm?.deadline_date || ""}
                          onChange={e => setEditForm({...editForm, deadline_date: e.target.value})}
                        />
                      </div>
                    </div>
                    
                    <div>
                      <label className="block text-xs font-medium text-slate-400 mb-1">Department</label>
                      <input 
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-sm text-white focus:border-sky-500 outline-none"
                        value={editForm?.department || ""}
                        onChange={e => setEditForm({...editForm, department: e.target.value})}
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-400 mb-1">Case Summary</label>
                      <textarea 
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-sm text-white focus:border-sky-500 outline-none resize-none h-24"
                        value={editForm?.case_details || ""}
                        onChange={e => setEditForm({...editForm, case_details: e.target.value})}
                      />
                    </div>
                  </div>
                </div>

                {/* Big Action Buttons */}
                <div className="grid grid-cols-2 gap-3 mt-auto pt-4 border-t border-slate-800/50">
                  <button
                    className="btn-secondary flex items-center justify-center gap-2 py-3 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/30"
                    disabled={loadingVerify}
                    onClick={() => handleVerify("reject")}
                  >
                    <XCircle size={18} /> Reject
                  </button>
                  <button
                    className="btn-primary bg-emerald-600 hover:bg-emerald-500 shadow-emerald-600/20 flex items-center justify-center gap-2 py-3"
                    disabled={loadingVerify}
                    onClick={() => handleVerify("approve")}
                  >
                    {loadingVerify ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle2 size={18} />}
                    Approve & Save
                  </button>
                </div>
              </div>
            </div>
          )}
      
        {/* ========================================================= */}
        {/* ROW 3: Chatbot & Global Dashboard                          */}
        {/* ========================================================= */}
        <div className="grid lg:grid-cols-12 gap-6 items-start">
          
          {/* Chatbot */}
          <div className="lg:col-span-5 panel flex flex-col h-[500px]">
            <div className="flex items-center gap-2 mb-4 pb-4 border-b border-slate-800">
              <div className="w-8 h-8 rounded-full bg-sky-500/10 flex items-center justify-center text-sky-400">
                <MessageSquare size={16} />
              </div>
              <div>
                <h2 className="font-semibold text-white leading-tight">Legal AI Assistant</h2>
                <p className="text-xs text-slate-400">Ask questions about the uploaded document</p>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto mb-4 space-y-4 pr-2 custom-scrollbar">
              {chatHistory.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-500 text-sm text-center">
                  <MessageSquare size={24} className="mb-2 opacity-20" />
                  <p>Ask about deadlines, penalties,<br/>or specific legal clauses.</p>
                </div>
              ) : (
                chatHistory.map((msg, i) => (
                  <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${
                      msg.role === 'user' 
                        ? 'bg-sky-600 text-white rounded-br-sm' 
                        : 'bg-slate-800 text-slate-200 border border-slate-700 rounded-bl-sm'
                    }`}>
                      {msg.content}
                    </div>
                  </div>
                ))
              )}
              {loadingChat && (
                <div className="flex justify-start">
                  <div className="bg-slate-800 border border-slate-700 rounded-2xl rounded-bl-sm px-4 py-3">
                    <Loader2 size={16} className="animate-spin text-sky-400" />
                  </div>
                </div>
              )}
            </div>

            <form onSubmit={handleChat} className="relative mt-auto">
              <input
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-4 pr-12 py-3 text-sm text-white focus:border-sky-500 outline-none"
                placeholder={docId ? "Ask a question..." : "Upload a document first..."}
                value={chatQ}
                onChange={e => setChatQ(e.target.value)}
                disabled={!docId || loadingChat}
              />
              <button 
                type="submit"
                disabled={!docId || loadingChat || !chatQ.trim()}
                className="absolute right-2 top-2 p-1.5 bg-sky-600 hover:bg-sky-500 text-white rounded-lg transition-colors disabled:opacity-50"
              >
                <Send size={16} />
              </button>
            </form>
          </div>

          {/* Global Dashboard View */}
          <div className="lg:col-span-7 panel h-[500px] flex flex-col">
            <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-800">
              <div>
                <h2 className="font-semibold text-white text-lg">System Dashboard</h2>
                <p className="text-xs text-slate-400">Overview of all approved cases</p>
              </div>
              <button 
                onClick={loadDashboard}
                disabled={loadingDashboard}
                className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors"
              >
                <RefreshCcw size={16} className={loadingDashboard ? "animate-spin" : ""} />
              </button>
            </div>

            {dashboard ? (
              <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-6">
                {/* Top Metrics */}
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
                  {/* Dept Breakdown */}
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

                  {/* Priority Breakdown */}
                  <div>
                    <h3 className="text-sm font-semibold text-slate-300 mb-3">By Priority</h3>
                    <div className="space-y-2">
                      {['High', 'Medium', 'Low'].map(p => {
                        const count = dashboard.priority_breakdown?.[p] || 0;
                        return (
                          <div key={p} className="flex items-center justify-between bg-slate-950 border border-slate-800 px-3 py-2 rounded-lg text-sm">
                            <PriorityBadge priority={p} />
                            <span className="bg-slate-800 text-white font-mono px-2 py-0.5 rounded text-xs">{count}</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center text-slate-500">
                <Loader2 className="animate-spin mr-2" /> Loading Dashboard...
              </div>
            )}
          </div>
        </div>

      </main>
    </div>
  );
}



