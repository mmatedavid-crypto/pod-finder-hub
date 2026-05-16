import { useLocation } from "react-router-dom";
import { LayoutGrid } from "lucide-react";
import { BrandMark } from "./Brand";
import { NavLink } from "react-router-dom";
import { ThemeToggle } from "./ThemeToggle";

export function SiteHeader() {
  const isHome = useLocation().pathname === "/";

  const linkCls = ({ isActive }: { isActive: boolean }) =>
    `relative text-sm transition-colors ${
      isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground"
    } after:content-[''] after:absolute after:left-0 after:-bottom-1 after:h-px after:bg-primary after:transition-all ${
      isActive ? "after:w-full" : "after:w-0 hover:after:w-full"
    }`;

  return (
    <header className="border-b border-border/70 bg-background/80 backdrop-blur-xl sticky top-0 z-30 supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto flex items-center gap-3 sm:gap-6 py-2 sm:py-3">
        <BrandMark />
        <nav className="hidden sm:flex items-center gap-6 ml-2 pl-6 border-l border-border/50">
          <NavLink to="/daily" className={linkCls}>Daily Brief</NavLink>
          <span aria-hidden className="h-4 w-px bg-border/50" />
          <NavLink to="/topics" className={linkCls}>Topics</NavLink>
          <span aria-hidden className="h-4 w-px bg-border/50" />
          <NavLink to="/people" className={linkCls}>People</NavLink>
          <span aria-hidden className="h-4 w-px bg-border/50" />
          <NavLink to="/categories" className={linkCls}>Categories</NavLink>
        </nav>
        {isHome && (
          <div className="ml-auto sm:hidden flex items-center gap-2.5 text-sm font-medium">
            <NavLink
              to="/topics"
              className={({ isActive }) =>
                `transition-colors ${isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`
              }
            >
              Topics
            </NavLink>
            <span aria-hidden className="h-3 w-px bg-border" />
            <NavLink
              to="/categories"
              className={({ isActive }) =>
                `inline-flex items-center gap-1 transition-colors ${isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`
              }
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              Categories
            </NavLink>
          </div>
        )}
        {/* Header search removed — single search lives on the home page (Ask Podiverzum) and /search. */}
        <div className="ml-auto"><ThemeToggle /></div>
      </div>
    </header>
  );
}
