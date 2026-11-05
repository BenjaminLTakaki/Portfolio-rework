import { Link, useLocation } from "react-router-dom";

export default function Nav() {
  const { pathname, hash } = useLocation();
  return (
    <header className="site-nav">
      <a className="skip-link" href="#main-content">Skip to content</a>
      <div className="page-container nav-inner">
        <Link to="/" className="nav-name" aria-label="Benjamin Takaki, home"><span className="nav-fullname">Benjamin Takaki</span><span className="nav-monogram" aria-hidden="true">BT.</span></Link>
        <nav aria-label="Main navigation">
          <Link to="/#work" aria-current={hash === "#work" || pathname.startsWith("/project/") ? "location" : undefined}>Work</Link>
          <Link to="/#about" aria-current={hash === "#about" ? "location" : undefined}>About</Link>
          <Link to="/#contact" aria-current={hash === "#contact" ? "location" : undefined}>Let’s talk <span aria-hidden="true">↗</span></Link>
        </nav>
      </div>
    </header>
  );
}
