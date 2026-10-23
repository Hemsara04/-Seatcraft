// Three.js scene for the "Introducing Seatcraft" section: a Chiavari chair that assembles itself
// part by part as the page scrolls, then takes its place at a table for eight.
// The scroll position is fed in through setProgress(0..1), which scrubs a paused GSAP timeline.

import * as THREE from 'three';
import gsap from 'gsap';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

export const STAGES = ['Walnut legs & rose-gold feet', 'Apron & seat base', 'Channel-tufted back', 'Velvet cushion & card', 'Table for eight'];
const TOTAL = 10; // timeline length in seconds; progress maps onto this
const PART_DURATION = 1.6;
const START_ROT_Y = -1.1; // chair's starting turn
const stageStart = (s) => 0.5 + s * 2;

// Small deterministic PRNG so the exploded layout is the same on every visit.
function rng(seed) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function placeCardTexture() {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#fff7f9';
  g.fillRect(0, 0, 512, 256);
  g.strokeStyle = '#e8a3b8';
  g.lineWidth = 6;
  g.strokeRect(14, 14, 484, 228);
  g.fillStyle = '#3a1f2b';
  g.textAlign = 'center';
  g.font = 'italic 500 64px Fraunces, Georgia, serif';
  g.fillText('Ava Thompson', 256, 128);
  g.fillStyle = '#b02e60';
  g.font = '600 28px Manrope, Helvetica, sans-serif';
  g.fillText('TABLE 1  ·  SEAT 3', 256, 184);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function glowTexture(inner, outer, mid) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  grad.addColorStop(0, inner);
  if (mid) grad.addColorStop(0.35, mid);
  grad.addColorStop(1, outer);
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(c);
}

