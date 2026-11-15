"use client";
import { Canvas, useFrame, type ThreeEvent } from "@react-three/fiber";
import { ContactShadows, Html, OrbitControls } from "@react-three/drei";
import { useMemo, useRef, useState } from "react";
import * as THREE from "three";

export interface IslandArea {
  name: string;
  region: string;
  center: [number, number];
  rings: [number, number][][];
  value: number; // drives height + colour (0..1 normalised inside)
  label?: string;
}
export interface IslandPin {
  id: string;
  name: string;
  lat: number;
  lon: number;
  weight?: number;
  state?: "paid" | "watch" | "clear";
}

const LON0 = 103.82;
const LAT0 = 1.352;
const K = 42;
const COS = Math.cos((LAT0 * Math.PI) / 180);
export const project = (lon: number, lat: number): [number, number] => [(lon - LON0) * K * COS, (lat - LAT0) * K];

// Paper-model palette: low risk = pale sage card, high risk = marigold → kiln
const LOW = new THREE.Color("#dfe5d3");
const MID = new THREE.Color("#a9c9a4");
const HIGH = new THREE.Color("#e9a100");
function ramp(t: number) {
  const c = new THREE.Color();
  return t < 0.5 ? c.lerpColors(LOW, MID, t * 2) : c.lerpColors(MID, HIGH, (t - 0.5) * 2);
}

function Area({
  area,
  t,
  hovered,
  onHover,
  heightScale,
}: {
  area: IslandArea;
  t: number;
  hovered: boolean;
  onHover: (a: IslandArea | null, p?: THREE.Vector3) => void;
  heightScale: number;
}) {
  const geom = useMemo(() => {
    const shapes = area.rings.map((ring) => {
      const s = new THREE.Shape();
      ring.forEach(([lon, lat], i) => {
        const [x, y] = project(lon, lat);
        if (i === 0) s.moveTo(x, y);
        else s.lineTo(x, y);
      });
      return s;
    });
    const g = new THREE.ExtrudeGeometry(shapes, { depth: 1, bevelEnabled: false });
    return g;
  }, [area.rings]);
  const edges = useMemo(() => new THREE.EdgesGeometry(geom, 30), [geom]);
  const mesh = useRef<THREE.Group>(null);
  const target = 0.06 + t * heightScale;
  const color = useMemo(() => ramp(t), [t]);

  useFrame((_, dt) => {
    if (!mesh.current) return;
    const s = mesh.current.scale;
    s.z += (target * (hovered ? 1.25 : 1) - s.z) * Math.min(1, dt * 4);
  });

  return (
    <group ref={mesh} scale={[1, 1, 0.001]}>
      <mesh
        geometry={geom}
        onPointerOver={(e: ThreeEvent<PointerEvent>) => {
          e.stopPropagation();
          onHover(area, e.point);
        }}
        onPointerOut={() => onHover(null)}
      >
        <meshStandardMaterial
          color={color}
          emissive={hovered ? "#e9a100" : "#000000"}
          emissiveIntensity={hovered ? 0.35 : 0}
          roughness={0.92}
          metalness={0}
          flatShading
        />
      </mesh>
      <lineSegments geometry={edges}>
        <lineBasicMaterial color="#16150f" transparent opacity={hovered ? 0.9 : 0.45} />
      </lineSegments>
    </group>
  );
}

function Rain({ intensity, bounds }: { intensity: number; bounds: { w: number; h: number } }) {
  const COUNT = 2200;
  const ref = useRef<THREE.LineSegments>(null);
  const { positions, speeds } = useMemo(() => {
    const p = new Float32Array(COUNT * 6);
    const s = new Float32Array(COUNT);
    for (let i = 0; i < COUNT; i++) {
      const x = (Math.random() - 0.5) * bounds.w * 1.3;
      const y = (Math.random() - 0.5) * bounds.h * 1.4;
      const z = Math.random() * 9;
      p.set([x, y, z, x + 0.02, y - 0.01, z + 0.35], i * 6);
      s[i] = 4 + Math.random() * 5;
    }
    return { positions: p, speeds: s };
  }, [bounds.w, bounds.h]);
  useFrame((_, dt) => {
    const line = ref.current;
    if (!line) return;
    const pos = line.geometry.attributes.position as THREE.BufferAttribute;
    const arr = pos.array as Float32Array;
    const visible = Math.floor(COUNT * intensity);
    for (let i = 0; i < COUNT; i++) {
      const k = i * 6;
      if (i >= visible) {
        arr[k + 2] = arr[k + 5] = -50;
        continue;
      }
      if (arr[k + 2] < -10) arr[k + 2] = Math.random() * 9;
      const dz = speeds[i] * dt;
      arr[k + 2] -= dz;
      if (arr[k + 2] < 0) arr[k + 2] = 9;
      arr[k + 5] = arr[k + 2] + 0.35;
    }
    pos.needsUpdate = true;
  });
  return (
    <lineSegments ref={ref} frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <lineBasicMaterial color="#1d5fd1" transparent opacity={0.55} />
    </lineSegments>
  );
}

