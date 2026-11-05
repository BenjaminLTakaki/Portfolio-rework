import { Component, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { View } from "@react-three/drei";
import { forecastPaths, harmonicHeight, fingerprintData } from "../lib/projectGeometry";

const PAPER = "#e8e6e1";
const activeViews = new Set();

export class ArtworkBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? this.props.fallback || null : this.props.children; }
}

// One shared, demand-driven context. Only visible, unpaused views keep it running.
function FramePump() {
  const invalidate = useThree((state) => state.invalidate);
  useEffect(() => {
    const wake = () => invalidate();
    window.addEventListener("scroll", wake, { passive: true });
    window.addEventListener("resize", wake);
    document.addEventListener("visibilitychange", wake);
    return () => {
      window.removeEventListener("scroll", wake);
      window.removeEventListener("resize", wake);
      document.removeEventListener("visibilitychange", wake);
    };
  }, [invalidate]);
  useFrame(() => { if (activeViews.size && !document.hidden) invalidate(); }, -10);
  return null;
}

export function SceneCanvas() {
  return <ArtworkBoundary><Canvas
    style={{ position: "fixed", inset: 0, zIndex: 10, pointerEvents: "none" }}
    dpr={[1, 1.5]} frameloop="demand"
    gl={{ antialias: true, alpha: true, powerPreference: "low-power" }}
    camera={{ position: [0, 0, 7], fov: 35 }} fallback={null} aria-hidden="true"
  ><FramePump /><View.Port /></Canvas></ArtworkBoundary>;
}

export function ProjectView({ project, interaction, visible, paused, reduced }) {
  return <View className="absolute inset-0 pointer-events-none" visible={visible}>
    <ProjectScene project={project} interaction={interaction} visible={visible} paused={paused} reduced={reduced} />
  </View>;
}

function Stroke({ points, color, opacity = .7, loop = false, segments = false, ...props }) {
  const geometry = useMemo(() => new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(points, 3)), [points]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const Tag = segments ? "lineSegments" : loop ? "lineLoop" : "line";
  return <Tag geometry={geometry} {...props}><lineBasicMaterial color={color} transparent opacity={opacity} /></Tag>;
}

function Bead({ position, color, size = .055, wire = false }) {
  return <mesh position={position}><icosahedronGeometry args={[size, 1]} /><meshBasicMaterial color={color} wireframe={wire} /></mesh>;
}

function Plate({ width = 1, height = 1, depth = .035, color, ...props }) {
  const edges = useMemo(() => {
    const box = new THREE.BoxGeometry(width, height, depth);
    const geometry = new THREE.EdgesGeometry(box);
    box.dispose();
    return geometry;
  }, [width, height, depth]);
  useEffect(() => () => edges.dispose(), [edges]);
  return <group {...props}>
    <mesh><boxGeometry args={[width, height, depth]} /><meshBasicMaterial color={PAPER} /></mesh>
    <lineSegments geometry={edges}><lineBasicMaterial color={color} transparent opacity={.75} /></lineSegments>
  </group>;
}

const PATHS = forecastPaths();
const PATH_CURVES = PATHS.map((path) => new THREE.CatmullRomCurve3(path.map((point) => new THREE.Vector3(...point)), false, "catmullrom", .15));
const PATH_LINES = PATH_CURVES.map((curve) => curve.getPoints(60).flatMap((point) => point.toArray()));
const FORECAST_NODES = [...new Map(PATHS.flat().map((point) => [point.join(","), point])).values()];
function Forecast({ color, motion }) {
  const pulses = useRef();
  const object = useMemo(() => new THREE.Object3D(), []);
  useFrame(() => {
    if (!motion.current.visible || !pulses.current) return;
    PATH_CURVES.forEach((curve, i) => {
      const t = (motion.current.time * .16 + i * .123) % 1;
      object.position.copy(curve.getPoint(t));
      object.scale.setScalar(.042 + .02 * Math.sin(t * Math.PI));
      object.updateMatrix();
      pulses.current.setMatrixAt(i, object.matrix);
    });
    pulses.current.instanceMatrix.needsUpdate = true;
  });
  return <group rotation={[.08, -.15, -.12]}>
    {PATH_LINES.map((points, i) => <Stroke key={i} points={points} color={color} opacity={.5} />)}
    {FORECAST_NODES.map((position, i) => <Bead key={i} position={position} color={color} size={i === 3 ? .12 : .065} wire={position[0] === -1.65} />)}
    <instancedMesh ref={pulses} args={[null, null, 8]} frustumCulled={false}><sphereGeometry args={[1, 10, 8]} /><meshBasicMaterial color={color} /></instancedMesh>
    {[-1.65, -.6, .5, 1.55].map((x, i) => <group key={x} position={[x, -1.3, 0]}><mesh rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[.055, .073, 24]} /><meshBasicMaterial color={color} side={THREE.DoubleSide} /></mesh><Stroke points={[0,0,0,0,-.1,0]} color={color} opacity={.4} /></group>)}
    <Stroke points={[-1.85,-1.3,0,1.8,-1.3,0]} color={color} opacity={.25} />
  </group>;
}