export function createAssemblyScene(mount, { reducedMotion = false } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  mount.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = envTex;

  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
  const camStart = new THREE.Vector3(2.8, 2.3, 4.9);
  camera.position.copy(camStart);
  const lookTarget = new THREE.Vector3(0, 0.95, 0);

  /* ---------------------------------------------------------------- lights */
  scene.add(new THREE.HemisphereLight(0xd9a3b8, 0x140a0f, 0.35));
  const key = new THREE.SpotLight(0xffe0ea, 60, 20, 0.5, 0.6, 1.6);
  key.position.set(3, 6.5, 3.5);
  key.target.position.set(0, 0.8, 0);
  scene.add(key, key.target);
  const rim = new THREE.DirectionalLight(0xc9a7ff, 1.4);
  rim.position.set(-4, 3, -4);
  scene.add(rim);
  const warm = new THREE.PointLight(0xff7aa8, 4, 6, 1.5);
  warm.position.set(-1.6, 1.4, 1.8);
  scene.add(warm);

  /* ---------------------------------------------------------------- floor */
  const grid = new THREE.GridHelper(24, 48, 0x4a3140, 0x2a1a22);
  grid.material.transparent = true;
  grid.material.opacity = 0.55;
  scene.add(grid);
  // Soft blob shadows instead of a shadow-receiving floor (which darkens everything outside the spotlight).
  const blobTex = glowTexture('rgba(0,0,0,0.75)', 'rgba(0,0,0,0)');
  const blob = (size, opacity) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, opacity, depthWrite: false }));
    m.rotation.x = -Math.PI / 2;
    m.position.y = 0.002;
    scene.add(m);
    return m;
  };
  const chairShadow = blob(1.9, 0.9);
  const glow = new THREE.Mesh(
    new THREE.PlaneGeometry(5, 5),
    new THREE.MeshBasicMaterial({ map: glowTexture('rgba(240,128,168,0.38)', 'rgba(240,128,168,0)', 'rgba(240,128,168,0.11)'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = 0.003;
  scene.add(glow);

  // Expanding "click into place" rings, one per stage.
  const rings = STAGES.slice(0, 4).map(() => {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.98, 1, 96),
      new THREE.MeshBasicMaterial({ color: 0xf6a9c4, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.006;
    scene.add(ring);
    return ring;
  });

  // Drifting dust motes catching the spotlight.
  const dustCount = 260;
  const dustPos = new Float32Array(dustCount * 3);
  const rand = rng(7);
  for (let i = 0; i < dustCount; i += 1) {
    dustPos[i * 3] = (rand() - 0.5) * 9;
    dustPos[i * 3 + 1] = rand() * 5;
    dustPos[i * 3 + 2] = (rand() - 0.5) * 9;
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  const dust = new THREE.Points(
    dustGeo,
    new THREE.PointsMaterial({ color: 0xf6a9c4, size: 0.025, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  scene.add(dust);

  /* ---------------------------------------------------------------- the chair */
  const rig = new THREE.Group(); // mouse parallax + idle bob
  const chair = new THREE.Group(); // scroll-driven rotation / placement
  rig.add(chair);
  scene.add(rig);

  // Premium finishes: rose gold, lacquered walnut and raspberry velvet (sheen gives the soft pile highlight).
  const brass = new THREE.MeshStandardMaterial({ color: 0xe9b49e, metalness: 1, roughness: 0.2, envMapIntensity: 1.3 });
  const walnut = new THREE.MeshPhysicalMaterial({ color: 0x3d2416, roughness: 0.38, clearcoat: 0.7, clearcoatRoughness: 0.22 });
  const velvet = new THREE.MeshPhysicalMaterial({ color: 0x7a2445, roughness: 0.8, sheen: 1, sheenRoughness: 0.45, sheenColor: new THREE.Color(0xf59ab9) });
  const velvetDeep = new THREE.MeshPhysicalMaterial({ color: 0x5c1a34, roughness: 0.85, sheen: 1, sheenRoughness: 0.5, sheenColor: new THREE.Color(0xc4668c), side: THREE.DoubleSide });
  const cardMat = new THREE.MeshStandardMaterial({ map: placeCardTexture(), roughness: 0.6 });
  const lineMat = new THREE.LineBasicMaterial({ color: 0xf6a9c4, transparent: true });

  const parts = [];
  const explode = rng(42);
  const addPart = (geometry, material, stage, pos, rot = [0, 0, 0]) => {
    const solidMat = material.clone();
    solidMat.transparent = true;
    const mesh = new THREE.Mesh(geometry, solidMat);
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geometry, 25), lineMat.clone());
    mesh.add(edges);
    const target = { pos: new THREE.Vector3(...pos), rot: new THREE.Euler(...rot) };
    // Exploded start: pushed outward from the chair's centre, lifted and tumbled.
    const dir = target.pos.clone().sub(new THREE.Vector3(0, 1, 0));
    dir.add(new THREE.Vector3(explode() - 0.5, explode() * 0.3, explode() - 0.5));
    dir.y *= 0.45;
    // Don't fling parts at the camera: reflect the camera-facing component so they stay in frame.
    const toCam = new THREE.Vector3(camStart.x, 0, camStart.z).normalize().applyAxisAngle(new THREE.Vector3(0, 1, 0), -START_ROT_Y); // into chair space
    const facing = dir.dot(toCam);
    if (facing > 0) dir.addScaledVector(toCam, -1.6 * facing);
    if (dir.lengthSq() < 0.01) dir.set(explode() - 0.5, 1, explode() - 0.5);
    dir.normalize().multiplyScalar(0.75 + explode() * 0.9);
    const start = { pos: target.pos.clone().add(dir).add(new THREE.Vector3(0, 0.15, 0)), rot: new THREE.Euler((explode() - 0.5) * Math.PI * 1.6, (explode() - 0.5) * Math.PI * 1.6, (explode() - 0.5) * Math.PI) };
    start.pos.y = Math.min(Math.max(start.pos.y, 0.15), 1.95);
    mesh.position.copy(start.pos);
    mesh.rotation.copy(start.rot);
    solidMat.opacity = 0.16; // faint "blueprint" ghost until the part locks in
    edges.material.opacity = 0.45;
    chair.add(mesh);
    parts.push({ mesh, edges, stage, target, start, base: material });
    return mesh;
  };

  const cyl = (rTop, rBot, h, seg = 16) => new THREE.CylinderGeometry(rTop, rBot, h, seg);
  const arc = (radius, y, from, to, n = 24) =>
    Array.from({ length: n + 1 }, (_, i) => {
      const t = from + ((to - from) * i) / n;
      return new THREE.Vector3(Math.sin(t) * radius, y, Math.cos(t) * radius);
    });
  const roundedRect = (w, d, r, y) => {
    const pts = [];
    [[w / 2 - r, d / 2 - r, 0], [-(w / 2 - r), d / 2 - r, Math.PI / 2], [-(w / 2 - r), -(d / 2 - r), Math.PI], [w / 2 - r, -(d / 2 - r), Math.PI * 1.5]].forEach(([cx, cz, a0]) => {
      for (let i = 0; i <= 6; i += 1) {
        const a = a0 + (i / 6) * (Math.PI / 2);
        pts.push(new THREE.Vector3(cx + Math.cos(a) * r, y, cz + Math.sin(a) * r));
      }
    });
    return new THREE.CatmullRomCurve3(pts, true);
  };

  // Stage 0 — splayed, tapered walnut legs with brass sabots
  const LEG = 0.66;
  [[-1, 1], [1, 1], [-1, -1], [1, -1]].forEach(([sx, sz]) => {
    const rot = new THREE.Euler(-sz * 0.07, 0, sx * 0.07);
    const centre = new THREE.Vector3(sx * 0.32, LEG / 2, sz * 0.28);
    addPart(cyl(0.036, 0.02, LEG, 20), walnut, 0, centre.toArray(), [rot.x, rot.y, rot.z]);
    const foot = centre.clone().add(new THREE.Vector3(0, -LEG / 2 + 0.035, 0).applyEuler(rot));
    addPart(cyl(0.024, 0.021, 0.07, 20), brass, 0, foot.toArray(), [rot.x, rot.y, rot.z]);
  });

  // Stage 1 — brass apron and upholstered seat base
  addPart(new RoundedBoxGeometry(0.86, 0.05, 0.76, 3, 0.02), brass, 1, [0, 0.685, 0]);
  addPart(new RoundedBoxGeometry(0.92, 0.13, 0.84, 5, 0.05), velvetDeep, 1, [0, 0.775, 0]);

  // Stage 2 — curved tub back: velvet shell, seven channel-tufted pillows, brass top rail
  const BACK_Y = 1.24;
  const SPREAD = 1.2;
  const shell = new THREE.CylinderGeometry(0.47, 0.47, 0.8, 64, 1, true, Math.PI - SPREAD, SPREAD * 2);
  addPart(shell, velvetDeep, 2, [0, BACK_Y, 0]);
  for (let i = 0; i < 7; i += 1) {
    const a = Math.PI - 1.04 + (i / 6) * 2.08;
    const channel = new THREE.CapsuleGeometry(0.062, 0.54, 8, 20);
    channel.scale(1, 1, 0.62); // flatten into a pillow, depth faces the centre once rotated
    addPart(channel, velvet, 2, [Math.sin(a) * 0.415, BACK_Y - 0.01, Math.cos(a) * 0.415], [0, a, 0]);
  }
  addPart(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(arc(0.47, 0, Math.PI - SPREAD, Math.PI + SPREAD)), 64, 0.022, 10), brass, 2, [0, BACK_Y + 0.41, 0]);

  // Stage 3 — plush seat cushion, brass piping and the place card
  addPart(new RoundedBoxGeometry(0.84, 0.13, 0.72, 6, 0.06), velvet, 3, [0, 0.9, 0.04]);
  addPart(new THREE.TubeGeometry(roundedRect(0.93, 0.85, 0.07, 0), 96, 0.013, 8, true), brass, 3, [0, 0.842, 0]);
  addPart(new THREE.BoxGeometry(0.34, 0.17, 0.008), cardMat, 3, [0, 1.05, 0.2], [-0.28, 0, 0]);

  /* ---------------------------------------------------------------- final stage: table for eight */
  const tableCenter = new THREE.Vector3(0, 0, -1.75);
  const extras = new THREE.Group();
  scene.add(extras);
  const fadeMats = [];
  const fade = (m, max = 1) => {
    const mat = m.clone();
    mat.transparent = true;
    mat.opacity = 0;
    fadeMats.push({ mat, max });
    return mat;
  };
  const cloth = new THREE.MeshStandardMaterial({ color: 0xf0d3dd, roughness: 0.95, envMapIntensity: 0.5 });
  const tableTop = new THREE.Mesh(cyl(1.0, 1.0, 0.06, 64), fade(cloth));
  tableTop.position.set(tableCenter.x, 1.42, tableCenter.z);
  const skirt = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.08, 1.4, 64, 1, true), fade(cloth));
  skirt.material.side = THREE.DoubleSide;
  skirt.position.set(tableCenter.x, 0.71, tableCenter.z);
  const tableShadow = blob(4.4, 0);
  tableShadow.position.set(tableCenter.x, 0.002, tableCenter.z);
  const candle = new THREE.Mesh(cyl(0.05, 0.05, 0.22), fade(new THREE.MeshStandardMaterial({ color: 0xfff7e8, emissive: 0xffb36b, emissiveIntensity: 0.4 })));
  candle.position.set(tableCenter.x, 1.56, tableCenter.z);
  const flame = new THREE.PointLight(0xffa25a, 0, 4, 1.6);
  flame.position.set(tableCenter.x, 1.8, tableCenter.z);
  extras.add(tableTop, skirt, candle, flame);

  // Seven ghost chairs complete the ring; the assembled chair is the eighth.
  const R = 1.75;
  for (let i = 1; i < 8; i += 1) {
    const a = (i / 8) * Math.PI * 2;
    const ghost = new THREE.Group();
    parts.forEach((p) => {
      if (p.base === cardMat) return; // only the guest's own chair has a place card
      const m = new THREE.Mesh(p.mesh.geometry, fade(p.base, 0.95));
      m.position.copy(p.target.pos);
      m.rotation.copy(p.target.rot);
      ghost.add(m);
    });
    ghost.position.set(tableCenter.x + Math.sin(a) * R, 0, tableCenter.z + Math.cos(a) * R);
    ghost.rotation.y = a + Math.PI;
    ghost.scale.setScalar(0.001);
    extras.add(ghost);
  }
  const ghosts = extras.children.filter((c) => c.isGroup);

  /* ---------------------------------------------------------------- the scroll timeline */
  const tl = gsap.timeline({ paused: true, defaults: { ease: 'power3.inOut' } });
  tl.set({}, {}, TOTAL); // fix total length
  tl.fromTo(chair.rotation, { y: START_ROT_Y }, { y: 0.5, duration: stageStart(4), ease: 'none' }, 0);

  const counters = [0, 0, 0, 0];
  parts.forEach((p) => {
    const i = counters[p.stage]++;
    const at = stageStart(p.stage) + i * 0.07;
    p.doneAt = (at + PART_DURATION) / TOTAL;
    tl.to(p.mesh.position, { x: p.target.pos.x, y: p.target.pos.y, z: p.target.pos.z, duration: PART_DURATION }, at)
      .to(p.mesh.rotation, { x: p.target.rot.x, y: p.target.rot.y, z: p.target.rot.z, duration: PART_DURATION }, at)
      .to(p.mesh.material, { opacity: 1, duration: PART_DURATION * 0.6, ease: 'power1.in' }, at + PART_DURATION * 0.4)
      .to(p.edges.material, { opacity: 0.06, duration: PART_DURATION * 0.5, ease: 'none' }, at + PART_DURATION * 0.5);
  });
  rings.forEach((ring, s) => {
    const at = stageStart(s) + counters[s] * 0.07 + PART_DURATION - 0.1;
    tl.fromTo(ring.scale, { x: 0.6, y: 0.6, z: 0.6 }, { x: 2.6, y: 2.6, z: 2.6, duration: 0.9, ease: 'power2.out', immediateRender: false }, at)
      .set(ring.material, { opacity: 0.7 }, at)
      .to(ring.material, { opacity: 0, duration: 0.9, ease: 'power1.in' }, at + 0.001);
  });

  // Stage 4: the chair turns to face its table, the room appears, the camera pulls back.
  const s4 = stageStart(4);
  tl.to(chair.rotation, { y: Math.PI, duration: 1.4 }, s4)
    .to(camera.position, { x: 4.6, y: 6.2, z: 7.4, duration: 1.5 }, s4)
    .to(lookTarget, { x: 0, y: 0.55, z: -1.75, duration: 1.5 }, s4)
    .to(tableShadow.material, { opacity: 0.9, duration: 0.8 }, s4 + 0.3)
    .to(chairShadow.material, { opacity: 0.5, duration: 0.8 }, s4 + 0.3)
    .to(glow.position, { z: tableCenter.z / 2, duration: 1.5 }, s4)
    .to(glow.scale, { x: 2.2, y: 2.2, duration: 1.5 }, s4)
    .to(flame, { intensity: 3, duration: 0.8 }, s4 + 0.7);
  fadeMats.forEach(({ mat, max }) => tl.to(mat, { opacity: max, duration: 0.8, ease: 'power1.out' }, s4 + 0.3));
  ghosts.forEach((g, i) => tl.to(g.scale, { x: 1, y: 1, z: 1, duration: 0.6, ease: 'back.out(1.6)' }, s4 + 0.4 + i * 0.09));

  const fadingMats = [...parts.map((p) => p.mesh.material), ...fadeMats.map((f) => f.mat)];

  /* ---------------------------------------------------------------- render loop */
  const resize = () => {
    const w = mount.clientWidth;
    const h = mount.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // Widen the view on portrait screens so the chair (and later the table) stays in frame.
    camera.fov = w / h < 0.9 ? 46 : 34;
    // On wide screens the canvas spans the whole section; shift the subject right of the copy.
    if (w / h > 1.1) camera.setViewOffset(w, h, -w * 0.17, 0, w, h);
    else camera.clearViewOffset();
    camera.updateProjectionMatrix();
  };
  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(mount);

  const pointer = { x: 0, y: 0 };
  const onPointer = (e) => {
    pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
    pointer.y = (e.clientY / window.innerHeight) * 2 - 1;
  };
  window.addEventListener('pointermove', onPointer);

  let visible = true;
  const io = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
  });
  io.observe(mount);

  const clock = new THREE.Clock();
  let raf;
  const tick = () => {
    raf = requestAnimationFrame(tick);
    if (!visible) return;
    const t = clock.getElapsedTime();
    if (!reducedMotion) {
      rig.rotation.y += (pointer.x * 0.18 - rig.rotation.y) * 0.05;
      rig.rotation.x += (pointer.y * 0.05 - rig.rotation.x) * 0.05;
      rig.position.y = Math.sin(t * 0.9) * 0.025 * (1 - tl.progress());
      const pos = dustGeo.attributes.position;
      for (let i = 0; i < dustCount; i += 1) {
        let y = pos.getY(i) + 0.0025;
        if (y > 5) y = 0;
        pos.setY(i, y);
      }
      pos.needsUpdate = true;
      flame.intensity = flame.intensity > 0 ? 2.6 + Math.sin(t * 9) * 0.25 + Math.sin(t * 23) * 0.15 : 0;
    }
    // Fully transparent meshes must not write depth, or they cut dark holes in the scene.
    fadingMats.forEach((m) => {
      m.visible = m.opacity > 0.004;
      m.depthWrite = m.opacity > 0.6;
    });
    camera.lookAt(lookTarget);
    renderer.render(scene, camera);
  };
  tick();

  return {
    total: parts.length,
    /** Scrub the assembly. Returns how many parts are in place. */
    setProgress(p) {
      tl.progress(Math.min(1, Math.max(0, p)));
      return parts.reduce((n, part) => n + (p >= part.doneAt ? 1 : 0), 0);
    },
    dispose() {
      cancelAnimationFrame(raf);
      tl.kill();
      ro.disconnect();
      io.disconnect();
      window.removeEventListener('pointermove', onPointer);
      scene.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) [].concat(obj.material).forEach((m) => {
          m.map?.dispose();
          m.dispose();
        });
      });
      envTex.dispose();
      pmrem.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
