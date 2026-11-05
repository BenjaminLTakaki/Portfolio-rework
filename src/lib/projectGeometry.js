// Deterministic geometry keeps decorative scenes stable between visits.
export function randomSequence(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) >>> 0;
    let value = Math.imul(seed ^ (seed >>> 15), seed | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function forecastPaths() {
  return Array.from({ length: 8 }, (_, i) => {
    const angle = i / 8 * Math.PI * 2;
    return [
      [-1.65, Math.cos(angle) * 1.12, Math.sin(angle) * 1.12],
      [-0.6, Math.cos(Math.floor(i / 2) / 4 * Math.PI * 2 + .35) * .72, Math.sin(Math.floor(i / 2) / 4 * Math.PI * 2 + .35) * .72],
      [.5, i < 4 ? .45 : -.45, 0],
      [1.55, 0, 0],
    ];
  });
}

export function harmonicHeight(x, layer, time = 0) {
  const envelope = Math.sin((x + 1.65) / 3.3 * Math.PI) ** 2;
  return envelope * (.32 * Math.sin(x * 4.2 + layer * .36 - time) + .12 * Math.cos(x * 8 - time * .6));
}

export function fingerprintData() {
  const random = randomSequence(31);
  const points = Array.from({ length: 90 }, () => [-1.55 + random() * 3.1, -.7 + random() * 1.4, -.65 + random() * 1.3]).sort((a,b) => a[0] - b[0]);
  const pairs = [];
  points.forEach((point, i) => {
    for (let j = i + 1, found = 0; j < points.length && found < 2; j++) {
      if (points[j][0] - point[0] < .6 && Math.abs(points[j][1] - point[1]) < .45) {
        pairs.push(...point, ...points[j]);
        found++;
      }
    }
  });
  return { points: points.flat(), pairs };
}