function Harmonics({ color, motion }) {
  const lines = useMemo(() => Array.from({ length: 28 }, () => new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(90 * 3), 3))), []);
  useEffect(() => () => lines.forEach((line) => line.dispose()), [lines]);
  useFrame(() => {
    if (!motion.current.visible) return;
    lines.forEach((geometry, layer) => {
      const p = geometry.attributes.position.array;
      for (let i = 0; i < 90; i++) {
        const x = -1.65 + i / 89 * 3.3;
        p[i * 3] = x;
        p[i * 3 + 1] = harmonicHeight(x, layer, motion.current.time * .65);
        p[i * 3 + 2] = (layer - 13.5) * .058;
      }
      geometry.attributes.position.needsUpdate = true;
    });
  });
  return <group rotation={[.5, -.22, -.15]}>
    {lines.map((geometry, i) => <line key={i} geometry={geometry} frustumCulled={false}><lineBasicMaterial color={color} transparent opacity={i % 5 === 0 ? .9 : .38} /></line>)}
    {[-1.72, 1.72].map((x) => <Plate key={x} position={[x, 0, 0]} width={.045} height={.12} depth={1.75} color={color} />)}
    {Array.from({length: 11}, (_, i) => <Plate key={i} width={.18 + (i % 3) * .075} height={.045} depth={.12} position={[-1.35 + i * .27, -.62, -.5 + (i % 5) * .22]} color={color} />)}
    <Stroke points={[-1.65,-.62,-.85,1.65,-.62,-.85,1.65,-.62,.85]} color={color} opacity={.3} />
  </group>;
}

const circle = (radius, z = 0, steps = 96) => Array.from({length: steps}, (_, i) => [Math.cos(i / steps * Math.PI * 2) * radius, Math.sin(i / steps * Math.PI * 2) * radius, z]).flat();
const GROOVES = Array.from({length: 16}, (_, i) => circle(.31 + i * .033, .032));
function Records({ color, motion }) {
  const record = useRef();
  useFrame(() => { if (record.current) record.current.rotation.z = motion.current.time * .13; });
  return <group rotation={[.13, -.28, -.12]}>
    {[-1, 0, 1].map((i) => <group key={i} position={[i * .18 - .25, i * .12, -i * .2 - .3]} rotation={[0, i * .12, i * .1]}>
      <Plate width={1.85} height={1.85} depth={.055} color={color} />
      <Stroke points={circle(.58, .034)} color={color} loop opacity={.35} />
      <Stroke points={[-.65,-.69,.04,-.05,-.69,.04]} color={color} opacity={.65} />
    </group>)}
    <group position={[.67, .2, .3]} ref={record}>
      <mesh rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[.9,.9,.05,80]} /><meshBasicMaterial color={color} /></mesh>
      {GROOVES.map((points, i) => <Stroke key={i} points={points} color={PAPER} opacity={.17 + (i % 3) * .07} loop />)}
      <mesh position={[0,0,.035]}><ringGeometry args={[.045,.26,48]} /><meshBasicMaterial color={PAPER} side={THREE.DoubleSide} /></mesh>
      <Stroke points={[-.17,.05,.04,.17,.05,.04,-.12,-.02,.04,.12,-.02,.04]} color={color} segments opacity={.7} />
    </group>
  </group>;
}

const FINGERPRINT = fingerprintData();
function Fingerprint({ color, motion }) {
  const scan = useRef();
  useFrame(() => { if (scan.current) scan.current.position.x = Math.sin(motion.current.time * .55) * 1.5; });
  return <group rotation={[.26, -.28, -.12]}>
    <points><bufferGeometry><bufferAttribute attach="attributes-position" args={[new Float32Array(FINGERPRINT.points),3]} /></bufferGeometry><pointsMaterial color={color} size={.042} sizeAttenuation /></points>
    <Stroke points={FINGERPRINT.pairs} color={color} segments opacity={.45} />
    <group ref={scan}>
      <mesh rotation={[0,Math.PI / 2,0]}><planeGeometry args={[1.5,1.75]} /><meshBasicMaterial color={color} transparent opacity={.065} side={THREE.DoubleSide} depthWrite={false} /></mesh>
      <Stroke points={[0,-.875,-.75,0,.875,-.75,0,.875,.75,0,-.875,.75]} color={color} opacity={.75} loop />
      <Bead position={[0,-.875,.75]} color={color} size={.06} />
    </group>
    {[-.85,.85].map((z) => <Stroke key={z} points={[-1.8,-1,z,1.8,-1,z,1.8,1,z]} color={color} opacity={.25} />)}
    <Stroke points={[-1.8,-1,-.85,-1.8,-1,.85,1.8,-1,-.85,1.8,-1,.85]} color={color} opacity={.25} segments />
  </group>;
}

