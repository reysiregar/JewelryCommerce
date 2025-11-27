import { Moon, Sun, Monitor } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/lib/theme-context";

type ThemeToggleProps = {
  asListItem?: boolean;
  className?: string;
};

export function ThemeToggle({ asListItem = false, className }: ThemeToggleProps) {
  const { preference, activeTheme, setPreference } = useTheme();

  const cyclePreference = () => {
    const next = preference === "light" ? "dark" : preference === "dark" ? "system" : "light";
    setPreference(next);
  };

  const icon = preference === "system" ? <Monitor className="h-5 w-5" /> : activeTheme === "light" ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />;
  const label = asListItem ? `Theme: ${preference.charAt(0).toUpperCase() + preference.slice(1)}` : "Toggle theme";

  return (
    <Button
      variant="ghost"
      size={asListItem ? "default" : "icon"}
      onClick={cyclePreference}
      data-testid="button-theme-toggle"
      className={`${asListItem ? "w-full justify-start" : "rounded-full"} ${className ?? ""}`}
    >
      {icon}
      {asListItem ? <span className="ml-2">{label}</span> : <span className="sr-only">{label}</span>}
    </Button>
  );
}
