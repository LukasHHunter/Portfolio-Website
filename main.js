import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.152.2/build/three.module.js";

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);
// --- UI overlay setup ---
const uiScene = new THREE.Scene();
const uiCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 10);
let uiTriangles = [];

// --- Camera setup ---
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 35, 1);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);
renderer.domElement.style.position = "absolute";
renderer.domElement.style.top = "0";
renderer.domElement.style.left = "0";
renderer.domElement.style.zIndex = "-1";

let cameraAngleX = 0;
let cameraPitch = -1.38;
let cameraYPitch = 0;
const cameraRadius = 40;
let cameraTarget = new THREE.Vector3(0, 0, 0);
let cameraTargetLerped = new THREE.Vector3(0, 0, 0);
let cameraAngle = 0;

let followPlanet = null;
let followDistance = 10;
let currentFollowDistance = 40;
const baseOffset = camera.position.clone();
let focusTarget = new THREE.Vector3(0, 0, 0);
let focusTargetLerped = new THREE.Vector3(0, 0, 0);
let lastTarget = null;

let currentZoom = 1;
let targetZoom = 1;
const followSpeed = 0.05;
const returnSpeed = 0.2;
const zoomSpeed = 0.07;

const left = document.getElementById("leftPanel");
const right = document.getElementById("rightPanel");
const label = document.getElementById("planetLabel");

//Image fade-in/out
const projectImg = document.getElementById("projectImg1");
let currentImageIndex = 0;
let showingFirst = true;
let isTransitioning = false;
rightPanel.addEventListener("wheel", (e) => {
  if (!followPlanet || isTransitioning) return;

  isTransitioning = true;

  const p = followPlanet.project;
  if (!p || p.images.length <= 1) {
    isTransitioning = false;
    return;
  }

  // Determine next index
  if (e.deltaY > 0) {
    currentImageIndex = (currentImageIndex + 1) % p.images.length;
  } else {
    currentImageIndex = (currentImageIndex - 1 + p.images.length) % p.images.length;
  }

  // Update dots
  const dots = document.querySelectorAll("#imageDots .dot");
  dots.forEach((d, i) => {
    d.classList.toggle("active", i === currentImageIndex);
  });

  const nextSrc = p.images[currentImageIndex];
  const img1 = document.getElementById("projectImg1");
  const img2 = document.getElementById("projectImg2");

  if (showingFirst) {
    img2.src = nextSrc;
    img2.onload = () => {
      img1.style.opacity = 0;
      img2.style.opacity = 1;
      showingFirst = false;

      setTimeout(() => (isTransitioning = false), 250);
    };
  } else {
    img1.src = nextSrc;
    img1.onload = () => {
      img2.style.opacity = 0;
      img1.style.opacity = 1;
      showingFirst = true;

      setTimeout(() => (isTransitioning = false), 250);
    };
  }
});


//Stars
function createStars() {
  const starGeometry = new THREE.BufferGeometry();
  const starCount = 6000;
  const positions = [];
  const colors = [];
  const shellRadius = 150;

  for (let i = 0; i < starCount; i++) {
    const theta = Math.random() * 2 * Math.PI;
    const phi = Math.acos(2 * Math.random() - 1);
    const r = shellRadius + (Math.random() - 0.5) * 60 + Math.random() * 800;

    const x = r * Math.sin(phi) * Math.cos(theta);
    const y = r * Math.sin(phi) * Math.sin(theta);
    const z = r * Math.cos(phi);

    positions.push(x, y, z);

    const brightness = 0.5 + Math.random() * 0.8;
    colors.push(brightness, brightness, brightness);
  }

  starGeometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  starGeometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));

  const starMaterial = new THREE.PointsMaterial({
    vertexColors: true,
    size: 0.7,
  });

  const stars = new THREE.Points(starGeometry, starMaterial);
  stars.renderOrder = -1;
  stars.material.depthWrite = false;
  scene.add(stars);
}
createStars();