function Film({ color, motion }) {
  const reel = useRef();
  useFrame(() => { if (reel.current) reel.current.rotation.y = Math.sin(motion.current.time * .2) * .12; });
  return <group ref={reel} rotation={[.12,0,-.16]}>
    {Array.from({length:7}, (_, i) => {
      const a = (i - 3) * .36;
      return <group key={i} position={[Math.sin(a) * 1.7, (i - 3) * .1, Math.cos(a) * 1.7 - 1.3]} rotation={[0,a,0]}>
        <Plate width={.56} height={1.17} depth={.04} color={color} />
        <Plate width={.42} height={.76} depth={.02} position={[0,0,.035]} color={color} />
        <mesh position={[0,.08,.052]} rotation={[0,0,Math.PI / 2]}><circleGeometry args={[.125,3]} /><meshBasicMaterial color={color} transparent opacity={.6} side={THREE.DoubleSide} /></mesh>
        {[-.49,.49].flatMap((y) => [-.17,0,.17].map((x) => <mesh key={`${x},${y}`} position={[x,y,.025]}><planeGeometry args={[.065,.065]} /><meshBasicMaterial color={color} transparent opacity={.65} /></mesh>))}
      </group>;
    })}
  </group>;
}

function BrowserWindows({ color, motion }) {
  const cards = useRef();
  useFrame(() => { if (cards.current) cards.current.children.forEach((child, i) => { child.position.y = (i - 1) * .23 + Math.sin(motion.current.time * .55 + i) * .045; }); });
  return <group ref={cards} rotation={[.12,-.25,-.08]}>
    {[-1,0,1].map((i) => <group key={i} position={[i * .5,i * .23,i * .45]} rotation={[0,i * -.1,0]}>
      <Plate width={2.05} height={1.5} depth={.07} color={color} />
      <Stroke points={[-1.02,.52,.04,1.02,.52,.04]} color={color} opacity={.4} />
      {[-.86,-.72,-.58].map((x) => <Bead key={x} position={[x,.64,.055]} color={color} size={.026} />)}
      <Plate width={.63} height={.8} depth={.03} position={[-.55,-.03,.065]} color={color} />
      <Stroke points={[-.19,.28,.07,.8,.28,.07,-.19,.13,.07,.57,.13,.07,-.19,-.02,.07,.72,-.02,.07]} color={color} segments opacity={.6} />
      <Plate width={.45} height={.15} depth={.025} position={[.04,-.29,.07]} color={color} />
      <Stroke points={[-.86,-.58,.07,.86,-.58,.07]} color={color} opacity={.3} />
    </group>)}
  </group>;
}

const shapes = { "lol-forecaster": Forecast, guitarscribe: Harmonics, "spotify-cover-generator": Records, "audio-fingerprinting": Fingerprint, animewatchlist: Film, "freelance-portfolios": BrowserWindows };

export default function ProjectScene({ project, interaction, visible, paused, reduced }) {
  const group = useRef();
  const motion = useRef({ time: 0, visible });
  const invalidate = useThree((state) => state.invalidate);
  const size = useThree((state) => state.size);
  const running = visible && !paused && !reduced;
  useEffect(() => {
    interaction.current.invalidate = invalidate;
    motion.current.visible = visible;
    if (running) activeViews.add(motion);
    invalidate();
    return () => { activeViews.delete(motion); interaction.current.invalidate = null; invalidate(); };
  }, [running, visible, invalidate, interaction]);
  useFrame((_, delta) => {
    if (!visible || !group.current) return;
    const dt = Math.min(delta, .05);
    if (running) motion.current.time += dt;
    const t = motion.current.time;
    const targetX = .12 + interaction.current.x + Math.sin(t * .3) * .035;
    const targetY = -.15 + interaction.current.y + Math.sin(t * .2) * .12;
    const factor = reduced ? 1 : 1 - Math.exp(-dt * 9);
    group.current.rotation.x += (targetX - group.current.rotation.x) * factor;
    group.current.rotation.y += (targetY - group.current.rotation.y) * factor;
    if (Math.abs(targetX - group.current.rotation.x) + Math.abs(targetY - group.current.rotation.y) > .001) invalidate();
  }, -2);
  const Shape = shapes[project.id] || BrowserWindows;
  const scale = Math.min(1, Math.max(.5, (size.width / Math.max(size.height, 1)) * .95));
  return <group ref={group} scale={scale}><Shape color={project.logo?.mark || "#6b6960"} motion={motion} /></group>;
}
