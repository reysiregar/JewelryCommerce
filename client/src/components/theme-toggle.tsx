import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";

type ThemeToggleProps = {
  asListItem?: boolean;
  className?: string;
};

export function ThemeToggle({ asListItem = false, className }: ThemeToggleProps) {
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    const savedTheme = localStorage.getItem("theme") as "light" | "dark" | null;
    const initialTheme = savedTheme || "light";
    setTheme(initialTheme);
    document.documentElement.classList.toggle("dark", initialTheme === "dark");
  }, []);

  const toggleTheme = () => {
    const newTheme = theme === "light" ? "dark" : "light";
    setTheme(newTheme);
    localStorage.setItem("theme", newTheme);
    document.documentElement.classList.toggle("dark", newTheme === "dark");
  };

  return (
    <Button
      variant="ghost"
      size={asListItem ? "default" : "icon"}
      onClick={toggleTheme}
      data-testid="button-theme-toggle"
      className={`${asListItem ? "w-full justify-start" : "rounded-full"} ${className ?? ""}`}
    >
      {theme === "light" ? (
        <Moon className="h-5 w-5" />
      ) : (
        <Sun className="h-5 w-5" />
      )}
      {asListItem ? <span className="ml-2">Theme</span> : <span className="sr-only">Toggle theme</span>}
    </Button>
  );
}
