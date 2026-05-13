import { Link } from "react-router-dom";
import { BrandMark } from "./Brand";

const EXPLORE = [
  { to: "/categories", label: "Categories" },
  { to: "/search", label: "Search" },
  { to: "/new", label: "New shows" },
  { to: "/methodology", label: "How we rank" },
];

const COMPANY = [
  { to: "/about", label: "About" },
  { to: "/contact", label: "Contact" },
  { to: "/privacy", label: "Privacy" },
  { to: "/terms", label: "Terms" },
];

export function SiteFooter() {
  return (
    <footer className="relative border-t border-border/70 mt-24 bg-gradient-to-b from-transparent to-black/40">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />
      <div className="container mx-auto py-12 sm:py-14 text-sm text-muted-foreground">
        <div className="flex flex-col gap-10 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
          <div className="space-y-3 max-w-sm">
            <BrandMark size={28} />
            <p className="text-xs leading-relaxed text-muted-foreground">
              Episodes. Topics. Ideas.
            </p>
          </div>

          {/* Mobile: 2 grouped columns. sm+: single inline row (legacy look). */}
          <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:hidden">
            <div className="space-y-2">
              <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/60">Explore</div>
              <ul className="space-y-1.5">
                {EXPLORE.map((l) => (
                  <li key={l.to}>
                    <Link to={l.to} className="hover:text-foreground transition-colors">{l.label}</Link>
                  </li>
                ))}
              </ul>
            </div>
            <div className="space-y-2">
              <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/60">Company</div>
              <ul className="space-y-1.5">
                {COMPANY.map((l) => (
                  <li key={l.to}>
                    <Link to={l.to} className="hover:text-foreground transition-colors">{l.label}</Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <nav className="hidden sm:flex sm:flex-wrap gap-x-6 gap-y-2 text-sm">
            {[...EXPLORE, ...COMPANY].map((l) => (
              <Link key={l.to} to={l.to} className="hover:text-foreground transition-colors">{l.label}</Link>
            ))}
          </nav>
        </div>
        <div className="mt-10 pt-6 border-t border-border/70 flex flex-col gap-2 text-xs sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <span>© {new Date().getFullYear()} Podiverzum</span>
          <span className="opacity-70">Indexed from public RSS feeds.</span>
        </div>
      </div>
    </footer>
  );
}
