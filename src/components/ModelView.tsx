'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

/** A model ready to show: an object in metres, its largest extent, and how to free it. */
export interface ViewModel {
  object: import('three').Object3D;
  /** The longest extent, metres; frames the camera. */
  spanM: number;
  dispose: () => void;
  /** Moves the parts that turn (propellers, rotors) on by `dt` seconds. */
  tick?: (dt: number) => void;
}

/**
 * OSIRIS — a card's 3D model
 *
 * A model turning slowly in sunlight, with the Earth's blue light from below.
 * Drag to turn it, scroll to come closer. three.js loads the first time a
 * model is opened, not with the page, and the view gives its WebGL context
 * back when it closes. Shared by the satellite and aircraft cards.
 */
export default function ModelView({ buildKey, build, label, sizeText, note, corner }: {
  /** Changes when a different model should be built. */
  buildKey: string;
  build: (THREE: typeof import('three')) => ViewModel;
  label: string;
  /** The size caption for a built model, or null for none. */
  sizeText?: (model: ViewModel) => string | null;
  note: string;
  /** The picture toggle, drawn in the bottom-left corner. */
  corner?: ReactNode;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [size, setSize] = useState<string | null>(null);
  // Read when the model is built; the key decides when that is.
  const latest = useRef({ build, sizeText });
  useEffect(() => { latest.current = { build, sizeText }; });

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    let gone = false;
    let teardown = () => {};
    (async () => {
      const THREE = await import('three');
      const { OrbitControls } = await import('three/examples/jsm/controls/OrbitControls.js');
      const { RoomEnvironment } = await import('three/examples/jsm/environments/RoomEnvironment.js');
      if (gone) return;

      const renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
      renderer.setSize(box.clientWidth, box.clientHeight);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.3;
      renderer.domElement.style.display = 'block';
      box.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x000000);
      const pmrem = new THREE.PMREMGenerator(renderer);
      const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
      scene.environment = env;
      scene.environmentIntensity = 0.9;
      const sun = new THREE.DirectionalLight(0xfff4e0, 3.2);
      sun.position.set(5, 6, 8);
      // Sky white above, the Earth's blue below.
      scene.add(sun, new THREE.HemisphereLight(0xffffff, 0x2f6db5, 0.7));

      const built = latest.current.build(THREE);
      scene.add(built.object);

      const r = built.spanM / 2;
      const camera = new THREE.PerspectiveCamera(30, box.clientWidth / box.clientHeight, r / 100, r * 100);
      const dist = (r / Math.sin((30 * Math.PI) / 360)) * 0.95;
      camera.position.set(dist * 0.55, dist * 0.32, dist * 0.8);

      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.enablePan = false;
      controls.autoRotate = true;
      controls.autoRotateSpeed = 1.6;
      controls.minDistance = dist * 0.35;
      controls.maxDistance = dist * 2.5;

      const resize = new ResizeObserver(() => {
        if (!box.clientWidth || !box.clientHeight) return;
        renderer.setSize(box.clientWidth, box.clientHeight);
        camera.aspect = box.clientWidth / box.clientHeight;
        camera.updateProjectionMatrix();
      });
      resize.observe(box);

      let last = performance.now();
      renderer.setAnimationLoop(now => {
        built.tick?.(Math.min(0.1, (now - last) / 1000));
        last = now;
        controls.update();
        renderer.render(scene, camera);
      });

      teardown = () => {
        renderer.setAnimationLoop(null);
        resize.disconnect();
        controls.dispose();
        built.dispose();
        env.dispose();
        pmrem.dispose();
        renderer.dispose();
        // Give the context back now: browsers keep only a few, and the main map holds one.
        renderer.forceContextLoss();
        renderer.domElement.remove();
      };
      setSize(latest.current.sizeText?.(built) ?? null);
      setState('ready');
    })().catch(() => { if (!gone) setState('failed'); });

    return () => { gone = true; teardown(); };
  }, [buildKey]);

  return (
    <div className="border-t border-[var(--border-secondary)]">
      <div className="relative h-[150px] w-full overflow-hidden bg-black md:h-[168px]">
        <div ref={boxRef} className="h-full w-full cursor-grab active:cursor-grabbing" />

        {state !== 'ready' && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-[8px] font-mono tracking-[0.15em] text-white/50">
            {state === 'loading' ? 'LOADING MODEL…' : '3D VIEW UNAVAILABLE'}
          </div>
        )}

        <div className="pointer-events-none absolute left-1.5 top-1.5 max-w-[calc(100%-12px)] truncate rounded bg-black/60 px-1.5 py-0.5 text-[8px] font-mono uppercase tracking-[0.14em] text-white/85">
          MODEL · {label}
        </div>

        {size && (
          <div className="pointer-events-none absolute bottom-1.5 right-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[8px] font-mono tracking-[0.14em] text-white/85">
            {size}
          </div>
        )}

        {corner && <div className="absolute bottom-1.5 left-1.5">{corner}</div>}
      </div>
      <div className="px-2.5 py-1 text-[7px] leading-snug text-[var(--text-muted)]">{note}</div>
    </div>
  );
}
