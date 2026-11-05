import { lazy, Suspense, useEffect } from "react";
import { Routes, Route, useLocation, Link } from "react-router-dom";
import Nav from "./components/Nav";
import Home from "./pages/Home";
import ProjectPage from "./pages/ProjectPage";
import SpotifyRedirect from "./pages/SpotifyRedirect";
const Lol = lazy(() => import("./pages/Lol"));
const LolHub = lazy(() => import("./pages/LolHub"));
const Forecaster = lazy(() => import("./pages/Forecaster"));
const SceneCanvas = lazy(() => import("./components/ProjectScene").then((module) => ({ default: module.SceneCanvas })));

export default function App() {
  const { pathname, hash, key } = useLocation();
  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView();
    else window.scrollTo({ top: 0, behavior: "instant" });
  }, [pathname, hash, key]);
  return (
    <>
      <Nav />
      <Suspense fallback={<main id="main-content" className="page-container pt-32" role="status">Loading project…</main>}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/project/:id" element={<ProjectPage />} />
        <Route path="/spotifycovergenerator" element={<SpotifyRedirect />} />
        <Route path="/lol" element={<LolHub />} />
        <Route path="/lol/:player" element={<Lol />} />
        <Route path="/forecaster" element={<Forecaster />} />
        <Route path="*" element={<main id="main-content" className="page-container pt-32"><h1 className="text-4xl font-light tracking-tight">Page not found.</h1><Link className="action mt-8" to="/#work">Explore the projects →</Link></main>} />
      </Routes>
      </Suspense>
      {(pathname === "/" || pathname.startsWith("/project/")) && <Suspense fallback={null}><SceneCanvas /></Suspense>}
    </>
  );
}
