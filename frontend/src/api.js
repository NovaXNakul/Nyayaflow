import axios from "axios";

const API_URL = import.meta.env.VITE_API_URL;

const api = axios.create({
  baseURL: API_URL,
  timeout: 180000, // ✅ increased timeout (3 min)
});

// ✅ Attach JWT token automatically
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("authToken");
  if (token) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ✅ Improved error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error("API Error:", error?.message);

    if (error.code === "ECONNABORTED") {
      throw new Error("Request timeout - server took too long to respond");
    }

    if (error.response) {
      throw new Error(
        `Server error: ${error.response.status} - ${error.response.data?.detail || error.response.statusText}`
      );
    }

    if (error.request) {
      throw new Error(
        "Network error - backend not reachable. Make sure the server is running."
      );
    }

    throw error;
  }
);

//
// 🔐 AUTH APIs
//

export const login = async (email, password) => {
  const response = await api.post("/auth/login", { email, password });
  return response.data;
};

export const register = async (name, email, password, role, token = null) => {
  const response = await api.post("/auth/register", {
    name,
    email,
    password,
    role,
    token
  });
  return response.data;
};

export const fetchCurrentUser = async () => {
  const response = await api.get("/auth/me");
  return response.data;
};

export const forgotPassword = async (email) => {
  const response = await api.post("/auth/forgot-password", { email });
  return response.data;
};

export const resetPassword = async (token, new_password) => {
  const response = await api.post("/auth/reset-password", { token, new_password });
  return response.data;
};

//
// 👥 USERS / ADMIN
//

export const fetchUsers = async () => {
  const response = await api.get("/auth/users");
  return response.data;
};

export const sendInvite = async (email, name) => {
  const response = await api.post("/admin/invite", { email, name });
  return response.data;
};

export const validateInvite = async (token) => {
  const response = await api.post("/admin/validate-invite", { token });
  return response.data;
};


//
// 📂 CASE MANAGEMENT
//

export const assignCase = async (document_id, assigned_to) => {
  const response = await api.patch("/cases/assign", {
    document_id,
    assigned_to,
  });
  return response.data;
};

export const fetchCases = async () => {
  const response = await api.get("/cases");
  return response.data;
};

export const fetchCaseDetails = async (id) => {
  const response = await api.get(`/case/${id}`);
  return response.data;
};

//
// 📋 TASK MANAGEMENT
//

export const createTask = async (case_id, assigned_to, status, deadline) => {
  const response = await api.post("/tasks/create", {
    case_id,
    assigned_to,
    status,
    deadline,
  });
  return response.data;
};

export const fetchAllTasks = async () => {
  const response = await api.get("/tasks");
  return response.data;
};

export const fetchMyTasks = async () => {
  const response = await api.get("/tasks/my");
  return response.data;
};

export const updateTaskStatus = async (task_id, status) => {
  const response = await api.patch("/tasks/update-status", {
    task_id,
    status,
  });
  return response.data;
};

//
// 📄 DOCUMENT PROCESSING
//

export const uploadFile = async (file) => {
  const form = new FormData();
  form.append("file", file);

  const response = await api.post("/upload", form);
  return response.data;
};

export const extractData = async (id, language = "English") => {
  console.log("Extract called with document_id:", id);
  const response = await api.post("/extract", { document_id: id, language });
  console.log("Extract response:", response.data);
  return response.data;
};

export const generateAction = async (id, language = "English") => {
  const response = await api.post("/generate-action", { document_id: id, language });
  return response.data;
};

export const verifyData = async (id, decision, payload = null) => {
  const response = await api.post("/verify", {
    document_id: id,
    decision,
    payload,
  });
  return response.data;
};

//
// 📊 DASHBOARD
//

export const fetchDashboard = async () => {
  const response = await api.get("/dashboard");
  return response.data;
};

//
// 🤖 CHAT (RAG)
//

export const askChat = async (id, question, language = "English") => {
  const response = await api.post("/chat", {
    document_id: id,
    question,
    language
  });
  return response.data;
};

export const translateCase = async (id, language) => {
  const response = await api.get(`/translate/${id}`, {
    params: { language },
  });
  return response.data;
};

export const translateFullData = async (caseId, language) => {
  const response = await api.get(`/translate/${caseId}?language=${language.toLowerCase()}`);
  return response.data;
};

//
// 📄 REPORTS & DOWNLOADS
//

export const fetchReportData = async (caseId) => {
  const response = await api.get(`/report/${caseId}`);
  return response.data;
};

export const downloadReport = async (caseId, language = "en") => {
  const response = await api.get(`/download/${caseId}?lang=${language}`, {
    responseType: "blob",
  });
  
  // Create a link element to trigger download
  const url = window.URL.createObjectURL(new Blob([response.data]));
  const link = document.createElement("a");
  link.href = url;
  
  // Try to get filename from content-disposition
  const contentDisposition = response.headers["content-disposition"];
  let fileName = `Report_Case_${caseId}.pdf`;
  if (contentDisposition) {
    const fileNameMatch = contentDisposition.match(/filename="(.+)"/);
    if (fileNameMatch && fileNameMatch.length === 2) {
      fileName = fileNameMatch[1];
    }
  }
  
  link.setAttribute("download", fileName);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
  return true;
};

export const viewOriginalDoc = async (caseId) => {
  const response = await api.get(`/view-doc/${caseId}`, {
    responseType: "blob",
  });
  const url = window.URL.createObjectURL(new Blob([response.data], { type: "application/pdf" }));
  window.open(url, "_blank");
};
