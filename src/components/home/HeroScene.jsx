import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import gsap from 'gsap';

const PALETTE = {
  floor: 0xf3ebde,
  cloth: 0xfffaf2,
  clothEdge: 0xe9dcc6,
  chair: 0x1f2a24,
  chairAlt: 0xc8693f,
  plate: 0xffffff,
  gold: 0xc9a46a,
  green: 0x6f8f72,
};

function makeTable(radius, seats, accent) {
  const group = new THREE.Group();
  const clothMat = new THREE.MeshStandardMaterial({ color: PALETTE.cloth, roughness: 0.85 });
  const top = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 1.02, 0.1, 48), clothMat);
  top.position.y = 0.75;
  top.castShadow = top.receiveShadow = true;
  const skirt = new THREE.Mesh(new THREE.CylinderGeometry(radius * 1.02, radius * 1.12, 0.72, 48, 1, true), new THREE.MeshStandardMaterial({ color: PALETTE.clothEdge, roughness: 0.9, side: THREE.DoubleSide }));
  skirt.position.y = 0.36;
  skirt.castShadow = true;
  group.add(top, skirt);

  // Centrepiece: a little vase with flowers.
  const vase = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 0.22, 16), new THREE.MeshStandardMaterial({ color: PALETTE.gold, metalness: 0.6, roughness: 0.3 }));
  vase.position.y = 0.91;
  group.add(vase);
  for (let i = 0; i < 5; i += 1) {
    const bloom = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 12), new THREE.MeshStandardMaterial({ color: i % 2 ? accent : 0xf6d6c8, roughness: 0.6 }));
    const a = (i / 5) * Math.PI * 2;
    bloom.position.set(Math.cos(a) * 0.07, 1.06 + (i % 2) * 0.04, Math.sin(a) * 0.07);
    group.add(bloom);
  }

  const chairMat = new THREE.MeshStandardMaterial({ color: PALETTE.chair, roughness: 0.55 });
  const cushionMat = new THREE.MeshStandardMaterial({ color: accent, roughness: 0.7 });
  const plateMat = new THREE.MeshStandardMaterial({ color: PALETTE.plate, roughness: 0.3 });
  const chairs = [];
  for (let i = 0; i < seats; i += 1) {
    const a = (i / seats) * Math.PI * 2;
    const chair = new THREE.Group();
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.06, 0.34), cushionMat);
    seat.position.y = 0.45;
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.42, 0.05), chairMat);
    back.position.set(0, 0.68, 0.16);
    [[-0.14, -0.14], [0.14, -0.14], [-0.14, 0.14], [0.14, 0.14]].forEach(([x, z]) => {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.44, 6), chairMat);
      leg.position.set(x, 0.22, z);
      chair.add(leg);
    });
    chair.add(seat, back);
    chair.children.forEach((m) => (m.castShadow = true));
    const d = radius + 0.32;
    chair.position.set(Math.sin(a) * d, 0, Math.cos(a) * d);
    chair.rotation.y = a;
    group.add(chair);
    chairs.push(chair);

    const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.012, 24), plateMat);
    plate.position.set(Math.sin(a) * (radius - 0.2), 0.81, Math.cos(a) * (radius - 0.2));
    group.add(plate);
  }
  return { group, chairs };
}

