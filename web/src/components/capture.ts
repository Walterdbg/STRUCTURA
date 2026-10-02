import L from "leaflet";
import { OSM_ATTRIBUTION, arcgisLayer, baseOf, osmLayer } from "./basemap.js";

// 📷 Capture this view (DEC-044): the map as it is on screen - zoomed in on a
// point of interest, its streets and corners - saved as a picture for the
// crew. Google's picture is never saved (Google's terms): when it is on
// screen, the capture is taken from ArcGIS (race maps) or OpenStreetMap.
// The drawn lines and the point icons go on top, with the map's credit.

const LOAD_TIMEOUT_MS = 10_000;

function waitForTiles(layer: L.TileLayer): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      layer.off("load", done);
      resolve();
    };
    const timer = setTimeout(done, LOAD_TIMEOUT_MS);
    layer.on("load", done);
    // Already complete (all tiles cached).
    if (!(layer as unknown as { _loading?: boolean })._loading) setTimeout(done, 300);
  });
}

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image"));
    img.src = src;
  });

const plain = (html: string) => {
  const d = document.createElement("div");
  d.innerHTML = html;
  return (d.textContent ?? "").replace(/\s+/g, " ").trim();
};

export async function captureMap(map: L.Map): Promise<Blob> {
  const info = baseOf(map);
  let temp: L.TileLayer | null = null;
  let source: L.TileLayer | undefined = info?.current;
  let credit = plain(String(source?.options.attribution ?? ""));
  if (!info || info.google) {
    temp = info?.arcgis ? arcgisLayer(info.satellite ? "imagery" : "streets", info.lang) : osmLayer();
    temp.addTo(map);
    await waitForTiles(temp);
    source = temp;
    credit = info?.arcgis ? plain(String(temp.options.attribution ?? "")) : OSM_ATTRIBUTION;
  }
  try {
    const size = map.getSize();
    const box = map.getContainer().getBoundingClientRect();
    const canvas = document.createElement("canvas");
    canvas.width = size.x;
    canvas.height = size.y;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#e9ecef";
    ctx.fillRect(0, 0, size.x, size.y);
    // The map picture, tile by tile, where each sits on screen.
    for (const img of Array.from(source?.getContainer()?.querySelectorAll<HTMLImageElement>("img.leaflet-tile-loaded") ?? [])) {
      const r = img.getBoundingClientRect();
      ctx.drawImage(img, r.left - box.left, r.top - box.top, r.width, r.height);
    }
    // Lines and areas (drawn as SVG by the map).
    const svg = map.getPanes().overlayPane.querySelector("svg");
    if (svg) {
      const r = svg.getBoundingClientRect();
      const copy = svg.cloneNode(true) as SVGSVGElement;
      copy.setAttribute("xmlns", "http://www.w3.org/2000/svg");
      copy.setAttribute("width", String(r.width));
      copy.setAttribute("height", String(r.height));
      const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(copy)], { type: "image/svg+xml" }));
      try {
        ctx.drawImage(await loadImage(url), r.left - box.left, r.top - box.top, r.width, r.height);
      } catch {
        /* the picture is still useful without the lines */
      } finally {
        URL.revokeObjectURL(url);
      }
    }
    // Point icons (emoji) and distance markers.
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const el of Array.from(map.getPanes().markerPane.querySelectorAll<HTMLElement>(".leaflet-marker-icon"))) {
      const text = (el.textContent ?? "").trim();
      if (!text) continue;
      const r = el.getBoundingClientRect();
      const x = r.left - box.left + r.width / 2;
      const y = r.top - box.top + r.height / 2;
      if (x < -20 || y < -20 || x > size.x + 20 || y > size.y + 20) continue;
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.beginPath();
      ctx.arc(x, y, Math.max(r.width, r.height) / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#212529";
      ctx.font = `${Math.round(Math.min(r.height, 28) * 0.7)}px system-ui, "Segoe UI Emoji", "Apple Color Emoji", sans-serif`;
      ctx.fillText(text, x, y + 1);
    }
    // The map's credit and the date, bottom right.
    const note = `${credit} · ${new Date().toISOString().slice(0, 10)}`;
    ctx.font = "11px system-ui, sans-serif";
    ctx.textAlign = "right";
    const w = ctx.measureText(note).width + 10;
    ctx.fillStyle = "rgba(255,255,255,0.8)";
    ctx.fillRect(size.x - w, size.y - 16, w, 16);
    ctx.fillStyle = "#333";
    ctx.fillText(note, size.x - 5, size.y - 8);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("capture"))), "image/jpeg", 0.9));
  } finally {
    temp?.remove();
  }
}

// Photos from a phone are large: kept to 2000 px on the long side, as JPEG.
export async function shrinkPhoto(file: File, maxSide = 2000): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
    if (scale === 1 && file.size < 3 * 1024 * 1024 && /^image\/(jpeg|png|webp)$/.test(file.type)) return file;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("shrink"))), "image/jpeg", 0.85));
  } catch {
    return file;
  }
}
