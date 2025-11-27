import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import PasswordInput from "@/components/ui/password-input";
import { useAuth } from "@/lib/auth-context";
import { Link, useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";

export default function Register() {
  const { register } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const returnTo = useMemo(() => {
    try {
      const v = new URLSearchParams(window.location.search).get("returnTo") || "";
      return v.startsWith("/") ? v : "";
    } catch {
      return "";
    }
  }, []);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const emailOk = /.+@.+\..+/.test(email);
    if (!name.trim() || !emailOk || password.length < 6) {
      toast({
        title: "Invalid details",
        description: !name.trim()
          ? "Please enter your full name."
          : !emailOk
          ? "Please enter a valid email address."
          : "Password must be at least 6 characters.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      await register(name, email, password);
      setName("");
      setEmail("");
      setPassword("");
      setLocation(returnTo || "/dashboard");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4">
      <div className="w-full max-w-xl border rounded-2xl p-6 bg-card shadow-sm">
        <h1 className="font-serif text-3xl text-center mb-6">Create Account</h1>
        <form className="space-y-4" onSubmit={onSubmit}>
          <div>
            <label className="block text-sm mb-2">Full Name</label>
            <Input placeholder="John Doe" value={name} onChange={(e) => setName(e.target.value)} required disabled={loading} />
          </div>
          <div>
            <label className="block text-sm mb-2">Email</label>
            <Input type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required disabled={loading} />
          </div>
          <div>
            <label className="block text-sm mb-2">Password</label>
            <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} disabled={loading} />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? (
              <span className="inline-flex items-center justify-center">
                <svg className="mr-2 h-4 w-4 animate-spin" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
                </svg>
                Creating account...
              </span>
            ) : (
              "Register"
            )}
          </Button>
        </form>
        <p className="text-center text-muted-foreground mt-6">
          Already have an account? {" "}
          <Link href={returnTo ? `/login?returnTo=${encodeURIComponent(returnTo)}` : "/login"}>Login</Link>
        </p>
      </div>
    </div>
  );
}
