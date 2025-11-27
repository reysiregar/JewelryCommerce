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
      const normalizeLoginError = (err: unknown): { title: string; description: string } => {
        const defaultMsg = {
          title: "Login failed",
          description: "Something went wrong. Please try again.",
        };

        const msg = String((err as any)?.message || "");
        const match = msg.match(/^\s*(\d{3})\s*:\s*(.*)$/);
        let status = match ? parseInt(match[1], 10) : NaN;
        let body = match ? match[2]?.trim() : "";
        let serverMessage = "";
        try {
          if (body?.startsWith("{")) {
            const parsed = JSON.parse(body);
            serverMessage = String(parsed?.message || "");
          } else if (body) {
            serverMessage = body;
          }
        } catch {
        }

        if (status === 404 || /account not found/i.test(serverMessage)) {
          return {
            title: "Login failed",
            description: "Account with those credentials does not exist.",
          };
        }
        if (status === 401 || /invalid credentials|incorrect password/i.test(serverMessage)) {
          return {
            title: "Login failed",
            description: "The password is incorrect. Please try again.",
          };
        }
        if (status === 400 || /validation|email|password/i.test(serverMessage)) {
          return {
            title: "Login failed",
            description: "Please enter a valid email and password.",
          };
        }

        if (serverMessage && !/^\d{3}/.test(serverMessage)) {
          return { title: "Login failed", description: serverMessage };
        }

        return defaultMsg;
      };

      const { title, description } = normalizeLoginError(e);
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
      const normalizeRegisterError = (err: unknown): { title: string; description: string } => {
        const defaultMsg = {
          title: "Registration failed",
          description: "Something went wrong. Please try again.",
        };

        const msg = String((err as any)?.message || "");
        const match = msg.match(/^\s*(\d{3})\s*:\s*(.*)$/);
        const status = match ? parseInt(match[1], 10) : NaN;
        const body = match ? match[2]?.trim() : "";
        let serverMessage = "";
        try {
          if (body?.startsWith("{")) {
            const parsed = JSON.parse(body);
            serverMessage = String(parsed?.message || "");
          } else if (body) {
            serverMessage = body;
          }
        } catch {}

        if (/email already registered/i.test(serverMessage)) {
          return {
            title: "Email already registered",
            description: "An account with this email already exists. Try logging in.",
          };
        }
        if (/invalid email/i.test(serverMessage)) {
          return { title: "Invalid details", description: "Please enter a valid email address." };
        }
        if (/password.*(least|minimum).*6/i.test(serverMessage)) {
          return { title: "Invalid password", description: "Password must be at least 6 characters." };
        }
        if (/name is required/i.test(serverMessage)) {
          return { title: "Name required", description: "Please enter your full name." };
        }

        if (status === 400 && serverMessage) {
          return { title: "Registration failed", description: serverMessage };
        }

        return defaultMsg;
      };

      const { title, description } = normalizeRegisterError(e);
      toast({ title, description, variant: "destructive" });
      throw e;
    }
  };

  const logout = async () => {
    try {
      await apiRequest("POST", "/api/auth/logout");
      setMe(null);
      toast({ title: "Logged out", description: "You have been signed out." });
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
