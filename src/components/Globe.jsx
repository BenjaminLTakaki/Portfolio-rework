import { useState } from "react";
import { Globe3D } from "@/components/ui/3d-globe";

const FLAG = {
  Bangkok: "https://flagcdn.com/w40/th.png",
  Dakar: "https://flagcdn.com/w40/sn.png",
  "New Delhi": "https://flagcdn.com/w40/in.png",
  Tokyo: "https://flagcdn.com/w40/jp.png",
  Eindhoven: "https://flagcdn.com/w40/nl.png",
};

export default function Globe({ places }) {
  const [hovered, setHovered] = useState(null);

  const markers = places.map((p) => ({
    lat: p.lat,
    lng: p.lon,
    src: FLAG[p.name],
    label: p.name,
  }));

  return (
    <div className="flex flex-col lg:flex-row items-center gap-8 lg:gap-16">
      {/* Globe */}
      <div className="w-full max-w-[460px] flex-shrink-0">
        <Globe3D
          markers={markers}
          config={{
            autoRotateSpeed: 0.35,
            showAtmosphere: true,
            atmosphereColor: "#c8b89a",
            atmosphereIntensity: 0.35,
            atmosphereBlur: 3,
            bumpScale: 3,
            ambientIntensity: 0.7,
            pointLightIntensity: 1.4,
            enableZoom: false,
            enablePan: false,
          }}
          className="h-[420px]"
          onMarkerHover={(marker) => setHovered(marker?.label ?? null)}
        />
      </div>

      {/* Place list */}
      <div className="flex-1 w-full lg:max-w-xs">
        <ul>
          {places.map((place, i) => (
            <li key={place.name}>
              <div
                className={`flex items-center justify-between px-4 py-4 transition-colors duration-200 ${
                  hovered === place.name ? "bg-bg-card" : ""
                }`}
              >
                <div className="flex items-center gap-3">
                  <img
                    src={FLAG[place.name]}
                    alt={place.country}
                    className="w-5 h-auto rounded-sm object-cover flex-shrink-0"
                  />
                  <div>
                    <p
                      className={`text-sm font-medium leading-none transition-colors ${
                        hovered === place.name ? "text-ink" : "text-ink/75"
                      }`}
                    >
                      {place.name}
                    </p>
                    <p className="text-[11px] font-mono text-ink-muted mt-0.5">
                      {place.country}
                    </p>
                  </div>
                </div>
                <span className="text-[11px] font-mono text-ink-faint">
                  {place.years}
                </span>
              </div>
              {i < places.length - 1 && (
                <div className="h-px bg-ink/[0.06] mx-4" />
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
