import * as Dialog from "@radix-ui/react-dialog";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import PasswordInput from "@/components/ui/password-input";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/hooks/use-toast";

export function AuthModal({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const title = mode === "login" ? "Welcome Back" : "Create Account";
  const { toast } = useToast();

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === "register") {
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
    }

    setLoading(true);
    try {
      if (mode === "login") {
        await login(email, password);
      } else {
        await register(name, email, password);
      }
      setName("");
      setEmail("");
      setPassword("");
      onOpenChange(false);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-[2px]" />
        <Dialog.Content className="fixed z-[61] left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[92vw] max-w-xl rounded-2xl border bg-card p-6 shadow-xl focus:outline-none">
          <Dialog.Title className="font-serif text-3xl text-center mb-6">{title}</Dialog.Title>
          <Dialog.Description className="sr-only">
            Login to your account or create a new one to continue shopping.
          </Dialog.Description>
          <form className="space-y-4" onSubmit={onSubmit}>
            {mode === "register" && (
              <div>
                <label className="block text-sm mb-2">Full Name</label>
                <Input placeholder="John Doe" value={name} onChange={(e) => setName(e.target.value)} required disabled={loading} />
              </div>
            )}
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
                  {mode === "login" ? "Logging in..." : "Creating account..."}
                </span>
              ) : (
                mode === "login" ? "Login" : "Register"
              )}
            </Button>
          </form>

          <div className="text-center text-muted-foreground mt-6">
            {mode === "login" ? (
              <button className="underline" onClick={() => setMode("register")}>Don't have an account? Register</button>
            ) : (
              <button className="underline" onClick={() => setMode("login")}>Already have an account? Login</button>
            )}
          </div>

          <Dialog.Close asChild>
            <button aria-label="Close" className="absolute right-3 top-3 rounded-full p-2 hover:bg-muted">✕</button>
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