// --- Orbit trail helper ---
function createOrbitTrail(distance, color, segments = 200) {
  const positions = [];
  const colors = [];
  const angles = [];

  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2 + 25;
    const x = Math.cos(a) * distance;
    const z = Math.sin(a) * distance;
    positions.push(x, 0, z);
    colors.push(0, 0, 0);
    angles.push(a);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));

  const material = new THREE.LineBasicMaterial({
    color,
    transparent: true,
    vertexColors: true,
    blending: THREE.AdditiveBlending,
  });

  const line = new THREE.LineLoop(geometry, material);
  line.userData = { angles, segments };
  return line;
}

// --- Glowing planet generator ---
function createGlowingPlanet(
  radius,
  distance,
  color,
  orbitSpeed,
  spinSpeed = 0.00005,
  startAngle = 0,
  project = null
) {
  const geometry = new THREE.SphereGeometry(radius, 8, 6);
  const edges = new THREE.EdgesGeometry(geometry);
  const positions = edges.attributes.position.array;
  const group = new THREE.Group();

  const baseMaterial = new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity: 0.6
  });
  const baseMesh = new THREE.LineSegments(edges, baseMaterial);
  group.add(baseMesh);

  const glowMaterial = new THREE.MeshPhysicalMaterial({
    color,
    emissive: color,
    emissiveIntensity: 1.0,
    roughness: 0.1,
    metalness: 0.3,
    transparent: true,
    opacity: 0.4
  });

  for (let i = 0; i < positions.length; i += 6) {
    const start = new THREE.Vector3(positions[i], positions[i + 1], positions[i + 2]);
    const end = new THREE.Vector3(positions[i + 3], positions[i + 4], positions[i + 5]);
    const dir = new THREE.Vector3().subVectors(end, start);
    const len = dir.length();

    const tubeRadius = radius * 0.03;
    const cylinderGeo = new THREE.CylinderGeometry(tubeRadius, tubeRadius, len, 8);
    const cylinder = new THREE.Mesh(cylinderGeo, glowMaterial);

    const midpoint = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
    cylinder.position.copy(midpoint);
    cylinder.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
    group.add(cylinder);
  }

  const pivot = new THREE.Object3D();
  pivot.rotation.x = -0.4;
  pivot.rotation.y = startAngle;
  scene.add(pivot);

  group.position.x = distance;
  pivot.add(group);

  const trail = createOrbitTrail(distance, color);
  pivot.add(trail);

  // --- Core for this planet ---
  const coreGeo = new THREE.SphereGeometry(1, 32, 24);
  const coreMat = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.6,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });

  const core = new THREE.Mesh(coreGeo, coreMat);
  core.scale.set(0, 0, 0); // start invisible
  scene.add(core);

  // --- Return a complete planet object ---
  return {
    pivot,
    mesh: group,
    orbitSpeed,
    spinSpeed,
    trail,
    size: radius,
    project,
    core,
    coreScale: 0,
    coreTargetScale: 0
  };
}

const planets = [
  createGlowingPlanet(1.3, 0, 0xffff33, 0.005, 0.0005, 0.1 * Math.PI * 2, {
    name: "Automation Engine",
    desc: "A game-like logic and automation environment allowing building of logic gates, such as SR and JK flip-flops, allowing structures such as binary counters or even small virtual computers to be constructed.",
    link: null,
    images: ["assets/images/Automation Engine 1.png","assets/images/Automation Engine 2.png","assets/images/Automation Engine 3.png?v=1","assets/images/Automation Engine 4.png","assets/images/Automation Engine 5.png"]
  }), //Yellow
  createGlowingPlanet(0.5, 6, 0x00ffff, 0.001, 0.006, 0.15 * Math.PI * 2), // Cyan
  createGlowingPlanet(0.6, 9, 0x88ff88, 0.002, 0.004, 0.75 * Math.PI * 2, {
    name: "Genetic Algorithm",
    desc: "A generational optimizer tasksed with creating the optimal schedule for a university. After initialization, it uses an evaluate, mutate, and reproduction loop to slowly attain incrementally better results.",
    link: "https://github.com/LukasHHunter/Genetic-Algorithm",
    images: ["assets/images/Genetic Algorithm 1.png","assets/images/Genetic Algorithm 2.png"]
  }), // Green
  createGlowingPlanet(0.9, 11, 0xff00ff, 0.0015, 0.004, 0.95 * Math.PI * 2), // Magenta
  createGlowingPlanet(0.6, 18, 0xb7daf0, 0.0004, 0.004, 0.05 * Math.PI * 2), // Grey
];

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

