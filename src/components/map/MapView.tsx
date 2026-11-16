"use client";
import maplibregl, { type GeoJSONSource, type Map as MLMap } from "maplibre-gl";
import { useEffect, useRef, useState } from "react";
import { fetchJson } from "@/lib/client/api";

export const SG_CENTER: [number, number] = [103.835, 1.335];
const STYLE = "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";
const PITCH_3D = 55;

export interface PointFeature {
  id: string;
  lon: number;
  lat: number;
  props: Record<string, string | number | boolean | null>;
}

type Expr = maplibregl.DataDrivenPropertyValueSpecification<number>;
type ColorExpr = maplibregl.DataDrivenPropertyValueSpecification<maplibregl.ColorSpecification>;

export interface MapLayerSpec {
  id: string;
  points: PointFeature[];
  /** maplibre circle paint (data-driven expressions allowed); drawn flat on the ground as the footprint */
  paint: maplibregl.CircleLayerSpecification["paint"];
  /** Optional halo layer for glow */
  halo?: maplibregl.CircleLayerSpecification["paint"];
  label?: { field: string; minzoom?: number; color?: string };
  interactive?: boolean;
  /**
   * 3D: raise each point as a hexagonal column. `height` is in metres and may be a data-driven
   * expression over the point's props; colour defaults to the circle colour.
   */
  column?: { height: Expr; color?: ColorExpr; radius?: number; opacity?: number };
}

function toGeo(points: PointFeature[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: points.map((p) => ({
      type: "Feature",
      id: p.id,
      geometry: { type: "Point", coordinates: [p.lon, p.lat] },
      properties: { id: p.id, ...p.props },
    })),
  };
}

/** Hexagonal footprints (radius in metres) for fill-extrusion columns */
function toColumns(points: PointFeature[], radius: number): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: points.map((p) => {
      const dLat = radius / 111_320;
      const dLon = radius / (111_320 * Math.cos((p.lat * Math.PI) / 180));
      const ring: [number, number][] = [];
      for (let i = 0; i <= 6; i++) {
        const a = (Math.PI / 3) * (i % 6) + Math.PI / 6;
        ring.push([p.lon + dLon * Math.cos(a), p.lat + dLat * Math.sin(a)]);
      }
      return { type: "Feature", id: p.id, geometry: { type: "Polygon", coordinates: [ring] }, properties: { id: p.id, ...p.props } };
    }),
  };
}

