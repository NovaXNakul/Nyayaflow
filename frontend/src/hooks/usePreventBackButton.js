import { useEffect } from "react";

export const usePreventBackButton = (redirectTo = "/login") => {
  useEffect(() => {
    // Prevent back button by pushing a new history entry
    window.history.pushState(null, null, window.location.href);

    const handlePopState = () => {
      // Check if user is still authenticated
      const token = localStorage.getItem("authToken");
      if (!token) {
        // No token, redirect to login
        window.location.href = redirectTo;
      } else {
        // Push again to prevent going back
        window.history.pushState(null, null, window.location.href);
      }
    };

    window.addEventListener("popstate", handlePopState);

    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, [redirectTo]);
};
