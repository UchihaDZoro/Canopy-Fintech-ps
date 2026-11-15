"use client";
import { Canvas, useFrame } from "@react-three/fiber";
import { ContactShadows, Html, OrbitControls } from "@react-three/drei";
import { useMemo, useRef } from "react";
import * as THREE from "three";

/**
 * A standard rain gauge as a paper-model object: water rises to the wettest-hour reading,
 * ink rings mark the payout levels, drops fall into the funnel while it rains.
 */
const H = 4; // gauge height in scene units

function Water({ level, raining }: { level: number; raining: number }) {
  const ref = useRef<THREE.Mesh>(null);
  const top = useRef<THREE.Mesh>(null);
  const cur = useRef(0.001);
  useFrame(({ clock }, dt) => {
    cur.current += (Math.max(0.001, level) - cur.current) * Math.min(1, dt * 3);
    const h = cur.current * H;
    if (ref.current) {
      ref.current.scale.y = Math.max(0.001, cur.current);
      ref.current.position.y = h / 2;
    }
    if (top.current) {
      top.current.position.y = h + 0.005;
      const wob = raining > 0 ? Math.sin(clock.elapsedTime * 9) * 0.04 * raining : 0;
      top.current.scale.set(1 + wob, 1, 1 - wob);
    }
  });
  return (
    <group>
      <mesh ref={ref}>
        <cylinderGeometry args={[0.62, 0.62, H, 48]} />
        <meshStandardMaterial color="#1d5fd1" transparent opacity={0.82} roughness={0.2} />
      </mesh>
      <mesh ref={top} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.62, 48]} />
        <meshStandardMaterial color="#7ea4e6" transparent opacity={0.95} />
      </mesh>
    </group>
  );
}

function Drops({ intensity }: { intensity: number }) {
  const N = 60;
  const ref = useRef<THREE.InstancedMesh>(null);
  const seeds = useMemo(() => Array.from({ length: N }, () => ({ x: (Math.random() - 0.5) * 2.2, z: (Math.random() - 0.5) * 2.2, y: Math.random() * 4, v: 3 + Math.random() * 3 })), []);
  const m = useMemo(() => new THREE.Matrix4(), []);
  useFrame((_, dt) => {
    const mesh = ref.current;
    if (!mesh) return;
    const visible = Math.floor(N * Math.min(1, intensity));
    seeds.forEach((s, i) => {
      s.y -= s.v * dt;
      if (s.y < 0) s.y = 4;
      const show = i < visible;
      m.makeScale(show ? 1 : 0.0001, show ? 1 : 0.0001, show ? 1 : 0.0001);
      m.setPosition(s.x * 0.45, H + 0.9 + s.y, s.z * 0.45);
      mesh.setMatrixAt(i, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, N]}>
      <capsuleGeometry args={[0.025, 0.18, 2, 6]} />
      <meshStandardMaterial color="#1d5fd1" />
    </instancedMesh>
  );
}

function Scene({ value, max, levels, raining }: { value: number; max: number; levels: { mm: number; label: string; reached: boolean }[]; raining: number }) {
  const grp = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (grp.current) grp.current.rotation.y += dt * 0.12;
  });
  return (
    <>
      <ambientLight intensity={0.9} color="#fff8ea" />
      <directionalLight position={[-4, 8, 6]} intensity={1.5} color="#fff4dc" />
      <directionalLight position={[5, 3, -4]} intensity={0.4} color="#dde6ff" />
      <group ref={grp} position={[0, -2.4, 0]}>
        {/* base */}
        <mesh position={[0, -0.12, 0]}>
          <cylinderGeometry args={[1.05, 1.15, 0.24, 48]} />
          <meshStandardMaterial color="#16150f" roughness={0.7} />
        </mesh>
        {/* glass tube */}
        <mesh position={[0, H / 2, 0]}>
          <cylinderGeometry args={[0.7, 0.7, H, 48, 1, true]} />
          <meshStandardMaterial color="#ffffff" transparent opacity={0.22} roughness={0.05} side={THREE.DoubleSide} />
        </mesh>
        <lineSegments position={[0, H / 2, 0]}>
          <edgesGeometry args={[new THREE.CylinderGeometry(0.7, 0.7, H, 24, 1, true), 1]} />
          <lineBasicMaterial color="#16150f" transparent opacity={0.35} />
        </lineSegments>
        <Water level={Math.min(1, value / max)} raining={raining} />
        {/* funnel */}
        <mesh position={[0, H + 0.45, 0]}>
          <cylinderGeometry args={[1.05, 0.72, 0.9, 48, 1, true]} />
          <meshStandardMaterial color="#ebe6d8" roughness={0.6} side={THREE.DoubleSide} />
        </mesh>
        <mesh position={[0, H + 0.9, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[1.05, 0.04, 8, 48]} />
          <meshStandardMaterial color="#16150f" />
        </mesh>
        {/* scale ticks every 10 mm */}
        {Array.from({ length: Math.floor(max / 10) + 1 }).map((_, i) => (
          <mesh key={i} position={[0.71, (i * 10 * H) / max, 0]}>
            <boxGeometry args={[0.06, 0.012, i % 5 === 0 ? 0.22 : 0.12]} />
            <meshStandardMaterial color="#16150f" />
          </mesh>
        ))}
        {/* payout level rings */}
        {levels.map((l, i) => (
          <group key={i} position={[0, (l.mm * H) / max, 0]}>
            <mesh rotation={[Math.PI / 2, 0, 0]}>
              <torusGeometry args={[0.74, 0.03, 8, 64]} />
              <meshStandardMaterial color={l.reached ? "#e9a100" : "#16150f"} emissive={l.reached ? "#e9a100" : "#000"} emissiveIntensity={l.reached ? 0.5 : 0} />
            </mesh>
            <Html position={[1.15, 0, 0]} center={false} style={{ pointerEvents: "none" }} zIndexRange={[10, 0]}>
              <div
                className="mono whitespace-nowrap border px-1.5 py-0.5 text-[10.5px] font-semibold"
                style={{ background: l.reached ? "#e9a100" : "#fbf9f3", borderColor: "#16150f", color: "#16150f", transform: "translateY(-50%)" }}
              >
                {l.label}
              </div>
            </Html>
          </group>
        ))}
        <Drops intensity={raining} />
      </group>
      <ContactShadows position={[0, -2.55, 0]} opacity={0.35} scale={8} blur={2.4} far={4} color="#3a352a" />
      <OrbitControls enablePan={false} enableZoom={false} minPolarAngle={0.9} maxPolarAngle={1.45} />
    </>
  );
}

export default function RainGauge3D(props: { value: number; max: number; levels: { mm: number; label: string; reached: boolean }[]; raining: number; className?: string }) {
  return (
    <div className={props.className}>
      <Canvas camera={{ position: [0, 1.6, 9.2], fov: 38 }} dpr={[1, 1.5]} gl={{ antialias: true, alpha: true }}>
        <Scene {...props} />
      </Canvas>
    </div>
  );
}
