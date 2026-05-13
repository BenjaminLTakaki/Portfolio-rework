export const projects = [
  {
    id: "guitarscribe",
    title: "GuitarScribe",
    category: "Audio ML / Deep Learning",
    year: "2025",
    cover: "/project-images/guitarscribe.png",
    logo: {
      code: "GS",
      motif: "wave",
      mark: "#695f4e",
      wash: "#d8d0c2",
    },
    tags: ["PyTorch", "CNN", "BiGRU", "Audio DSP"],
    stack: ["PyTorch", "librosa", "CNN", "BiGRU", "music21"],
    summary:
      "A transcription engine that turns guitar audio into structured onset and pitch predictions with a CNN plus BiGRU pipeline.",
    concepts: [
      "144-bin log-CQT representation",
      "Dual output heads for onset and pitch",
      "SpecAugment data augmentation",
      "Synthetic data pipeline",
      "GuitarSet dataset",
    ],
    description:
      "Deep learning guitar transcription system trained on GuitarSet. Uses a CNN plus BiGRU architecture with a 144-bin log-CQT spectrogram representation, dual output heads for onset and pitch, SpecAugment regularisation, and a synthetic data pipeline to supplement training data.",
    images: ["/project-images/guitarscribe.png"],
  },
  {
    id: "spotify-cover-generator",
    title: "Spotify Cover Generator",
    category: "Generative AI / Full-Stack",
    year: "2024",
    cover: "/project-images/spotify-cover-generator.png",
    logo: {
      code: "SC",
      motif: "lens",
      mark: "#70604e",
      wash: "#d7cabc",
    },
    tags: ["Stable Diffusion", "Gemini", "Spotify API", "LoRA"],
    stack: ["Flask", "Spotify OAuth", "Gemini 2.5 Flash", "Stable Diffusion", "LoRA"],
    summary:
      "A listening-history pipeline that converts Spotify behavior into personalised generated album covers.",
    concepts: [
      "Spotify listening data analysis",
      "8-module generation architecture",
      "LoRA fine-tuning",
      "Gemini prompt engineering",
      "OAuth 2.0 flow",
    ],
    description:
      "Personalised album-art generator that reads a user's Spotify listening history and produces a matching cover using Gemini 2.5 Flash for prompt synthesis and Stable Diffusion with LoRA for image generation. Built as an 8-module pipeline with OAuth authentication.",
    images: ["/project-images/spotify-cover-generator.png"],
  },
  {
    id: "audio-fingerprinting",
    title: "Audio Fingerprinting",
    category: "Audio DSP / Python",
    year: "2024",
    cover: "/project-images/audio-fingerprinting.png",
    logo: {
      code: "AF",
      motif: "pulse",
      mark: "#4f6570",
      wash: "#cbd8d9",
    },
    tags: ["STFT", "SHA-1", "SQLite", "Python"],
    stack: ["Python", "STFT", "SHA-1", "SQLite", "NumPy"],
    summary:
      "A Shazam-style recogniser built from spectrogram peaks, hash-pair fingerprints, and offset alignment.",
    concepts: [
      "Spectrogram peak picking",
      "SHA-1 hash pair fingerprints",
      "Offset alignment matching",
      "SQLite fingerprint store",
      "Shazam-style recognition",
    ],
    description:
      "Shazam-style audio recognition system built from scratch. The pipeline converts audio to STFT spectrograms, picks local peaks, generates SHA-1 hash pair fingerprints with time offsets, stores them in SQLite, and matches queries via offset histogram alignment.",
    images: ["/project-images/audio-fingerprinting.png"],
  },
  {
    id: "animewatchlist",
    title: "AnimeWatchList",
    category: "Full-Stack / API Integration",
    year: "2024-2025",
    cover: "/project-images/animewatchlist.png",
    logo: {
      code: "AW",
      motif: "grid",
      mark: "#6c5964",
      wash: "#d6cdd2",
    },
    tags: ["Flask", "PostgreSQL", "MyAnimeList API"],
    stack: ["Flask", "PostgreSQL", "SQLAlchemy", "MyAnimeList OAuth", "Python"],
    summary:
      "A tracking product around ratings, watch history, statistics, and MyAnimeList OAuth data import.",
    concepts: [
      "MyAnimeList OAuth flow",
      "User ratings and statistics",
      "Recommendation engine",
      "Statistics dashboard",
      "Full-stack application",
    ],
    description:
      "Full-stack anime tracking platform. Integrates MyAnimeList OAuth for data import, stores ratings and watch history in PostgreSQL, surfaces a statistics dashboard, and generates recommendations based on user history.",
    images: ["/project-images/animewatchlist.png"],
  },
  {
    id: "freelance-portfolios",
    title: "Freelance Portfolios",
    category: "Web Dev / Client Delivery",
    year: "2024-2025",
    cover: "/project-images/freelance-portfolios.png",
    logo: {
      code: "FP",
      motif: "stack",
      mark: "#776b5b",
      wash: "#d9d3c7",
    },
    tags: ["Vue", "REST APIs", "Render", "JavaScript"],
    stack: ["HTML/CSS/JS", "Vue", "REST APIs", "Render", "YouTube API", "Spotify API"],
    summary:
      "Production client sites shipped end to end, including API integrations, admin tooling, and deployment.",
    concepts: [
      "3 production sites delivered",
      "YouTube and Spotify API integrations",
      "Admin panel development",
      "Render deployment",
      "Client-to-production delivery",
    ],
    description:
      "Production portfolio websites built and deployed for three freelance clients: Thibault, Vilgot, and Iurie. Each included API integrations, a custom admin panel, and full deployment on Render, shipped end to end.",
    images: ["/project-images/freelance-portfolios.png"],
  },
];

export const places = [
  {
    name: "Bangkok",
    country: "Thailand",
    years: "Born / 2005",
    lat: 13.7563,
    lon: 100.5018,
  },
  {
    name: "Dakar",
    country: "Senegal",
    years: "7.5 yrs",
    lat: 14.7167,
    lon: -17.4677,
  },
  {
    name: "New Delhi",
    country: "India",
    years: "1.5 yrs",
    lat: 28.6139,
    lon: 77.209,
  },
  {
    name: "Tokyo",
    country: "Japan",
    years: "8 yrs",
    lat: 35.6762,
    lon: 139.6503,
  },
  {
    name: "Eindhoven",
    country: "Netherlands",
    years: "2023 to now",
    lat: 51.4416,
    lon: 5.4697,
  },
];

export const skills = [
  {
    label: "AI / ML",
    items: ["CNN", "BiGRU", "LSTM", "TFT", "NLP", "spaCy", "RAG", "Stable Diffusion", "LLMs"],
  },
  {
    label: "Development",
    items: ["Python", "Flask", "FastAPI", "JavaScript", "Vue", "C#", "Docker"],
  },
  {
    label: "Data Science",
    items: ["Time-Series", "Audio DSP", "STFT / CQT", "Jupyter", "Data Analysis"],
  },
  {
    label: "Cloud & APIs",
    items: ["PostgreSQL", "SQLAlchemy", "REST / OAuth", "Git", "Render", "Heroku"],
  },
  {
    label: "Languages",
    items: ["English C2", "French C2", "Japanese B1", "Dutch A1"],
  },
];
