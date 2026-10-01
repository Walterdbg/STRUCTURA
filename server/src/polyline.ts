// Google's "encoded polyline" format (precision 5), used by the Routes
// and Elevation APIs. Coordinates in and out are [lng, lat].

export function decodePolyline(encoded: string): [number, number][] {
  const out: [number, number][] = [];
  let i = 0;
  let lat = 0;
  let lng = 0;
  while (i < encoded.length) {
    for (const which of [0, 1] as const) {
      let result = 0;
      let shift = 0;
      let b: number;
      do {
        b = encoded.charCodeAt(i++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      const delta = result & 1 ? ~(result >> 1) : result >> 1;
      if (which === 0) lat += delta;
      else lng += delta;
    }
    out.push([lng / 1e5, lat / 1e5]);
  }
  return out;
}

export function encodePolyline(coords: readonly (readonly number[])[]): string {
  let out = "";
  let prevLat = 0;
  let prevLng = 0;
  const enc = (v: number) => {
    let s = v < 0 ? ~(v << 1) : v << 1;
    let chunk = "";
    while (s >= 0x20) {
      chunk += String.fromCharCode((0x20 | (s & 0x1f)) + 63);
      s >>= 5;
    }
    return chunk + String.fromCharCode(s + 63);
  };
  for (const c of coords) {
    const lat = Math.round(c[1]! * 1e5);
    const lng = Math.round(c[0]! * 1e5);
    out += enc(lat - prevLat) + enc(lng - prevLng);
    prevLat = lat;
    prevLng = lng;
  }
  return out;
}
