import { Routes, Route } from "react-router-dom";
import Nav from "./components/Nav";
import Home from "./pages/Home";
import ProjectPage from "./pages/ProjectPage";
import SpotifyRedirect from "./pages/SpotifyRedirect";

export default function App() {
  return (
    <>
      <Nav />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/project/:id" element={<ProjectPage />} />
        <Route path="/spotifycovergenerator" element={<SpotifyRedirect />} />
      </Routes>
    </>
  );
}
