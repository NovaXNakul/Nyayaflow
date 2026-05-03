import React from "react";
import ReactDOM from "react-dom/client";
import RouterApp from "./RouterApp";
import "./styles.css";

// Disable back-forward cache to prevent cached sensitive pages
window.addEventListener("pageshow", (event) => {
  if (event.persisted) {
    window.location.reload();
  }
});

// Prevent page caching and redirect to login if no token on page restore
window.addEventListener("load", () => {
  document.addEventListener("pageshow", (event) => {
    if (event.persisted) {
      const token = localStorage.getItem("authToken");
      if (!token) {
        window.location.href = "/login";
      }
    }
  });
});

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <RouterApp />
  </React.StrictMode>
);