window.addEventListener("mousemove", (e) => {
  mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
});

window.addEventListener("click", () => {
  if (event.target.closest('#arrowLeft') || event.target.closest('#arrowRight')) {
    return;
  }
  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObjects(
    planets.map(p => p.mesh),
    true
  );

  if (intersects.length === 0) return;

  const clickedMesh = intersects[0].object;
  const clickedPlanet = planets.find(
    p => p.mesh === clickedMesh || p.mesh.children.includes(clickedMesh)
  );
  if (!clickedPlanet) return;

  console.log("clickedPlanet.project =", clickedPlanet.project);

  if (followPlanet === clickedPlanet) {
    deselectPlanet();
  } else {
    selectPlanet(clickedPlanet);
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    deselectPlanet();
  }
});

// --- Animate ---
function animate() {
  requestAnimationFrame(animate);

  // --- Planet rotation and trails ---
  planets.forEach((p) => {
    p.pivot.rotation.y += p.orbitSpeed;
    p.mesh.rotation.y += p.spinSpeed;

    const twoPi = Math.PI * 2;
    let planetAngle = p.pivot.rotation.y % twoPi;
    if (planetAngle < 0) planetAngle += twoPi;

    const trail = p.trail;
    const colors = trail.geometry.attributes.color.array;
    const angles = trail.userData.angles;
    const segments = trail.userData.segments;

    const fadeEnd = 0.9; // fade completes at 90% of orbit

    for (let i = 0; i < segments; i++) {
      const a = (angles[i] + planetAngle) % twoPi;
      let delta = a - planetAngle;
      if (delta < 0) delta += twoPi;

      const t = delta / twoPi;
      // fade reversed: bright behind, dim ahead
      const alpha = t < fadeEnd ? Math.pow(Math.max(0, 1 - t / fadeEnd), 1.5) : 0;

      const idx = i * 3;
      colors[idx] = alpha;
      colors[idx + 1] = alpha;
      colors[idx + 2] = alpha;
    }

    trail.geometry.attributes.color.needsUpdate = true;
  });

  // --- Camera follow logic ---
  if (followPlanet) {
      const planetPos = new THREE.Vector3();
      followPlanet.mesh.getWorldPosition(planetPos);

      const t = easeOutQuad(followSpeed);
      focusTarget.lerp(planetPos, t);
  } else {
      const t = easeOutQuad(returnSpeed);
      focusTarget.lerp(new THREE.Vector3(0, 0, 0), t);
  }

  for (const planet of planets) {
    const pos = new THREE.Vector3();
    planet.mesh.getWorldPosition(pos);
    planet.core.position.copy(pos);

    planet.coreTargetScale = (planet === followPlanet) ? planet.size * 0.7 : 0;
    planet.coreScale += (planet.coreTargetScale - planet.coreScale) * 0.15;
    planet.core.scale.set(planet.coreScale, planet.coreScale, planet.coreScale);
  }

  currentZoom += (targetZoom - currentZoom) * easeOutQuad(zoomSpeed);
  const desiredPos = focusTarget.clone().add(baseOffset.clone().multiplyScalar(currentZoom));
  camera.position.lerp(desiredPos, 0.05);
  focusTargetLerped.lerp(focusTarget, 0.05);
  camera.lookAt(focusTargetLerped);
  camera.up.set(0, 1, 0);

  // --- Render both scenes ---
  renderer.autoClear = false;
  renderer.clear();
  renderer.render(scene, camera);
}
animate();

const arrowLeft = document.getElementById("arrowLeft");
const arrowRight = document.getElementById("arrowRight");

