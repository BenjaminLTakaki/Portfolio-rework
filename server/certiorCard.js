// The share card, drawn on the server for the daily Instagram post: the same drawCard() the app uses, on a Skia canvas
// (@napi-rs/canvas, no native build) with Inter bundled, since the server has none of the phone's system fonts.
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createCanvas, GlobalFonts, loadImage } from "@napi-rs/canvas";

import { drawCard } from "../public/certior/card.js";

const here = path.dirname(fileURLToPath(import.meta.url));
GlobalFonts.registerFromPath(path.join(here, "fonts", "InterVariable.ttf"), "Inter");
const ICON = path.join(here, "..", "public", "certior", "icons", "icon-192.png");

/** The card as a JPEG (Instagram takes JPEG only), 1080 x 1350. */
export async function renderCard(story, clipId, now = new Date()) {
  const canvas = await drawCard(story, clipId, {
    canvas: (w, h) => createCanvas(w, h),
    loadImage: (src) => loadImage(src).catch(() => null),
    icon: ICON,
    now: () => now,
  });
  return canvas.encode("jpeg", 92);
}
