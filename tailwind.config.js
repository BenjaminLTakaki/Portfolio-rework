/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["'Geist'", "'Satoshi'", "'Plus Jakarta Sans'", "system-ui", "sans-serif"],
        mono: ["'JetBrains Mono'", "monospace"],
      },
      colors: {
        bg: "#e8e6e1",
        "bg-card": "#dedad4",
        "bg-hover": "#d4d0c8",
        ink: "#1a1a18",
        // Derive readable secondary text from existing ink on both paper surfaces.
        "ink-muted": "rgb(26 26 24 / 0.72)",
        "ink-faint": "rgb(26 26 24 / 0.70)",
        accent: "#c8b89a",
      },
      aspectRatio: {
        "3/4": "3 / 4",
      },
    },
  },
  plugins: [],
};