arrowLeft.addEventListener("click", () => {
  if (!followPlanet) return;
  const i = planets.indexOf(followPlanet);
  selectPlanet(planets[(i - 1 + planets.length) % planets.length]);
});

arrowRight.addEventListener("click", () => {
  if (!followPlanet) return;
  const i = planets.indexOf(followPlanet);
  selectPlanet(planets[(i + 1) % planets.length]);
});

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

function easeOutQuad(t) {
  return 1 - (1 - t) * (1 - t);
}

document.getElementById("resetButton").addEventListener("click", () => {
  followPlanet = null;
  targetZoom = 1;
  focusTarget.set(0, 0, 0);

  left.classList.remove("visible");
  right.classList.remove("visible");
  label.classList.remove("visible");

  arrowLeft.classList.remove("visible");
  arrowRight.classList.remove("visible");
});

window.addEventListener("wheel", (event) => {
  // If the mouse is over the right panel, do NOT trigger this
  if (event.target.closest("#rightPanel")) return;

  if (event.deltaY > 0) {
    deselectPlanet();
  } else if (event.deltaY < 0 && lastTarget) {
    followPlanet = lastTarget;
    selectPlanet(lastTarget);
  }
});

let selectSound = null;
window.addEventListener("click", () => {
    if (!selectSound) {
        selectSound = new Audio("assets/audio/select.mp3");
        selectSound.volume = 0.5; // <--- adjust volume here
    }
}, { once: true });

function playSelectSound() {
    if (!selectSound) return;

    const sfx = selectSound.cloneNode(); // fresh audio instance
    sfx.volume = selectSound.volume;
    sfx.play();
}

window.addEventListener("wheel", (event) => {
  if (event.ctrlKey) {
    event.preventDefault();
  }
}, { passive: false });

function selectPlanet(planet) {
  followPlanet = planet;
  lastTarget = planet;
  targetZoom = 0.5;
  planet.coreTargetScale = planet.size * 0.7;

  const p = planet.project;
  if (p) {
    const img1 = document.getElementById("projectImg1");
    const img2 = document.getElementById("projectImg2");

    // Preload first image
    img1.src = p.images[0];
    img1.onload = () => {
      img1.style.opacity = 1;
      img2.style.opacity = 0;
    };

    currentImageIndex = 0;

    document.getElementById("projectTitle").textContent = p.name;
    document.getElementById("projectDesc").textContent = p.desc;
    const linkEl = document.getElementById("projectLink");

    if (p.link) {
      linkEl.href = p.link;
      linkEl.style.display = "inline"; // show link
    } else {
      linkEl.removeAttribute("href");
      linkEl.style.display = "none"; // hide link entirely
    }

    left.classList.add("visible");
    right.classList.add("visible");
    label.textContent = p.name;
    label.classList.add("visible");

    // Create dots
    const dotsContainer = document.getElementById("imageDots");
    dotsContainer.innerHTML = "";
    p.images.forEach((_, i) => {
      const dot = document.createElement("div");
      dot.classList.add("dot");
      if (i === 0) dot.classList.add("active");
      dotsContainer.appendChild(dot);
    });
  }

  showArrowsWithColor(planet.color);

  playSelectSound();
  currentFollowDistance = cameraRadius;
}

function deselectPlanet() {
  followPlanet = null;
  targetZoom = 1;
  focusTarget.set(0, 0, 0);

  left.classList.remove("visible");
  right.classList.remove("visible");
  label.classList.remove("visible");

  arrowLeft.classList.remove("visible");
  arrowRight.classList.remove("visible");
}

function showArrowsWithColor(color) {
  // fallback if planet.color is missing
  if (!color) color = '#ffffff';

  // force apply color to every triangle + connector
  document.querySelectorAll('#arrowLeft .tri, #arrowLeft .conn, #arrowRight .tri, #arrowRight .conn')
    .forEach(el => el.setAttribute('stroke', color));

  // optional: keep glow matching
  arrowLeft.style.color = color;
  arrowRight.style.color = color;

  arrowLeft.classList.add('visible');
  arrowRight.classList.add('visible');
}

