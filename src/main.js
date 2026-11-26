import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// ---------- 1. Scene, camera, renderer ----------
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0d0805);

const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 1.6, 2.4); // eye height = first-person view
camera.rotation.order = 'YXZ';     // turn left/right first, then up/down

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ---------- 2. Placeholder room and lights ----------
function box(w, h, d, color, x, y, z) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshStandardMaterial({ color })
  );
  mesh.position.set(x, y, z);
  scene.add(mesh);
  return mesh;
}

const placeholder = [
  box(5, 0.1, 5, 0x613f24, 0, 0, 0),      // floor
  box(5, 3.5, 0.1, 0x6f4829, 0, 1.75, -1.5), // back wall
  box(2, 0.08, 0.7, 0xc4a276, 0, 0.9, 0),  // table
];

scene.add(new THREE.AmbientLight(0xffffff, 0.6));
for (const x of [-1, 0, 1]) {
  const light = new THREE.PointLight(0xffc47c, 3);
  light.position.set(x, 2.3, 0.5);
  scene.add(light);
}

// If public/models/room.glb exists, show your Blender room instead.
new GLTFLoader().load(
  '/models/room.glb',
  (gltf) => {
    placeholder.forEach((mesh) => scene.remove(mesh));
    scene.add(gltf.scene);
  },
  undefined,
  () => console.log('No room.glb yet, using the placeholder room.')
);

// ---------- 3. Wire ----------
const curve = new THREE.CatmullRomCurve3([
  new THREE.Vector3(-0.8, 1.2, 0),
  new THREE.Vector3(-0.5, 1.45, 0.08),
  new THREE.Vector3(-0.2, 1.2, 0),
  new THREE.Vector3(0.15, 1.5, -0.08),
  new THREE.Vector3(0.5, 1.25, 0),
  new THREE.Vector3(0.8, 1.35, 0),
]);
const WIRE_RADIUS = 0.012;
scene.add(new THREE.Mesh(
  new THREE.TubeGeometry(curve, 200, WIRE_RADIUS, 12),
  new THREE.MeshStandardMaterial({ color: 0xd08a5a, metalness: 0.5, roughness: 0.3 })
));
const points = curve.getSpacedPoints(600);

// ---------- 4. Ring ----------
const RING_RADIUS = 0.09;
const RING_TUBE = 0.012;
const GOLD = 0xffcc33;
const ring = new THREE.Mesh(
  new THREE.TorusGeometry(RING_RADIUS, RING_TUBE, 12, 48),
  new THREE.MeshStandardMaterial({ color: GOLD, metalness: 0.5, roughness: 0.3 })
);
scene.add(ring);

// ---------- 5. Game state ----------
const hitsText = document.querySelector('#hits');
const message = document.querySelector('#message');
const startButton = document.querySelector('#start');

let playing = false;
let touching = false;
let hits = 0;
let progress = 0; // which point of the wire the ring has reached
// Phones and tablets use touch; laptops use mouse and keyboard.
const isTouch = matchMedia('(pointer: coarse)').matches;
if (isTouch) document.body.classList.add('touch');
function lockMouse() {
  if (!isTouch) renderer.domElement.requestPointerLock();
}
let mode = 'walk'; // 'walk' = look around, 'ring' = play at the table
const keys = {};
const walkPosition = new THREE.Vector3();
const walkRotation = new THREE.Euler();

const nearTable = () => Math.abs(camera.position.x) < 1.3 && camera.position.z < 1.4;

function toggleTable() {
  if (mode === 'walk' && playing && nearTable()) {
    mode = 'ring';
    walkPosition.copy(camera.position);
    walkRotation.copy(camera.rotation);
    camera.position.set(0, 1.6, 1.1);
    camera.lookAt(0, 1.3, 0);
    message.textContent = isTouch ? 'Drag to guide the ring to the right end.' : 'Guide the ring to the right end. E: step back';
  } else if (mode === 'ring') {
    mode = 'walk';
    camera.position.copy(walkPosition);
    camera.rotation.copy(walkRotation);
    if (playing) message.textContent = isTouch ? 'Walk to the table and tap Table.' : 'Walk to the table and press E.';
  }
}

function faceWire() {
  const direction = curve.getTangentAt(progress / 600);
  direction.z += 0.6; // slight turn so you can see the ring's shape
  ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), direction.normalize());
}

function reset() {
  progress = 0;
  hits = 0;
  touching = false;
  hitsText.textContent = hits;
  ring.position.copy(points[0]);
  ring.material.color.set(GOLD);
  faceWire();
}
reset();

let audio;
function buzz() {
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.type = 'sawtooth';
  osc.frequency.value = 110;
  gain.gain.value = 0.15;
  osc.connect(gain).connect(audio.destination);
  osc.start();
  osc.stop(audio.currentTime + 0.2);
}

// One musical note: pitch in Hz, delay and length in seconds.
function note(pitch, delay, length) {
  const start = audio.currentTime + delay;
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.type = 'triangle';
  osc.frequency.value = pitch;
  gain.gain.setValueAtTime(0.2, start);
  gain.gain.exponentialRampToValueAtTime(0.001, start + length);
  osc.connect(gain).connect(audio.destination);
  osc.start(start);
  osc.stop(start + length);
}
const startSound = () => { note(523, 0, 0.15); note(784, 0.12, 0.25); };
const successSound = () =>
  [523, 659, 784, 1047].forEach((pitch, i) => note(pitch, i * 0.14, 0.4));

