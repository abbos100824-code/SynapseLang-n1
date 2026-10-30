const DEFAULT_STARTER = `# LOYIHA: Neyron XOR Darvozasi (3 ta Bo'lakli Miya)
# 1. Miya bo'laklarini (kortekslarni) yaratish
block Sensory [x=-5, y=0, z=0]
block HiddenGate [x=0, y=0, z=0]
block MotorOut [x=5, y=0, z=0]

# 2. Neyron darvozalarni (gates) joylashtirish
gate X1 [block=Sensory, act=pass]
gate X2 [block=Sensory, act=pass]

gate H1 [block=HiddenGate, act=sigmoid, bias=random]
gate H2 [block=HiddenGate, act=sigmoid, bias=random]
gate H3 [block=HiddenGate, act=sigmoid, bias=random]

gate Y1 [block=MotorOut, act=sigmoid, bias=random]

# 3. Bo'laklar o'rtasida sinaptik yo'laklar (tract) tortish
tract Sensory => HiddenGate [w=random]
tract HiddenGate => MotorOut [w=random]

# 4. O'qitish ma'lumotlari (XOR mantiqiy jadvali)
data X1=0, X2=0 => Y1=0
data X1=0, X2=1 => Y1=1
data X1=1, X2=0 => Y1=1
data X1=1, X2=1 => Y1=0

# 5. Bo'laklarni o'qitish va sinash
train [epochs=600, lr=0.8]
test X1=1, X2=0
test X1=1, X2=1`;

let projects = {};
let activeProject = '';
let currentState = null;

function loadProjectsFromStorage() {
  try {
    const raw = localStorage.getItem('synapselang_v1_projects');
    projects = raw ? JSON.parse(raw) : {};
  } catch (e) { projects = {}; }
  if (Object.keys(projects).length === 0) {
    projects['XOR_Miya_Loyihasi.syn'] = DEFAULT_STARTER;
    saveProjectsToStorage();
  }
  activeProject = Object.keys(projects)[0];
  refreshProjectDropdown();
  document.getElementById('editor').value = projects[activeProject];
}

function saveProjectsToStorage() {
  try { localStorage.setItem('synapselang_v1_projects', JSON.stringify(projects)); } catch (e) {}
}

function refreshProjectDropdown() {
  const sel = document.getElementById('project-select');
  sel.innerHTML = '';
  Object.keys(projects).forEach(name => {
    const opt = document.createElement('option');
    opt.value = name;
    opt.innerText = '📁 ' + name;
    if (name === activeProject) opt.selected = true;
    sel.appendChild(opt);
  });
}

function selectProject(name) {
  if (activeProject && projects[activeProject] !== undefined) {
    projects[activeProject] = document.getElementById('editor').value;
  }
  activeProject = name;
  document.getElementById('editor').value = projects[name] || '';
  compileAndRun(false);
}

function createNewProject() {
  const name = prompt('Yangi loyiha nomini kiriting (.syn):', 'Mening_Miyam_' + (Object.keys(projects).length + 1) + '.syn');
  if (!name) return;
  const cleanName = name.endsWith('.syn') ? name : name + '.syn';
  projects[cleanName] = `# YANGI LOYIHA: ${cleanName}\nblock InputBlock [x=-4, y=0, z=0]\nblock OutputBlock [x=4, y=0, z=0]\n\ngate A [block=InputBlock, act=pass]\ngate B [block=OutputBlock, act=sigmoid, bias=random]\n\npath A -> B [w=random]\n\ndata A=1 => B=1\ndata A=0 => B=0\ntrain [epochs=300, lr=0.6]\ntest A=1\n`;
  activeProject = cleanName;
  saveProjectsToStorage();
  refreshProjectDropdown();
  document.getElementById('editor').value = projects[cleanName];
  compileAndRun(false);
}

function saveCurrentProject() {
  if (!activeProject) return;
  projects[activeProject] = document.getElementById('editor').value;
  saveProjectsToStorage();
  compileAndRun(false);
}

function deleteCurrentProject() {
  if (Object.keys(projects).length <= 1) {
    document.getElementById('editor').value = '';
    compileAndRun(false);
    return;
  }
  delete projects[activeProject];
  activeProject = Object.keys(projects)[0];
  saveProjectsToStorage();
  refreshProjectDropdown();
  document.getElementById('editor').value = projects[activeProject];
  compileAndRun(false);
}

function ins(txt) {
  const ed = document.getElementById('editor');
  const s = ed.selectionStart;
  ed.value = ed.value.substring(0, s) + txt + ed.value.substring(ed.selectionEnd);
  ed.focus();
}

function switchTab(tab, btn) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('view-' + tab).classList.add('active');
  if (btn) btn.classList.add('active');
  if (tab === '3d') { resize3D(); render3DBrain(currentState); }
}

function compileAndRun(goTo3D = true) {
  const code = document.getElementById('editor').value;
  if (activeProject) {
    projects[activeProject] = code;
    saveProjectsToStorage();
  }
  if (!window.rustExecute) return;
  currentState = window.rustExecute(code);

  const term = document.getElementById('terminal-out');
  term.innerText = (currentState.logs || []).join('\n') || 'Loyiha bo\'sh. Kod yozib QURISH tugmasini bosing.';
  term.scrollTop = term.scrollHeight;

  const bCount = Object.keys(currentState.blocks || {}).length;
  const gCount = (currentState.gates || []).length;
  const pCount = (currentState.pathways || []).length;
  document.getElementById('hud-title').innerText = 'Loyiha: ' + (activeProject || 'Yangi');
  document.getElementById('hud-stats').innerText = `Bo'laklar: ${bCount} | Darvozalar: ${gCount} | Yo'laklar: ${pCount}`;
  document.getElementById('hud-loss').innerText = currentState.total_epochs > 0
    ? `Davrlar: ${currentState.total_epochs} | Xatolik (Loss): ${currentState.last_loss.toFixed(5)}`
    : `O'qitish xatoligi (Loss): —`;

  render3DBrain(currentState);
  if (goTo3D) switchTab('3d', document.querySelectorAll('.nav-btn')[2]);
}

