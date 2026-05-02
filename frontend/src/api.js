import axios from "axios";

// Use proxy-friendly base URL - will use relative path when proxy is configured
const getBaseUrl = () => {
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }
  // Default to relative path - Vite proxy will handle it
  return "";
};

const api = axios.create({
  baseURL: getBaseUrl(),
  timeout: 30000,
});

// Add response interceptor for better error handling
api.interceptors.response.use(
  response => response,
  error => {
    console.error("API Error:", error.message);
    if (error.code === "ECONNABORTED") {
      throw new Error("Request timeout - server took too long to respond");
    }
    if (error.response) {
      throw new Error(`Server error: ${error.response.status} - ${error.response.statusText}`);
    }
    if (error.request) {
      throw new Error("Network error - could not reach server. Make sure backend is running on port 8000");
    }
    throw error;
  }
);

export const uploadFile = async (file) => {
  const form = new FormData();
  form.append("file", file);
  const response = await api.post("/upload", form);
  console.log("Upload response:", response.data);
  return response.data;
};

export const extractData = async (id) => {
  console.log("Extract called with document_id:", id);
  const response = await api.post("/extract", { document_id: id });
  console.log("Extract response:", response.data);
  return response.data;
};

export const generateAction = async (id) => {
  const response = await api.post("/generate-action", { document_id: id });
  return response.data;
};

export const verifyData = async (id, decision, payload = null) =>
  (await api.post("/verify", { document_id: id, decision, payload })).data;

export const fetchDashboard = async () => (await api.get("/dashboard")).data;

export const fetchCases = async () => (await api.get("/cases")).data;

export const fetchCaseDetails = async (id) => (await api.get(`/case/${id}`)).data;

export const askChat = async (id, question) => (await api.post("/chat", { document_id: id, question })).data;
