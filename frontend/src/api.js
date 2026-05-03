import axios from "axios";

// ✅ Base URL FIX (handles env + fallback)
const getBaseUrl = () => {
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }
  return "http://localhost:8000";
};

const api = axios.create({
  baseURL: getBaseUrl(),
  timeout: 30000,
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
        "Network error - backend not reachable. Make sure server is running on http://127.0.0.1:8000"
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

export const register = async (username, email, password, role) => {
  const response = await api.post("/auth/register", {
    username,
    email,
    password,
    role,
  });
  return response.data;
};

export const fetchCurrentUser = async () => {
  const response = await api.get("/auth/me");
  return response.data;
};

//
// 👥 USERS / ADMIN
//

export const fetchUsers = async () => {
  const response = await api.get("/users");
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

export const extractData = async (id) => {
  const response = await api.post("/extract", { document_id: id });
  return response.data;
};

export const generateAction = async (id) => {
  const response = await api.post("/generate-action", {
    document_id: id,
  });
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

export const askChat = async (id, question) => {
  const response = await api.post("/chat", {
    document_id: id,
    question,
  });
  return response.data;
};