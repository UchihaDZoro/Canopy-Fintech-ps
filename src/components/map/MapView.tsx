"use client";
import maplibregl, { type GeoJSONSource, type Map as MLMap } from "maplibre-gl";
import { useEffect, useRef, useState } from "react";
import { fetchJson } from "@/lib/client/api";

export const SG_CENTER: [number, number] = [103.835, 1.335];
const STYLE = "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";

export interface PointFeature {
  id: string;
  lon: number;
  lat: number;
  props: Record<string, string | number | boolean | null>;
}

export interface MapLayerSpec {
  id: string;
  points: PointFeature[];
  /** maplibre circle paint (data-driven expressions allowed) */
  paint: maplibregl.CircleLayerSpecification["paint"];
  /** Optional halo layer for glow */
  halo?: maplibregl.CircleLayerSpecification["paint"];
  label?: { field: string; minzoom?: number; color?: string };
  interactive?: boolean;
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

export function MapView({
  layers,
  onSelect,
  onHover,
  fly,
  className = "",
  pitch = 40,
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
      pitch,
      bearing: -12,
      attributionControl: { compact: true },
      maxBounds: [
        [103.5, 1.15],
        [104.15, 1.52],
      ],
    });
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
    let loaded = false;
    let fellBack = false;
    m.on("load", () => {
      loaded = true;
      setReady(true);
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
          { id: "land", type: "fill", source: "land", paint: { "fill-color": "#f4f1e8" } },
          { id: "land-line", type: "line", source: "land", paint: { "line-color": "#c9c1aa", "line-width": 0.7 } },
        ],
      });
      m.once("style.load", () => {
        bound.current.clear();
        setOffline(true);
        setStyleGen((g) => g + 1);
        setReady(true);
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
    for (const L of layers) {
      const data = toGeo(L.points);
      const src = m.getSource(L.id) as GeoJSONSource | undefined;
      if (src) {
        src.setData(data);
        for (const [k, v] of Object.entries(L.paint ?? {})) m.setPaintProperty(L.id, k as never, v as never);
        if (L.halo) for (const [k, v] of Object.entries(L.halo)) m.setPaintProperty(`${L.id}-halo`, k as never, v as never);
        continue;
      }
      m.addSource(L.id, { type: "geojson", data });
      if (L.halo) m.addLayer({ id: `${L.id}-halo`, type: "circle", source: L.id, paint: L.halo });
      m.addLayer({ id: L.id, type: "circle", source: L.id, paint: L.paint });
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
      if (L.interactive !== false && !bound.current.has(L.id)) {
        bound.current.add(L.id);
        m.on("click", L.id, (e) => {
          const id = e.features?.[0]?.properties?.id;
          if (id) cb.current.onSelect?.(L.id, String(id));
        });
        m.on("mouseenter", L.id, (e) => {
          m.getCanvas().style.cursor = "pointer";
          const id = e.features?.[0]?.properties?.id;
          cb.current.onHover?.(L.id, id ? String(id) : null, e.point);
        });
        m.on("mousemove", L.id, (e) => {
          const id = e.features?.[0]?.properties?.id;
          cb.current.onHover?.(L.id, id ? String(id) : null, e.point);
        });
        m.on("mouseleave", L.id, () => {
          m.getCanvas().style.cursor = "";
          cb.current.onHover?.(L.id, null);
        });
      }
    }
  }, [layers, ready, styleGen, offline]);

  useEffect(() => {
    if (fly && map.current) map.current.flyTo({ center: [fly.lon, fly.lat], zoom: fly.zoom ?? 13.2, speed: 0.9, curve: 1.5, essential: true });
  }, [fly]);

  return (
    <div className={`overflow-hidden ${/\b(absolute|fixed)\b/.test(className) ? "" : "relative"} ${className}`}>
      {/* inline style: maplibre's unlayered CSS sets position:relative and would beat Tailwind's layered utilities */}
      <div ref={el} style={{ position: "absolute", inset: 0 }} data-lenis-prevent />
      {!ready && <div className="skeleton absolute inset-0" />}
      {offline && (
        <div className="mono pointer-events-none absolute bottom-2 left-2 bg-card/90 px-2 py-0.5 text-[10px] text-ink-3">basemap offline · outline from URA Master Plan</div>
      )}
    </div>
  );
}
