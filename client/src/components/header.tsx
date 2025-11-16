import { Link, useLocation } from "wouter";
import { ShoppingBag, Search, Menu, X, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "./theme-toggle";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useCart } from "@/lib/cart-context";
import { useAuth } from "@/lib/auth-context";
import { Input } from "@/components/ui/input";
import { AuthModal } from "@/components/modals/auth-modal";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useQuery } from "@tanstack/react-query";

export function Header() {
  const [location, setLocation] = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const { totalItems, toggleCart } = useCart();
  const { me, logout } = useAuth();
  const [authOpen, setAuthOpen] = useState(false);
  const recent = useRecentSearches(8);
  const isAuthRoute = location.startsWith("/login") || location.startsWith("/register");

  // If navigating to explicit auth pages, ensure modal is closed and disable profile button
  useEffect(() => {
    if (isAuthRoute && authOpen) setAuthOpen(false);
  }, [isAuthRoute, authOpen]);

  const navLinks = [
    { path: "/", label: "Home" },
    { path: "/products", label: "Products" },
  ];

  const onSubmitSearch = (e: FormEvent) => {
    e.preventDefault();
    const q = searchQuery.trim();
    if (q.length === 0) return;
    recent.add(q);
    setSearchOpen(false);
    setLocation(`/products?q=${encodeURIComponent(q)}`);
  };

  // Close search on Escape, clear query if empty
  useEffect(() => {
    if (!searchOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSearchOpen(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [searchOpen]);

  return (
    <>
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto flex h-16 items-center justify-between px-4 lg:px-8 lg:grid lg:grid-cols-[1fr_auto_1fr]">
        {/* Logo */}
        <Link href="/" data-testid="link-home" className="justify-self-start">
          <h1
            aria-hidden={searchOpen}
            className={`font-serif text-xl font-semibold tracking-tight lg:text-2xl cursor-pointer hover-elevate px-3 py-2 rounded-md transition-all duration-200 ${
              searchOpen ? "opacity-0 scale-95 pointer-events-none" : ""
            }`}
          >
            Lumière
          </h1>
        </Link>

        {/* Desktop Navigation */}
        <nav className={`hidden lg:flex items-center gap-1 justify-self-center transition-all duration-200 ${searchOpen ? "opacity-0 scale-95 pointer-events-none" : "opacity-100 scale-100"}`}>
          {navLinks.map((link) => (
            <Link key={link.path} href={link.path}>
              <Button
                variant="ghost"
                data-testid={`link-${link.label.toLowerCase().replace(/\s+/g, '-')}`}
                className={`font-medium text-sm ${
                  location === link.path ? "text-foreground" : "text-muted-foreground"
                }`}
              >
                {link.label}
              </Button>
            </Link>
          ))}
        </nav>

        {/* Right side icons (mobile: Search + Cart + Menu; desktop adds Theme/Profile) */}
        <div className={`flex items-center gap-1 sm:gap-2 lg:justify-self-end transition-all duration-200 ${searchOpen ? "opacity-0 scale-95 pointer-events-none" : "opacity-100 scale-100"}`}>
          {!searchOpen && (
            <Button
              variant="ghost"
              size="icon"
              data-testid="button-search"
              className="rounded-full"
              onClick={() => setSearchOpen(true)}
            >
              <Search className="h-5 w-5" />
              <span className="sr-only">Search</span>
            </Button>
          )}

          {/* Cart Icon (always visible) */}
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleCart}
            data-testid="button-cart"
            className="rounded-full"
          >
            <span className="relative inline-flex">
              <ShoppingBag className="h-5 w-5" />
              {totalItems > 0 && (
                <span
                  data-testid="badge-cart-count"
                  className="absolute top-0 right-0 translate-x-1/3 -translate-y-1/3 min-w-[14px] h-[14px] rounded-full bg-primary text-primary-foreground px-[2px] text-[9px] leading-none flex items-center justify-center shadow-sm"
                >
                  {totalItems}
                </span>
              )}
            </span>
            <span className="sr-only">Shopping cart</span>
          </Button>

          {/* Desktop-only: Theme + Cart + Profile */}
          <div className="hidden lg:flex items-center gap-2">
            <ThemeToggle />

            {/* Profile / Auth */}
            {!me ? (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => { if (!isAuthRoute) setAuthOpen(true); }}
                aria-label="Login"
                className="rounded-full"
                disabled={isAuthRoute}
              >
                <User className="h-5 w-5" />
              </Button>
            ) : (
              <DropdownMenu.Root>
                <DropdownMenu.Trigger asChild>
                  <Button variant="ghost" size="icon" aria-label="Profile" className="rounded-full">
                    <User className="h-5 w-5" />
                  </Button>
                </DropdownMenu.Trigger>
                <DropdownMenu.Content sideOffset={8} className="min-w-[200px] rounded-md border bg-popover p-2 shadow-md focus:outline-none">
                  <div className="px-2 py-1.5 text-xs text-muted-foreground">{me.email}</div>
                  <DropdownMenu.Item asChild>
                    <Link href="/dashboard" className="focus:outline-none focus:ring-2 focus:ring-ring block px-2 py-1 rounded hover:bg-muted text-sm cursor-pointer">Account</Link>
                  </DropdownMenu.Item>
                  {me.role === "admin" && (
                    <DropdownMenu.Item asChild>
                      <Link href="/admin" className="focus:outline-none focus:ring-2 focus:ring-ring block px-2 py-1 rounded hover:bg-muted text-sm cursor-pointer">Admin Dashboard</Link>
                    </DropdownMenu.Item>
                  )}
                  <DropdownMenu.Separator className="my-1 h-px bg-border" />
                  <DropdownMenu.Item asChild>
                    <button
                      onClick={logout}
                      className="w-full text-left px-2 py-1 rounded hover:bg-destructive/15 text-sm focus:outline-none focus:ring-2 focus:ring-destructive"
                    >
                      Logout
                    </button>
                  </DropdownMenu.Item>
                </DropdownMenu.Content>
              </DropdownMenu.Root>
            )}
          </div>

          {/* (Cart moved into main icon cluster above) */}

          {/* Mobile Menu */}
          <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
            <SheetTrigger asChild className="lg:hidden">
              <Button variant="ghost" size="icon" data-testid="button-menu" className="rounded-full">
                <Menu className="h-5 w-5" />
                <span className="sr-only">Menu</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-72">
              <nav className="flex flex-col gap-4 mt-8">
                {navLinks.map((link) => (
                  <Link key={link.path} href={link.path}>
                    <Button
                      variant="ghost"
                      onClick={() => setMobileMenuOpen(false)}
                      data-testid={`mobile-link-${link.label.toLowerCase().replace(/\s+/g, '-')}`}
                      className={`w-full justify-start font-medium ${
                        location === link.path ? "text-foreground" : "text-muted-foreground"
                      }`}
                    >
                      {link.label}
                    </Button>
                  </Link>
                ))}

                {/* Theme toggle, styled like nav items */}
                <ThemeToggle asListItem />
              </nav>

              <div className="mt-6 space-y-3">
                {/* Mobile Profile / Auth */}
                {!me ? (
                  <Button
                    className="w-full"
                    onClick={() => {
                      setMobileMenuOpen(false);
                      const current = window.location.pathname + window.location.search;
                      setLocation(`/login?returnTo=${encodeURIComponent(current)}`);
                    }}
                  >
                    Sign in / Register
                  </Button>
                ) : (
                  <div className="space-y-2">
                    <div className="text-xs text-muted-foreground px-1">{me.email}</div>
                    <Link href="/dashboard">
                      <Button variant="ghost" className="w-full justify-start" onClick={() => setMobileMenuOpen(false)}>Account</Button>
                    </Link>
                    {me.role === "admin" && (
                      <Link href="/admin">
                        <Button variant="ghost" className="w-full justify-start" onClick={() => setMobileMenuOpen(false)}>Admin Dashboard</Button>
                      </Link>
                    )}
                    <Button
                      variant="destructive"
                      className="w-full"
                      onClick={() => { setMobileMenuOpen(false); logout(); }}
                    >
                      Logout
                    </Button>
                  </div>
                )}
              </div>
            </SheetContent>
          </Sheet>
        </div>

        {/* Auth Modal */}
        <AuthModal open={authOpen} onOpenChange={setAuthOpen} />
      </div>

      {/* Expanded Search Bar */}
      {searchOpen && (
        <div className="absolute inset-x-0 top-0 z-50">
          <div className="container mx-auto px-4 lg:px-8">
            <form onSubmit={onSubmitSearch} className="relative w-full h-16 flex items-center gap-2 animate-in fade-in zoom-in-95 duration-200">
              <Search className="absolute left-3 h-5 w-5 text-muted-foreground" />
              <Input
                autoFocus
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search products..."
                data-testid="input-search"
                className="pl-10 h-10 rounded-xl bg-muted/30 border border-border text-base"
              />
              <Button type="button" variant="ghost" size="icon" onClick={() => setSearchOpen(false)} aria-label="Close search" className="rounded-full">
                <X className="h-5 w-5" />
              </Button>
            </form>

            <SearchSuggestions
              open={searchOpen}
              query={searchQuery}
              onPick={(id) => {
                setSearchOpen(false);
                setLocation(`/product/${id}`);
              }}
              onSeeAll={(q) => {
                setSearchOpen(false);
                setLocation(`/products?q=${encodeURIComponent(q)}`);
              }}
              onNavigate={(path) => {
                setSearchOpen(false);
                setLocation(path);
              }}
              onRemember={(q) => recent.add(q)}
              recentItems={recent.items}
              onClearRecent={() => recent.clear()}
            />
          </div>
        </div>
      )}
    </header>
      {/* Backdrop */}
      {searchOpen && (
        <div
          className="fixed inset-0 z-40 bg-background/60 backdrop-blur-md animate-in fade-in duration-150"
          onClick={() => setSearchOpen(false)}
        />
      )}
    </>
  );
}

type Suggestion = {
  id: string;
  name: string;
  imageUrl: string;
  price: number;
  category: string;
  material: string;
};

function SearchSuggestions({ open, query, onPick, onSeeAll, onNavigate, onRemember, recentItems, onClearRecent }: {
  open: boolean;
  query: string;
  onPick: (id: string) => void;
  onSeeAll: (q: string) => void;
  onNavigate: (path: string) => void;
  onRemember: (q: string) => void;
  recentItems: string[];
  onClearRecent: () => void;
}) {
  const debounced = useDebounced(query, 250);
  const enabled = open && debounced.trim().length > 0;
  const { data, isLoading } = useQuery<Suggestion[]>({
    queryKey: ["/api/search", debounced],
    queryFn: async () => {
      const res = await fetch(`/api/search?q=${encodeURIComponent(debounced)}`);
      if (!res.ok) throw new Error("Search failed");
      return res.json();
    },
    enabled,
  });

  const results = data ?? [];
  const [activeIdx, setActiveIdx] = useState<number>(-1); // -1: none, [0..n-1]: items, n: See all

  const formatter = useMemo(() => new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
  }), []);

  // Reset active index when results or query change
  useEffect(() => {
    setActiveIdx(-1);
  }, [debounced, results.length]);

  // Keyboard navigation
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIdx((idx) => Math.min(idx + 1, results.length));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIdx((idx) => Math.max(idx - 1, -1));
      } else if (e.key === "Enter") {
        if (activeIdx >= 0 && activeIdx < results.length) {
          onPick(results[activeIdx].id);
        } else if (debounced.trim().length > 0) {
          onSeeAll(debounced);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled, activeIdx, results, debounced, onPick, onSeeAll]);

  const highlight = (text: string, q: string) => {
    const t = text;
    const s = q.trim();
    if (!s) return t;
    try {
      const re = new RegExp(`(${s.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")})`, "ig");
      const parts = t.split(re);
      return parts.map((part, i) =>
        re.test(part) ? (
          <mark key={i} className="bg-transparent text-foreground font-semibold">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        )
      );
    } catch {
      return t;
    }
  };
  if (!open) return null;

  return (
    <div className="relative">
      {(
        // Always render the container; choose content based on query state
        true
      ) && (
        <div className="absolute left-0 right-0 mt-2 rounded-xl border bg-popover shadow-lg overflow-hidden">
          {enabled ? (
            isLoading ? (
              <div className="p-4 text-sm text-muted-foreground">Searching...</div>
            ) : results.length === 0 ? (
              <div className="p-4 text-sm text-muted-foreground">No results</div>
            ) : (
              <ul className="max-h-[60vh] overflow-auto divide-y" role="listbox" aria-label="Search suggestions">
                {results.map((p, i) => (
                  <li
                    key={p.id}
                    className={`p-3 cursor-pointer ${activeIdx === i ? "bg-muted/60" : "hover:bg-muted/40"}`}
                    onMouseEnter={() => setActiveIdx(i)}
                    onMouseLeave={() => setActiveIdx(-1)}
                    onClick={() => onPick(p.id)}
                    role="option"
                    aria-selected={activeIdx === i}
                  >
                    <div className="flex items-center gap-3">
                      <img src={p.imageUrl} alt={p.name} className="w-12 h-12 object-contain rounded bg-accent" />
                      <div className="min-w-0">
                        <div className="font-medium truncate">{highlight(p.name, debounced)}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          {highlight(p.category, debounced)} • {highlight(p.material, debounced)}
                        </div>
                      </div>
                      <div className="ml-auto text-sm font-serif font-semibold whitespace-nowrap">{formatter.format(p.price / 100)}</div>
                    </div>
                  </li>
                ))}
                <li
                  className={`p-3 ${activeIdx === results.length ? "bg-muted/60" : "hover:bg-muted/40"}`}
                  onMouseEnter={() => setActiveIdx(results.length)}
                  onMouseLeave={() => setActiveIdx(-1)}
                >
                  <Button
                    variant="ghost"
                    className="w-full"
                    onClick={() => {
                      onRemember(query);
                      onSeeAll(query);
                    }}
                  >
                    See all results for "{query.trim()}"
                  </Button>
                </li>
              </ul>
            )
          ) : (
            <div className="p-3">
              <div className="px-2 py-2">
                <div className="text-xs font-medium text-muted-foreground mb-2">Quick categories</div>
                <div className="flex flex-wrap gap-2">
                  {[
                    { label: "Rings", value: "rings" },
                    { label: "Necklaces", value: "necklaces" },
                    { label: "Bracelets", value: "bracelets" },
                    { label: "Earrings", value: "earrings" },
                  ].map((c) => (
                    <Button key={c.value} variant="secondary" size="sm" onClick={() => onNavigate(`/products/category/${c.value}`)}>
                      {c.label}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="px-2 py-2 border-t">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-xs font-medium text-muted-foreground">Recent searches</div>
                  {recentItems.length > 0 && (
                    <Button variant="ghost" size="sm" onClick={onClearRecent} className="h-7 px-2">
                      Clear
                    </Button>
                  )}
                </div>
                {recentItems.length === 0 ? (
                  <div className="text-xs text-muted-foreground px-1 py-2">No recent searches</div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {recentItems.map((term, i) => (
                      <Button
                        key={`${term}-${i}`}
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          onRemember(term);
                          onSeeAll(term);
                        }}
                      >
                        {term}
                      </Button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function useDebounced(value: string, delay: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}

function useRecentSearches(max: number = 8) {
  const key = "recent-searches";
  const read = (): string[] => {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return [];
      const arr = JSON.parse(raw) as string[];
      if (!Array.isArray(arr)) return [];
      return arr;
    } catch {
      return [];
    }
  };
  const [items, setItems] = useState<string[]>(read);

  const write = (arr: string[]) => {
    setItems(arr);
    try {
      localStorage.setItem(key, JSON.stringify(arr));
    } catch {}
  };

  const add = (term: string) => {
    const t = term.trim();
    if (!t) return;
    const lower = t.toLowerCase();
    const deduped = [t, ...items.filter((x) => x.toLowerCase() !== lower)].slice(0, max);
    write(deduped);
  };

  const clear = () => write([]);

  return { items, add, clear };
}
