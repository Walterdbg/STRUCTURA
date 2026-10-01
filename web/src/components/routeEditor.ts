import L from "leaflet";
import { lineLength, positionAt } from "@structura/domain";

// Route drawing segment by segment (Walter, 2026-10-01, like RunningAhead):
// every click adds one piece, made with the tool chosen at that moment:
//   "w" On foot: follows walkable streets and paths (Google, walking)
//   "b" By bike: follows bike-friendly streets (Google, cycling)
//   "d" By car:  follows roads (Google, driving)
//   "l" Draw:    a straight line exactly where you click
// Afterwards the details are added by hand: drag the small handle in the
// middle of a piece (or click the line) to add a point there, drag a point, right-click (or double-click) a point to remove it. Pieces
// touching a changed point are remade with the tool chosen at that moment.
// Undo goes back one step at a time.

export type SegMode = "w" | "b" | "d" | "l";
export interface Segment {
  mode: SegMode;
  coords: number[][]; // from one point to the next, both included
}
export interface RouteShape {
  anchors: number[][];
  segments: Segment[];
}

type Router = (from: number[], to: number[], mode: "walk" | "bike" | "drive") => Promise<number[][]>;
const TRAVEL = { w: "walk", b: "bike", d: "drive" } as const;

export interface EditorOptions {
  color: string;
  route: Router | null; // null: no routing available, every piece is drawn straight
  mode: () => SegMode;
  onChange: (shape: RouteShape) => void;
  onBusy: (busy: boolean) => void;
  onRouteFailed: () => void;
}

const copy = (s: RouteShape): RouteShape => ({
  anchors: s.anchors.map((a) => [...a]),
  segments: s.segments.map((g) => ({ mode: g.mode, coords: g.coords.map((c) => [...c]) })),
});

const r6 = (v: number) => Math.round(v * 1e6) / 1e6;
const pt = (ll: L.LatLng) => [r6(ll.lng), r6(ll.lat)];
const ll = (c: number[]) => [c[1]!, c[0]!] as L.LatLngTuple;

// The whole line: the pieces joined, without repeating the shared points.
export function joinSegments(shape: RouteShape): number[][] {
  if (shape.segments.length === 0) return shape.anchors.slice(0, 1);
  const out: number[][] = [...shape.segments[0]!.coords];
  for (const s of shape.segments.slice(1)) out.push(...s.coords.slice(1));
  return out;
}

// Where each point sits in the joined line (saved with the route, so the
// pieces can be rebuilt later).
export function anchorIndexes(shape: RouteShape): number[] {
  const idx = [0];
  let at = 0;
  for (const s of shape.segments) {
    at += s.coords.length - 1;
    idx.push(at);
  }
  return idx;
}

// Rebuild the pieces of a saved route. Without saved points (older routes,
// GPX files) the line is cut into pieces of about 40 positions, kept exactly
// as they are until someone changes them.
export function shapeFromLine(coords: number[][], anchorIdx?: number[], modes?: string[]): RouteShape {
  let idx = anchorIdx;
  const valid =
    idx && idx.length >= 2 && idx[0] === 0 && idx[idx.length - 1] === coords.length - 1 && idx.every((v, i) => i === 0 || v > idx![i - 1]!);
  if (!valid) {
    const step = Math.max(1, Math.ceil((coords.length - 1) / Math.min(60, Math.max(1, Math.ceil((coords.length - 1) / 40)))));
    idx = [];
    for (let i = 0; i < coords.length - 1; i += step) idx.push(i);
    idx.push(coords.length - 1);
  }
  const segments: Segment[] = [];
  for (let i = 1; i < idx!.length; i++) {
    const m = valid ? modes?.[i - 1] : undefined;
    segments.push({ mode: m === "w" || m === "b" || m === "d" ? m : "l", coords: coords.slice(idx![i - 1]!, idx![i]! + 1) });
  }
  return { anchors: idx!.map((i) => coords[i]!), segments };
}

export class RouteEditor {
  private map: L.Map;
  private opts: EditorOptions;
  private shape: RouteShape = { anchors: [], segments: [] };
  private history: RouteShape[] = [];
  private layer = L.layerGroup();
  private queue: Promise<void> = Promise.resolve();
  private pending = 0;
  private hadDoubleClickZoom = true;

  constructor(map: L.Map, opts: EditorOptions) {
    this.map = map;
    this.opts = opts;
  }

  start(shape?: RouteShape) {
    this.shape = shape ? copy(shape) : { anchors: [], segments: [] };
    this.history = [];
    this.layer.addTo(this.map);
    this.hadDoubleClickZoom = this.map.doubleClickZoom.enabled();
    this.map.doubleClickZoom.disable();
    this.map.on("click", this.onMapClick);
    this.map.getContainer().classList.add("route-editing");
    this.render();
  }

  stop() {
    this.map.off("click", this.onMapClick);
    this.map.removeLayer(this.layer);
    this.layer.clearLayers();
    this.map.getContainer().classList.remove("route-editing");
    if (this.hadDoubleClickZoom) this.map.doubleClickZoom.enable();
  }

  get value(): RouteShape {
    return copy(this.shape);
  }

  get canUndo() {
    return this.history.length > 0;
  }

  undo() {
    this.run(async () => {
      const prev = this.history.pop();
      if (prev) this.shape = prev;
    }, false);
  }

  clear() {
    this.run(async () => {
      this.shape = { anchors: [], segments: [] };
    });
  }

  // Remake every piece with the chosen tool (e.g. "follow the streets" for all).
  remakeAll() {
    this.run(async () => {
      const mode = this.opts.mode();
      for (let i = 0; i < this.shape.segments.length; i++) {
        this.shape.segments[i] = await this.build(this.shape.anchors[i]!, this.shape.anchors[i + 1]!, mode);
      }
    });
  }

