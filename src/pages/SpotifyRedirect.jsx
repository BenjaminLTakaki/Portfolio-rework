import { useEffect } from "react";

export default function SpotifyRedirect() {
  useEffect(() => {
    window.location.replace("https://spotify-cover-59is.onrender.com/");
  }, []);

  return (
    <main className="flex h-screen items-center justify-center">
      <p className="font-mono text-[11px] uppercase tracking-widest text-ink-muted">
        Redirecting...
      </p>
    </main>
  );
}
