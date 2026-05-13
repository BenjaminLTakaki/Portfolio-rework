import { Link, useLocation } from "react-router-dom";

export default function Nav() {
  const { pathname } = useLocation();
  const isHome = pathname === "/";

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-bg/80 backdrop-blur-md border-b border-ink/[0.05]">
      <div className="max-w-screen-xl mx-auto px-6 lg:px-12 h-14 flex items-center justify-between">
        <Link
          to="/"
          className="font-mono text-[11px] uppercase tracking-[0.22em] text-ink hover:text-ink-muted transition-colors"
        >
          Benjamin Takaki
        </Link>

        <nav className="flex items-center gap-8">
          <Link
            to="/"
            className={`font-mono text-[11px] uppercase tracking-[0.18em] transition-colors ${
              isHome ? "text-ink" : "text-ink-muted hover:text-ink"
            }`}
          >
            Projects
          </Link>
          <a
            href="/#about"
            className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink-muted hover:text-ink transition-colors"
          >
            About
          </a>
          <a
            href="mailto:bentakaki7@gmail.com"
            className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink-muted hover:text-ink transition-colors"
          >
            Contact
          </a>
        </nav>
      </div>
    </header>
  );
}
