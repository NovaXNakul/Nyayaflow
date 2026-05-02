import axios from "axios";

const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || "http://localhost:8000" });

export const uploadFile = async (file) => {
  const form = new FormData();
  form.append("file", file);
  return (await api.post("/upload", form)).data;
};

export const extractData = async (id) => (await api.post("/extract", { document_id: id })).data;
export const generateAction = async (id) => (await api.post("/generate-action", { document_id: id })).data;
export const verifyData = async (id, decision, payload = null) =>
  (await api.post("/verify", { document_id: id, decision, payload })).data;
export const fetchDashboard = async () => (await api.get("/dashboard")).data;
export const askChat = async (id, question) => (await api.post("/chat", { document_id: id, question })).data;
