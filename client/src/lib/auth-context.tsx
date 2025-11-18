import { createContext, useContext, useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "./queryClient";

export type Me = {
  id: string;
  name: string;
  email: string;
  role: "user" | "admin";
};

type AuthContextType = {
  me: Me | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const refresh = async () => {
    try {
      // Skip request if no session cookie to avoid 401 noise
      const hasSid = typeof document !== "undefined" && document.cookie.includes("sid=");
      if (!hasSid) {
        setMe(null);
        return;
      }
      const res = await fetch("/api/auth/me", { credentials: "include" });
      if (!res.ok) {
        setMe(null);
      } else {
        setMe(await res.json());
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const login = async (email: string, password: string) => {
    try {
      const res = await apiRequest("POST", "/api/auth/login", { email, password });
      const data = await res.json();
      setMe(data);
      toast({ title: "Login successful", description: `Welcome back, ${data.name}` });
    } catch (e: any) {
      // Parse error message for friendly feedback
      let title = "Login failed";
      let description = e?.message || "An error occurred";
      try {
        const [statusPart, bodyPart] = String(e?.message || "").split(":", 2);
        const statusCode = parseInt(statusPart.trim(), 10);
        let serverMsg = "";
        if (bodyPart) {
          const trimmed = bodyPart.trim();
          if (trimmed.startsWith("{")) {
            const parsed = JSON.parse(trimmed);
            serverMsg = parsed?.message || "";
          } else {
            serverMsg = trimmed;
          }
        }

        if (statusCode === 404) {
          title = "Account not found";
          description = "Hey this account is not found, let’s register";
        } else if (statusCode === 401) {
          title = "Incorrect password";
          description = "Hey password is incorrect, try again";
        } else if (serverMsg) {
          description = serverMsg;
        }
      } catch {}
      toast({ title, description, variant: "destructive" });
      throw e;
    }
  };

  const register = async (name: string, email: string, password: string) => {
    try {
      const res = await apiRequest("POST", "/api/auth/register", { name, email, password });
      const data = await res.json();
      setMe(data);
      toast({ title: "Registration successful", description: `Account created for ${data.name}` });
    } catch (e: any) {
      toast({ title: "Registration failed", description: e.message, variant: "destructive" });
      throw e;
    }
  };

  const logout = async () => {
    try {
      await apiRequest("POST", "/api/auth/logout");
      setMe(null);
      toast({ title: "Logged out", description: "You have been signed out." });
      // Navigate back to Home after logout
      setLocation("/");
    } catch (e: any) {
      toast({ title: "Logout failed", description: e.message, variant: "destructive" });
      throw e;
    }
  };

  return (
    <AuthContext.Provider value={{ me, loading, login, register, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
