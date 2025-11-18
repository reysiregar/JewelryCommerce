import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth-context";
import { Link, useLocation } from "wouter";

export default function Register() {
  const { register } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [, setLocation] = useLocation();
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
    await register(name, email, password);
    // Clear form on success
    setName("");
    setEmail("");
    setPassword("");
    setLocation(returnTo || "/dashboard");
  };

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4">
      <div className="w-full max-w-xl border rounded-2xl p-6 bg-card shadow-sm">
        <h1 className="font-serif text-3xl text-center mb-6">Create Account</h1>
        <form className="space-y-4" onSubmit={onSubmit}>
          <div>
            <label className="block text-sm mb-2">Full Name</label>
            <Input placeholder="John Doe" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm mb-2">Email</label>
            <Input type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm mb-2">Password</label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <Button type="submit" className="w-full">Register</Button>
        </form>
        <p className="text-center text-muted-foreground mt-6">
          Already have an account? {" "}
          <Link href={returnTo ? `/login?returnTo=${encodeURIComponent(returnTo)}` : "/login"}>Login</Link>
        </p>
      </div>
    </div>
  );
}