  // ------------------------------------------------------------- editing steps

  private onMapClick = (e: L.LeafletMouseEvent) => {
    const p = pt(e.latlng);
    this.run(async () => {
      const s = this.shape;
      if (s.anchors.length === 0) {
        s.anchors.push(p);
        return;
      }
      const seg = await this.build(s.anchors[s.anchors.length - 1]!, p, this.opts.mode());
      s.segments.push(seg);
      s.anchors.push(seg.coords[seg.coords.length - 1]!);
    });
  };

  private insertOn(segIndex: number, p: number[]) {
    this.run(async () => {
      const s = this.shape;
      const mode = this.opts.mode();
      const a = await this.build(s.anchors[segIndex]!, p, mode);
      const b = await this.build(p, s.anchors[segIndex + 1]!, mode);
      s.segments.splice(segIndex, 1, a, b);
      s.anchors.splice(segIndex + 1, 0, p);
    });
  }

  private move(j: number, p: number[]) {
    this.run(async () => {
      const s = this.shape;
      const mode = this.opts.mode();
      s.anchors[j] = p;
      if (j > 0) s.segments[j - 1] = await this.build(s.anchors[j - 1]!, p, mode);
      if (j < s.anchors.length - 1) s.segments[j] = await this.build(p, s.anchors[j + 1]!, mode);
    });
  }

  private removeAt(j: number) {
    this.run(async () => {
      const s = this.shape;
      if (s.anchors.length <= 1) {
        s.anchors = [];
        s.segments = [];
      } else if (j === 0) {
        s.anchors.shift();
        s.segments.shift();
      } else if (j === s.anchors.length - 1) {
        s.anchors.pop();
        s.segments.pop();
      } else {
        const merged = await this.build(s.anchors[j - 1]!, s.anchors[j + 1]!, this.opts.mode());
        s.segments.splice(j - 1, 2, merged);
        s.anchors.splice(j, 1);
      }
    });
  }

  // One piece between two points with the given tool. If the street route
  // can't be found, the piece is drawn straight and the person is told.
  private async build(from: number[], to: number[], mode: SegMode): Promise<Segment> {
    const f = [from[0]!, from[1]!];
    const t = [to[0]!, to[1]!];
    if (mode !== "l" && this.opts.route) {
      try {
        const coords = await this.opts.route(f, t, TRAVEL[mode]);
        if (coords.length >= 2) {
          // Keep the clicked points as the piece's ends, so pieces stay joined.
          return { mode, coords: [f, ...coords.slice(1, -1), t] };
        }
      } catch {
        /* fall through */
      }
      this.opts.onRouteFailed();
    }
    return { mode: "l", coords: [f, t] };
  }

  // Steps run one after another (a street piece waits for Google), each one
  // undoable. The screen is redrawn after each step.
  private run(step: () => Promise<void>, remember = true) {
    const before = copy(this.shape);
    this.pending++;
    this.opts.onBusy(true);
    this.queue = this.queue
      .then(async () => {
        await step();
        if (remember) {
          this.history.push(before);
          if (this.history.length > 100) this.history.shift();
        }
      })
      .catch(() => {
        this.shape = before;
      })
      .finally(() => {
        this.pending--;
        if (this.pending === 0) this.opts.onBusy(false);
        this.render();
        this.opts.onChange(copy(this.shape));
      });
  }

  // ------------------------------------------------------------- drawing

  private render() {
    this.layer.clearLayers();
    const s = this.shape;
    s.segments.forEach((seg, i) => {
      const line = L.polyline(seg.coords.map(ll), {
        color: this.opts.color,
        weight: 6,
        opacity: 0.9,
        dashArray: seg.mode === "l" ? "2 8" : undefined,
        bubblingMouseEvents: false,
      });
      line.on("click", (e: L.LeafletMouseEvent) => {
        L.DomEvent.stop(e);
        // The new point goes where the line was clicked; drag it from there.
        this.insertOn(i, pt(e.latlng));
      });
      line.addTo(this.layer);
      // Handle in the middle of the piece: drag it to bend the line there.
      if (lineLength(seg.coords) > 2) {
        const mid = positionAt(seg.coords, lineLength(seg.coords) / 2);
        const h = L.marker(ll(mid), {
          draggable: true,
          icon: L.divIcon({ className: "route-mid", iconSize: [12, 12], iconAnchor: [6, 6] }),
          bubblingMouseEvents: false,
          keyboard: false,
        });
        h.on("click", (e: L.LeafletMouseEvent) => {
          L.DomEvent.stop(e);
          this.insertOn(i, pt(h.getLatLng()));
        });
        h.on("dragend", () => this.insertOn(i, pt(h.getLatLng())));
        h.addTo(this.layer);
      }
    });
    s.anchors.forEach((a, j) => {
      const end = j === 0 ? "start" : j === s.anchors.length - 1 ? "end" : "";
      const m = L.marker(ll(a), {
        draggable: true,
        icon: L.divIcon({ className: `route-anchor ${end}`, iconSize: [14, 14], iconAnchor: [7, 7] }),
        bubblingMouseEvents: false,
        keyboard: false,
      });
      m.on("click", (e: L.LeafletMouseEvent) => L.DomEvent.stop(e));
      m.on("dragend", () => this.move(j, pt(m.getLatLng())));
      m.on("contextmenu", (e: L.LeafletMouseEvent) => {
        L.DomEvent.stop(e);
        this.removeAt(j);
      });
      m.on("dblclick", (e: L.LeafletMouseEvent) => {
        L.DomEvent.stop(e);
        this.removeAt(j);
      });
      m.addTo(this.layer);
    });
  }
}