export function MapView({
  layers,
  onSelect,
  onHover,
  fly,
  className = "",
  pitch = PITCH_3D,
  zoom = 10.6,
  polygons,
}: {
  layers: MapLayerSpec[];
  onSelect?: (layer: string, id: string) => void;
  onHover?: (layer: string, id: string | null, point?: { x: number; y: number }) => void;
  fly?: { lon: number; lat: number; zoom?: number } | null;
  className?: string;
  pitch?: number;
  zoom?: number;
  polygons?: { id: string; data: GeoJSON.FeatureCollection; fill: maplibregl.FillLayerSpecification["paint"]; line?: maplibregl.LineLayerSpecification["paint"] }[];
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<MLMap | null>(null);
  const [ready, setReady] = useState(false);
  const [styleGen, setStyleGen] = useState(0); // bumps when the style is swapped, so layers are re-added
  const [offline, setOffline] = useState(false);
  const [is3d, setIs3d] = useState(pitch > 0);
  const bound = useRef(new Set<string>()); // layers whose click/hover handlers are already attached
  const cb = useRef({ onSelect, onHover });
  cb.current = { onSelect, onHover };

  useEffect(() => {
    if (!el.current) return;
    const m = new maplibregl.Map({
      container: el.current,
      style: STYLE,
      center: SG_CENTER,
      zoom,
      pitch: 0,
      bearing: 0,
      maxPitch: 75,
      attributionControl: { compact: true },
      maxBounds: [
        [103.5, 1.15],
        [104.15, 1.52],
      ],
    });
    m.addControl(new maplibregl.NavigationControl({ showCompass: true, visualizePitch: true }), "bottom-right");
    let loaded = false;
    let fellBack = false;
    const atmosphere = () => {
      try {
        m.setSky({ "sky-color": "#f4f1e8", "horizon-color": "#e7e0cc", "fog-color": "#f4f1e8", "sky-horizon-blend": 0.7, "horizon-fog-blend": 0.6, "fog-ground-blend": 0.85 });
      } catch {}
    };
    m.on("load", () => {
      loaded = true;
      atmosphere();
      // Extrude the basemap's building footprints when zoomed into a centre
      try {
        if (m.getSource("carto") && !m.getLayer("buildings-3d")) {
          const firstSymbol = m.getStyle().layers.find((l) => l.type === "symbol")?.id;
          m.addLayer(
            {
              id: "buildings-3d",
              type: "fill-extrusion",
              source: "carto",
              "source-layer": "building",
              minzoom: 13.5,
              paint: {
                "fill-extrusion-color": "#e3dcc8",
                "fill-extrusion-height": ["interpolate", ["linear"], ["zoom"], 13.5, 0, 14.5, ["coalesce", ["get", "render_height"], 12]],
                "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], 0],
                "fill-extrusion-opacity": 0.75,
              },
            },
            firstSymbol
          );
        }
      } catch {}
      setReady(true);
      // Tilt into 3D once the map is drawn — a short establishing shot
      if (pitch > 0) m.easeTo({ pitch, bearing: -17, duration: 1800, essential: true });
    });
    // Fallback: if the hosted basemap can't be reached (or is very slow), draw Singapore
    // from our own URA planning-area outlines so every map keeps working offline-ish.
    const fallback = async () => {
      if (fellBack || loaded) return;
      fellBack = true;
      const meta = await fetchJson<{ areas: { name: string; rings: [number, number][][] }[] }>("/api/meta").catch(() => null);
      const land: GeoJSON.FeatureCollection = {
        type: "FeatureCollection",
        features: (meta?.areas ?? []).map((a) => ({ type: "Feature", properties: { name: a.name }, geometry: { type: "MultiPolygon", coordinates: a.rings.map((r) => [r]) } })),
      };
      m.setStyle({
        version: 8,
        sources: { land: { type: "geojson", data: land } },
        layers: [
          { id: "sea", type: "background", paint: { "background-color": "#dfe6e4" } },
          { id: "land", type: "fill-extrusion", source: "land", paint: { "fill-extrusion-color": "#f4f1e8", "fill-extrusion-height": 40, "fill-extrusion-opacity": 0.95 } },
          { id: "land-line", type: "line", source: "land", paint: { "line-color": "#c9c1aa", "line-width": 0.7 } },
        ],
      });
      m.once("style.load", () => {
        bound.current.clear();
        atmosphere();
        setOffline(true);
        setStyleGen((g) => g + 1);
        setReady(true);
        if (pitch > 0) m.easeTo({ pitch, bearing: -17, duration: 1800 });
      });
    };
    m.on("error", () => {
      if (!loaded) fallback();
    });
    const timer = setTimeout(fallback, 8000);
    map.current = m;
    return () => {
      clearTimeout(timer);
      m.remove();
      map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // polygons (drawn beneath points)
  useEffect(() => {
    const m = map.current;
    if (!m || !ready || !polygons) return;
    for (const p of polygons) {
      const src = m.getSource(p.id) as GeoJSONSource | undefined;
      if (src) src.setData(p.data);
      else {
        m.addSource(p.id, { type: "geojson", data: p.data });
        m.addLayer({ id: `${p.id}-fill`, type: "fill", source: p.id, paint: p.fill });
        if (p.line) m.addLayer({ id: `${p.id}-line`, type: "line", source: p.id, paint: p.line });
      }
      for (const [k, v] of Object.entries(p.fill ?? {})) m.setPaintProperty(`${p.id}-fill`, k as never, v as never);
    }
  }, [polygons, ready, styleGen]);

  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    const bind = (layerId: string, specId: string) => {
      if (bound.current.has(layerId)) return;
      bound.current.add(layerId);
      m.on("click", layerId, (e) => {
        const id = e.features?.[0]?.properties?.id;
        if (id) cb.current.onSelect?.(specId, String(id));
      });
      m.on("mouseenter", layerId, (e) => {
        m.getCanvas().style.cursor = "pointer";
        const id = e.features?.[0]?.properties?.id;
        cb.current.onHover?.(specId, id ? String(id) : null, e.point);
      });
      m.on("mousemove", layerId, (e) => {
        const id = e.features?.[0]?.properties?.id;
        cb.current.onHover?.(specId, id ? String(id) : null, e.point);
      });
      m.on("mouseleave", layerId, () => {
        m.getCanvas().style.cursor = "";
        cb.current.onHover?.(specId, null);
      });
    };
    const columnPaint = (L: MapLayerSpec): maplibregl.FillExtrusionLayerSpecification["paint"] => ({
      "fill-extrusion-color": L.column!.color ?? ((L.paint?.["circle-color"] as ColorExpr) ?? "#16150f"),
      // Shrink columns as you zoom in, so an island-wide skyline doesn't become a wall at street level
      "fill-extrusion-height": ["interpolate", ["linear"], ["zoom"], 10, ["*", L.column!.height, 1], 12, ["*", L.column!.height, 0.5], 14, ["*", L.column!.height, 0.16]] as Expr,
      "fill-extrusion-base": 0,
      "fill-extrusion-opacity": L.column!.opacity ?? 0.88,
      "fill-extrusion-vertical-gradient": true,
    });

    for (const L of layers) {
      const data = toGeo(L.points);
      const colId = `${L.id}-col`;
      const src = m.getSource(L.id) as GeoJSONSource | undefined;
      if (src) {
        src.setData(data);
        for (const [k, v] of Object.entries(L.paint ?? {})) m.setPaintProperty(L.id, k as never, v as never);
        if (L.halo) for (const [k, v] of Object.entries(L.halo)) m.setPaintProperty(`${L.id}-halo`, k as never, v as never);
        if (L.column && m.getLayer(colId)) {
          (m.getSource(colId) as GeoJSONSource).setData(toColumns(L.points, L.column.radius ?? 220));
          for (const [k, v] of Object.entries(columnPaint(L) ?? {})) m.setPaintProperty(colId, k as never, v as never);
        }
        continue;
      }
      m.addSource(L.id, { type: "geojson", data });
      if (L.halo) m.addLayer({ id: `${L.id}-halo`, type: "circle", source: L.id, paint: { "circle-pitch-alignment": "map", ...L.halo } });
      // Footprint discs lie flat on the ground so the 3D tilt reads correctly
      m.addLayer({ id: L.id, type: "circle", source: L.id, paint: { "circle-pitch-alignment": "map", ...L.paint } });
      if (L.column) {
        m.addSource(colId, { type: "geojson", data: toColumns(L.points, L.column.radius ?? 220) });
        m.addLayer({ id: colId, type: "fill-extrusion", source: colId, paint: columnPaint(L) });
      }
      // Labels need hosted glyphs; skip them on the offline fallback style
      if (L.label && !offline)
        m.addLayer({
          id: `${L.id}-label`,
          type: "symbol",
          source: L.id,
          minzoom: L.label.minzoom ?? 12.5,
          layout: { "text-field": ["get", L.label.field], "text-size": 11, "text-offset": [0, 1.2], "text-anchor": "top", "text-font": ["Open Sans Regular"] },
          paint: { "text-color": L.label.color ?? "#16150f", "text-halo-color": "#f4f1e8", "text-halo-width": 1.2 },
        });
      if (L.interactive !== false) {
        bind(L.id, L.id);
        if (L.column) bind(colId, L.id);
      }
    }
    // Columns render above every footprint; labels above everything
    for (const L of layers) if (L.column && m.getLayer(`${L.id}-col`)) m.moveLayer(`${L.id}-col`);
    for (const L of layers) if (m.getLayer(`${L.id}-label`)) m.moveLayer(`${L.id}-label`);
  }, [layers, ready, styleGen, offline]);

  useEffect(() => {
    if (fly && map.current) map.current.flyTo({ center: [fly.lon, fly.lat], zoom: fly.zoom ?? 13.2, speed: 0.9, curve: 1.5, essential: true });
  }, [fly]);

  const toggle3d = () => {
    const m = map.current;
    if (!m) return;
    const next = !is3d;
    setIs3d(next);
    m.easeTo({ pitch: next ? PITCH_3D : 0, bearing: next ? -17 : 0, duration: 900 });
  };

  return (
    <div className={`overflow-hidden ${/\b(absolute|fixed)\b/.test(className) ? "" : "relative"} ${className}`}>
      {/* inline style: maplibre's unlayered CSS sets position:relative and would beat Tailwind's layered utilities */}
      <div ref={el} style={{ position: "absolute", inset: 0 }} data-lenis-prevent />
      {!ready && <div className="skeleton absolute inset-0" />}
      {ready && (
        <button
          type="button"
          onClick={toggle3d}
          aria-pressed={is3d}
          title={is3d ? "Flatten to 2D" : "Tilt to 3D"}
          className="mono absolute bottom-[118px] right-[10px] z-[2] border border-ink/70 bg-card/95 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink shadow-sm transition hover:bg-ink hover:text-paper"
        >
          {is3d ? "3D ▲" : "2D ▢"}
        </button>
      )}
      {offline && (
        <div className="mono pointer-events-none absolute bottom-2 left-2 bg-card/90 px-2 py-0.5 text-[10px] text-ink-3">basemap offline · outline from URA Master Plan</div>
      )}
    </div>
  );
}