function runTerminalCommand() {
  const inp = document.getElementById('term-cmd');
  const v = inp.value.trim();
  if (!v) return;
  document.getElementById('editor').value += '\n' + v;
  inp.value = '';
  compileAndRun(false);
}

function trainMoreFrom3D() {
  document.getElementById('editor').value += '\ntrain [epochs=200, lr=0.5]';
  compileAndRun(false);
}

let scene, camera, renderer, gateMeshes = {}, pulseParticles = [], angleCam = 0.4, isDragging = false, prevX = 0;

function init3D() {
  const c = document.getElementById('canvas-container');
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(60, c.clientWidth / c.clientHeight, 0.1, 1000);
  camera.position.set(0, 6, 15);
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(c.clientWidth, c.clientHeight);
  c.appendChild(renderer.domElement);

  const light = new THREE.PointLight(0xffffff, 1.5, 120);
  light.position.set(12, 18, 14);
  scene.add(light);
  scene.add(new THREE.AmbientLight(0x404060, 1.6));

  c.addEventListener('pointerdown', e => { isDragging = true; prevX = e.clientX; });
  window.addEventListener('pointerup', () => isDragging = false);
  window.addEventListener('pointermove', e => {
    if (isDragging) { angleCam -= (e.clientX - prevX) * 0.01; prevX = e.clientX; }
  });

  function animate() {
    requestAnimationFrame(animate);
    if (!isDragging) angleCam += 0.003;
    camera.position.x = 15 * Math.sin(angleCam);
    camera.position.z = 15 * Math.cos(angleCam);
    camera.lookAt(0, 0, 0);

    Object.values(gateMeshes).forEach(m => { m.rotation.y += 0.015; });
    for (let i = pulseParticles.length - 1; i >= 0; i--) {
      const p = pulseParticles[i];
      p.t += 0.03;
      if (p.t >= 1.0) { scene.remove(p.mesh); pulseParticles.splice(i, 1); }
      else p.mesh.position.lerpVectors(p.start, p.end, p.t);
    }
    renderer.render(scene, camera);
  }
  animate();
}

function resize3D() {
  const c = document.getElementById('canvas-container');
  if (!renderer || c.clientWidth === 0) return;
  camera.aspect = c.clientWidth / c.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(c.clientWidth, c.clientHeight);
}

function render3DBrain(state) {
  if (!scene) return;
  scene.children.filter(c => c.userData.dynamic).forEach(c => scene.remove(c));
  gateMeshes = {};
  pulseParticles = [];
  if (!state) return;

  // 1. Miya Bo'laklarini (Blocks) 3D karkas quti sifatida chizish
  Object.values(state.blocks || {}).forEach(b => {
    const boxGeom = new THREE.BoxGeometry(2.6, 6.2, 3.2);
    const edges = new THREE.EdgesGeometry(boxGeom);
    const color = b.frozen ? 0x64748b : 0x1e3a8a;
    const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color }));
    line.position.set(b.center[0], b.center[1], b.center[2]);
    line.userData.dynamic = true;
    scene.add(line);
  });

  // 2. Neyron Darvozalarni (Gates) chizish
  (state.gates || []).forEach(g => {
    const r = 0.55 + Math.min(0.45, Math.abs(g.state) * 0.35);
    const geom = g.act === 'pass'
      ? new THREE.OctahedronGeometry(r, 1)
      : g.act === 'relu' || g.act === 'leaky_relu'
      ? new THREE.BoxGeometry(r*1.2, r*1.2, r*1.2)
      : new THREE.SphereGeometry(r, 18, 18);

    const color = g.state > 0.5 ? 0x00f0ff : g.act === 'pass' ? 0xffbe0b : 0x10b981;
    const mesh = new THREE.Mesh(geom, new THREE.MeshStandardMaterial({
      color, emissive: color, emissiveIntensity: 0.35 + Math.min(0.5, Math.abs(g.state) * 0.4)
    }));
    mesh.position.set(g.pos_3d[0], g.pos_3d[1], g.pos_3d[2]);
    mesh.userData.dynamic = true;
    scene.add(mesh);
    gateMeshes[g.id] = mesh;
  });

  // 3. Sinaptik Yo'laklarni (Pathways) chizish
  (state.pathways || []).forEach(p => {
    const a = gateMeshes[p.from], b = gateMeshes[p.to];
    if (a && b) {
      const isExcitatory = p.weight >= 0;
      const lineColor = isExcitatory ? 0x10b981 : 0xef4444;
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([a.position, b.position]),
        new THREE.LineBasicMaterial({ color: lineColor })
      );
      line.userData.dynamic = true;
      scene.add(line);

      if (Math.abs(p.last_signal) > 0.05) {
        const pm = new THREE.Mesh(
          new THREE.SphereGeometry(0.18, 8, 8),
          new THREE.MeshBasicMaterial({ color: isExcitatory ? 0x00f0ff : 0xff4d6d })
        );
        pm.userData.dynamic = true;
        scene.add(pm);
        pulseParticles.push({ mesh: pm, start: a.position.clone(), end: b.position.clone(), t: Math.random() * 0.5 });
      }
    }
  });
}

window.onload = () => {
  init3D();
  loadProjectsFromStorage();
};
window.onresize = resize3D;