/** Decorative 3D banquet scene for the hero. Falls back to a gradient if WebGL is unavailable. */
export default function HeroScene() {
  const mountRef = useRef(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const mount = mountRef.current;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
    } catch {
      setFailed(true);
      return undefined;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
    const rig = new THREE.Group();
    rig.add(camera);
    scene.add(rig);
    camera.position.set(0, 9.5, 12);
    camera.lookAt(0, 0, 0);

    scene.add(new THREE.HemisphereLight(0xfff6ea, 0xd9c7ae, 1.25));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(5, 10, 6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -9;
    sun.shadow.camera.right = 9;
    sun.shadow.camera.top = 9;
    sun.shadow.camera.bottom = -9;
    sun.shadow.radius = 6;
    scene.add(sun);
    const warm = new THREE.PointLight(0xffc89a, 12, 14);
    warm.position.set(-3, 3, 2);
    scene.add(warm);

    const floor = new THREE.Mesh(new THREE.CircleGeometry(14, 64), new THREE.ShadowMaterial({ opacity: 0.12 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    // Dance floor in the centre.
    const dance = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.04, 2.6), new THREE.MeshStandardMaterial({ color: 0xe8d8bd, roughness: 0.25, metalness: 0.1 }));
    dance.position.y = 0.02;
    dance.receiveShadow = true;
    scene.add(dance);

    const layout = [
      [-3.6, -1.8, 8, PALETTE.chairAlt], [0, -3.4, 10, PALETTE.green], [3.6, -1.8, 8, PALETTE.chairAlt],
      [-3.6, 2.2, 8, PALETTE.green], [3.6, 2.2, 8, PALETTE.green], [0, 3.9, 6, PALETTE.chairAlt],
    ];
    const tables = layout.map(([x, z, seats, accent]) => {
      const t = makeTable(seats > 8 ? 1.0 : 0.85, seats, accent);
      t.group.position.set(x, 0, z);
      scene.add(t.group);
      return t;
    });

    const resize = () => {
      const { clientWidth: w, clientHeight: h } = mount;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      // Pull back on narrow screens so the whole room stays visible.
      camera.position.set(0, w < 600 ? 14 : 11, w < 600 ? 17 : 14);
      camera.lookAt(0, 0, 0);
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(mount);

    // Entrance: tables drop in, chairs slide into place.
    const ctx = gsap.context(() => {
      if (reduceMotion) return;
      tables.forEach((t, i) => {
        gsap.from(t.group.position, { y: 4, duration: 1.1, ease: 'bounce.out', delay: 0.25 + i * 0.12 });
        gsap.from(t.group.scale, { x: 0.6, y: 0.6, z: 0.6, duration: 0.9, ease: 'back.out(2)', delay: 0.25 + i * 0.12 });
        t.chairs.forEach((c, j) => {
          gsap.from(c.position, { x: c.position.x * 1.8, z: c.position.z * 1.8, duration: 0.8, ease: 'power3.out', delay: 1 + i * 0.1 + j * 0.03 });
        });
      });
      gsap.from(rig.rotation, { y: -0.6, duration: 2.4, ease: 'power3.out' });
    });

    const pointer = { x: 0, y: 0 };
    const onPointer = (e) => {
      pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
      pointer.y = (e.clientY / window.innerHeight) * 2 - 1;
    };
    window.addEventListener('pointermove', onPointer);

    let raf;
    let visible = true;
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
    });
    io.observe(mount);
    const clock = new THREE.Clock();
    const tick = () => {
      raf = requestAnimationFrame(tick);
      if (!visible) return;
      const t = clock.getElapsedTime();
      if (!reduceMotion) {
        scene.rotation.y = t * 0.06;
        rig.rotation.x += (pointer.y * 0.06 - rig.rotation.x) * 0.04;
        rig.position.x += (pointer.x * 0.8 - rig.position.x) * 0.04;
        tables.forEach((tb, i) => {
          tb.group.children[0].position.y = 0.75 + Math.sin(t * 1.4 + i) * 0.004;
        });
      }
      renderer.render(scene, camera);
    };
    tick();

    return () => {
      cancelAnimationFrame(raf);
      ctx.revert();
      ro.disconnect();
      io.disconnect();
      window.removeEventListener('pointermove', onPointer);
      scene.traverse((obj) => {
        obj.geometry?.dispose();
        if (obj.material) [].concat(obj.material).forEach((m) => m.dispose());
      });
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  return <div ref={mountRef} className={`hero-scene${failed ? ' is-fallback' : ''}`} aria-hidden="true" />;
}