startButton.addEventListener('click', () => {
  audio ??= new AudioContext();
  audio.resume();
  startSound();
  reset();
  playing = true;
  startButton.textContent = 'Restart';
  startButton.blur();
  if (mode === 'ring') toggleTable();
  message.textContent = isTouch ? 'Walk to the table and tap Table.' : 'Walk to the table and press E.';
  lockMouse();
});

renderer.domElement.addEventListener('click', () => {
  if (playing) lockMouse();
});

// ---------- 6. Movement and collision ----------
function move(dx, dy, dz) {
  if (!playing || mode !== 'ring') return;
  // Limit each step so the ring cannot jump through the wire.
  const step = new THREE.Vector3(dx, dy, dz).clampLength(0, 0.02);
  ring.position.add(step);

  // Find the closest wire point near where we already are (no shortcuts).
  let best = progress;
  let distance = Infinity;
  for (let i = Math.max(0, progress - 30); i <= Math.min(600, progress + 30); i++) {
    const d = ring.position.distanceTo(points[i]);
    if (d < distance) { distance = d; best = i; }
  }
  progress = best;
  faceWire();

  const nowTouching = distance > RING_RADIUS - RING_TUBE - WIRE_RADIUS;
  if (nowTouching && !touching) {
    hits++;
    hitsText.textContent = hits;
    buzz();
  }
  touching = nowTouching;
  ring.material.color.set(touching ? 0xff2727 : GOLD);

  // Ring went completely off the wire: put it back on.
  if (distance > RING_RADIUS) ring.position.copy(points[progress]);

  if (progress >= 595) {
    playing = false;
    successSound();
    message.textContent = `Success! You finished with ${hits} hit(s).`;
    document.exitPointerLock();
  }
}

addEventListener('mousemove', (e) => {
  if (!document.pointerLockElement) return;
  if (mode === 'ring') {
    move(e.movementX * 0.001, -e.movementY * 0.001, 0);
  } else {
    camera.rotation.y -= e.movementX * 0.002;
    camera.rotation.x = THREE.MathUtils.clamp(
      camera.rotation.x - e.movementY * 0.002, -1.4, 1.4);
  }
});
addEventListener('wheel', (e) => move(0, 0, Math.sign(e.deltaY) * 0.01));
addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (e.code === 'KeyE' && !e.repeat) toggleTable();
  if (e.code === 'KeyR') startButton.click();
  if (e.code === 'KeyW') move(0, 0, -0.01);
  if (e.code === 'KeyS') move(0, 0, 0.01);
});
addEventListener('keyup', (e) => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

// ---------- Touch controls ----------
let finger = null; // the finger that is dragging on the 3D view
const canvas = renderer.domElement;

canvas.addEventListener('pointerdown', (e) => {
  if (!isTouch || finger) return;
  finger = { id: e.pointerId, x: e.clientX, y: e.clientY };
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => {
  if (!finger || e.pointerId !== finger.id) return;
  const dx = e.clientX - finger.x;
  const dy = e.clientY - finger.y;
  finger.x = e.clientX;
  finger.y = e.clientY;
  if (mode === 'ring') {
    move(dx * 0.002, -dy * 0.002, 0);
  } else if (playing) {
    camera.rotation.y -= dx * 0.005;
    camera.rotation.x = THREE.MathUtils.clamp(camera.rotation.x - dy * 0.005, -1.4, 1.4);
  }
});
for (const type of ['pointerup', 'pointercancel']) {
  canvas.addEventListener(type, (e) => {
    if (finger && e.pointerId === finger.id) finger = null;
  });
}

// Buttons that act while held down.
for (const button of document.querySelectorAll('[data-key]')) {
  const key = button.dataset.key;
  button.addEventListener('pointerdown', (e) => {
    button.setPointerCapture(e.pointerId);
    keys[key] = true;
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    button.addEventListener(type, () => { keys[key] = false; });
  }
}
document.querySelector('#table').addEventListener('click', toggleTable);

// ---------- 7. Walk and draw every frame ----------
const clock = new THREE.Clock();

function walk(seconds) {
  const forward = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0);
  const side = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0);
  const step = new THREE.Vector3(side, 0, -forward)
    .normalize()
    .multiplyScalar(1.5 * seconds)
    .applyAxisAngle(new THREE.Vector3(0, 1, 0), camera.rotation.y);
  camera.position.add(step);
  // Stay inside the walls and in front of the table.
  camera.position.x = THREE.MathUtils.clamp(camera.position.x, -2.2, 2.2);
  camera.position.z = THREE.MathUtils.clamp(camera.position.z, 0.75, 2.7);
}

renderer.setAnimationLoop(() => {
  const seconds = Math.min(clock.getDelta(), 0.1);
  if (mode === 'walk' && (isTouch || document.pointerLockElement)) walk(seconds);
  if (mode === 'ring') {
    // Near / Far buttons on touch screens.
    const depth = (keys.Near ? 1 : 0) - (keys.Far ? 1 : 0);
    if (depth) move(0, 0, depth * 0.15 * seconds);
  }
  document.body.classList.toggle('at-table', mode === 'ring');
  renderer.render(scene, camera);
});