function Pins({ pins, z }: { pins: IslandPin[]; z: (p: IslandPin) => number }) {
  const group = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (!group.current) return;
    const t = clock.getElapsedTime();
    group.current.children.forEach((c, i) => {
      const p = pins[i];
      const pulse = p?.state === "paid" ? 1 + Math.sin(t * 4 + i) * 0.35 : 1 + Math.sin(t * 1.6 + i) * 0.12;
      c.scale.setScalar(pulse);
    });
  });
  return (
    <group ref={group}>
      {pins.map((p) => {
        const [x, y] = project(p.lon, p.lat);
        const color = p.state === "paid" ? "#e9a100" : p.state === "watch" ? "#d2480f" : "#16150f";
        return (
          <mesh key={p.id} position={[x, y, z(p) + 0.12]}>
            <sphereGeometry args={[0.07 + (p.weight ?? 0) * 0.08, 14, 14]} />
            <meshBasicMaterial color={color} toneMapped={false} />
          </mesh>
        );
      })}
    </group>
  );
}

function Scene({
  areas,
  pins,
  rain,
  heightScale,
  autoRotate,
  format,
  offsetX,
}: {
  areas: IslandArea[];
  pins: IslandPin[];
  rain: number;
  heightScale: number;
  autoRotate: boolean;
  format?: (a: IslandArea) => string;
  offsetX: number;
}) {
  const [hover, setHover] = useState<{ a: IslandArea; p: THREE.Vector3 } | null>(null);
  const [min, max] = useMemo(() => {
    const v = areas.map((a) => a.value);
    return [Math.min(...v), Math.max(...v)];
  }, [areas]);
  const norm = (v: number) => (max > min ? (v - min) / (max - min) : 0.5);
  const areaByPin = useMemo(() => {
    // pin height = height of the area it sits in (nearest centre)
    return (p: IslandPin) => {
      let best = areas[0];
      let bd = Infinity;
      for (const a of areas) {
        const d = (a.center[0] - p.lon) ** 2 + (a.center[1] - p.lat) ** 2;
        if (d < bd) {
          bd = d;
          best = a;
        }
      }
      return best ? 0.06 + norm(best.value) * heightScale : 0.1;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [areas, heightScale, min, max]);

  return (
    <>
      <ambientLight intensity={0.85} color="#fff8ea" />
      <hemisphereLight args={["#fffaf0", "#cfc8b4", 0.6]} />
      <directionalLight position={[-8, 14, 10]} intensity={1.6} color="#fff4dc" />
      <directionalLight position={[10, 6, -6]} intensity={0.35} color="#dde6ff" />
      <group rotation={[-Math.PI / 2.35, 0, 0]} position={[offsetX, -1.2, 0]}>
        {/* sea plane with subtle grid */}
        <mesh position={[0, 0, -0.02]}>
          <planeGeometry args={[60, 40]} />
          <meshStandardMaterial color="#e6e0cf" roughness={1} transparent opacity={0} />
        </mesh>
        <gridHelper args={[40, 40, "#c9c1aa", "#d8d1bd"]} rotation={[Math.PI / 2, 0, 0]} position={[0, 0, -0.01]} />
        {areas.map((a) => (
          <Area
            key={a.name}
            area={a}
            t={norm(a.value)}
            heightScale={heightScale}
            hovered={hover?.a.name === a.name}
            onHover={(ar, p) => setHover(ar && p ? { a: ar, p } : null)}
          />
        ))}
        <Pins pins={pins} z={areaByPin} />
        {rain > 0 && <Rain intensity={rain} bounds={{ w: 20, h: 12 }} />}
      </group>
      {hover && (
        <Html position={hover.p} style={{ pointerEvents: "none" }} zIndexRange={[20, 0]}>
          <div className="-translate-x-1/2 -translate-y-[130%] whitespace-nowrap border-2 border-ink bg-card px-3 py-2 text-xs shadow-[3px_3px_0_var(--ink)]">
            <div className="font-semibold capitalize text-ink">{hover.a.name.toLowerCase()}</div>
            <div className="mono text-ink-2">{format ? format(hover.a) : hover.a.value}</div>
          </div>
        </Html>
      )}
      <OrbitControls
        enablePan={false}
        enableDamping
        dampingFactor={0.08}
        autoRotate={autoRotate && !hover}
        autoRotateSpeed={0.35}
        minDistance={9}
        maxDistance={34}
        minPolarAngle={0.3}
        maxPolarAngle={1.35}
        enableZoom={false}
      />
      <ContactShadows position={[0, -1.25, 0]} opacity={0.35} scale={30} blur={2.6} far={6} color="#3a352a" />
    </>
  );
}

export default function Island({
  areas,
  pins = [],
  rain = 0.5,
  heightScale = 2.2,
  autoRotate = true,
  format,
  className = "",
  offsetX = 0,
  distance = 15,
}: {
  areas: IslandArea[];
  pins?: IslandPin[];
  rain?: number;
  heightScale?: number;
  autoRotate?: boolean;
  format?: (a: IslandArea) => string;
  className?: string;
  offsetX?: number;
  distance?: number;
}) {
  return (
    <div className={className}>
      <Canvas camera={{ position: [0, distance * 0.45, distance], fov: 40 }} dpr={[1, 1.5]} gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}>
        <Scene areas={areas} pins={pins} rain={rain} heightScale={heightScale} autoRotate={autoRotate} format={format} offsetX={offsetX} />
      </Canvas>
    </div>
  );
}
