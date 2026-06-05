"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X, Salad } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "Dashboard" },
  { href: "/recipes", label: "Recipes" },
  { href: "/planner", label: "Planner" },
  { href: "/pantry", label: "Pantry" },
  { href: "/grocery", label: "Grocery" },
  { href: "/settings", label: "Settings" },
];

function NavLink({ href, label, onClick }: { href: string; label: string; onClick?: () => void }) {
  const pathname = usePathname();
  // Mark active: exact match for "/", prefix match for others
  const isActive = href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <Link
      href={href}
      onClick={onClick}
      className={cn(
        "text-sm font-medium transition-colors",
        isActive
          ? "text-foreground"
          : "text-muted-foreground hover:text-foreground"
      )}
    >
      {label}
    </Link>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      {/* ── Top nav ───────────────────────────────────────────────────────── */}
      <nav className="sticky top-0 z-40 border-b bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-1.5 text-lg font-bold text-primary">
            <Salad className="size-5" />
            NutriMeal
          </Link>

          {/* Desktop nav */}
          <div className="hidden items-center gap-5 md:flex">
            {NAV.map((n) => (
              <NavLink key={n.href} href={n.href} label={n.label} />
            ))}
          </div>

          {/* Mobile hamburger */}
          <button
            className="flex items-center rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground md:hidden"
            onClick={() => setMobileOpen((v) => !v)}
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
          >
            {mobileOpen ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>

        {/* Mobile dropdown */}
        {mobileOpen && (
          <div className="border-t bg-card px-4 pb-4 md:hidden">
            <div className="flex flex-col gap-1 pt-2">
              {NAV.map((n) => (
                <NavLink
                  key={n.href}
                  href={n.href}
                  label={n.label}
                  onClick={() => setMobileOpen(false)}
                />
              ))}
            </div>
          </div>
        )}
      </nav>

      {/* ── Page content ─────────────────────────────────────────────────── */}
      <main className="mx-auto max-w-6xl px-4 py-6 md:px-6">{children}</main>
    </div>
  );
}
