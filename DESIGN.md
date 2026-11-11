# Portfolio design

The established identity is specified in `C:/Users/benta/.codex/skills/my-portfolio-design/SKILL.md` and implemented in `tailwind.config.js`.

## Scene and color

A hiring manager scans this portfolio on a laptop in a normally lit office, moving between candidate profiles. Warm light paper, clear ink text, and generous spacing support that reading context. Use the existing restrained strategy: bg #e8e6e1, bg-card #dedad4, bg-hover #d4d0c8, ink #1a1a18, ink-muted #6b6960, ink-faint #9b9890, accent #c8b89a. Faint text is decorative only; readable metadata uses ink-muted.

## Type

Readability update: secondary and tertiary text use existing ink at 72% and 70% opacity, respectively. The original muted/faint hex colors were below 4.5:1 for small text on the paper panels. This preserves the palette while improving contrast.

Preserve Geist for prose and light display headings; JetBrains Mono for short labels. Headings use negative tracking, labels positive tracking. Body copy stays below 65ch. Display size is fluid, body at least 14px, labels and metadata at least 12px. Wrapped labels use `text-wrap: balance`.

Every link and button is at least 44px tall and wide to tap. Where the visible element is smaller (a text link, a footer link), padding with a matching negative margin gives it the target without moving the layout.

## Layout and components

Use a 1280px container with 24px mobile and 48px desktop insets. Give the first project a distinct featured composition; use project rows for remaining work. Preserve rounded 3D project marks and the About globe. Use semantic links, pill actions, quiet full borders, and no drop shadows. Keep core project evidence as real HTML alongside decorative WebGL.

## Motion

Use the existing cubic-bezier(0.32,0.72,0,1) easing at 500–700ms. Honor reduced-motion settings in CSS and decorative animation. Never hide essential content until an animation runs.
