import { Routes, Route } from "react-router-dom";
import Nav from "./components/Nav";
import Home from "./pages/Home";
import ProjectPage from "./pages/ProjectPage";
import SpotifyRedirect from "./pages/SpotifyRedirect";
import Lol from "./pages/Lol";

export default function App() {
  return (
    <>
      <Nav />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/project/:id" element={<ProjectPage />} />
        <Route path="/spotifycovergenerator" element={<SpotifyRedirect />} />
        <Route path="/lol" element={<Lol />} />
      </Routes>
    </>
  );
}
