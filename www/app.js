const TEMPLATES = {
  smart_assistant: `# 1. AQLLI MATN VA AVTO-VAZIFA AGENTLARI (v0.2)
node Boss [type=boss, op=router]

node ChatAgent [type=worker, match=salom|qalay|isming|kim, reply="Salom Abbos! Men SynapseLang neyron ongiman."]
node MathAgent [type=worker, match=hisob|nechchi|+|-|*|/, task=calc, reply="Matematik yechim:"]
node AutoGuard [type=worker, match=avto|tekshir|scan|xavf, task=automonitor, reply="Avto-Skayner: Tizim toza, RAM sarfi 2.1 MB."]
node CoreMemory [type=memory, op=accumulate]

synapse Boss -> ChatAgent [weight=0.9]
synapse Boss -> MathAgent [weight=0.95]
synapse Boss -> AutoGuard [weight=0.85]
synapse ChatAgent -> CoreMemory [weight=1.0]
synapse MathAgent -> CoreMemory [weight=1.0]
synapse AutoGuard -> CoreMemory [weight=1.0]

ask "Salom! Menga 25 * 4 ni hisobla va tizimni avto tekshir"`,

  boss_team: `# 2. BOSS VA TEAM\nnode Boss [type=boss, op=pass, threshold=0.05]\nnode MathAgent [type=worker, op=scale, factor=1.8]\nnode CodeAgent [type=worker, op=relu, bias=0.5]\nnode LogicAgent [type=worker, op=tanh, factor=1.2]\nnode CoreMemory [type=memory, op=accumulate]\nsynapse Boss -> MathAgent [weight=0.9]\nsynapse Boss -> CodeAgent [weight=0.75]\nsynapse Boss -> LogicAgent [weight=0.85]\nsynapse MathAgent -> CoreMemory [weight=1.0]\nsynapse CodeAgent -> CoreMemory [weight=1.0]\nsynapse LogicAgent -> CoreMemory [weight=1.0]\npulse Boss 4.0\nrun 3`,

  oscillator: `# 3. SIKLIK ONG\nnode CoreBoss [type=boss, op=pass, decay=0.4]\nnode AlphaNode [type=worker, op=sin, factor=1.2]\nnode BetaNode [type=worker, op=scale, factor=0.9]\nsynapse CoreBoss -> AlphaNode [weight=0.95]\nsynapse AlphaNode -> BetaNode [weight=0.9]\nsynapse BetaNode -> CoreBoss [weight=0.75]\npulse CoreBoss 5.0\nrun 4`
};

let currentState = null, autoTimer = null;

function evalMathJS(text) {
  const t = text.split(/\s+/);
  for (let i=0; i<t.length; i++) {
    const a = parseFloat(t[i]);
    if (!isNaN(a) && i+2 < t.length) {
      const b = parseFloat(t[i+2]);
      if (!isNaN(b)) {
        const op = t[i+1];
        const r = op==='+' ? a+b : op==='-' ? a-b : (op==='*'||op==='x') ? a*b : (op==='/'&&b!==0) ? a/b : null;
        if (r !== null) return `${a} ${op} ${b} = ${r.toFixed(2)}`;
      }
    }
  }
  return "Misolni '25 * 4' ko'rinishida yozing.";
}

function fallbackExecute(script) {
  const nodes = {}, synapses = [], logs = [], ai_replies = []; let tick = 0, idx = 0;
  function stepSim() {
    tick++; logs.push(`--- [ TICK #${tick} ] ---`);
    synapses.forEach(syn => {
      const src = nodes[syn.from];
      if (src && Math.abs(src.state) > (src.attrs.threshold || 0)) {
        const sig = src.state * syn.weight; syn.active_signal = sig;
        if (nodes[syn.to]) { nodes[syn.to].inbox += sig; logs.push(`  ${syn.from} -> ${syn.to} [+${sig.toFixed(2)} | w:${syn.weight.toFixed(2)}]`); }
      } else syn.active_signal = 0;
    });
    Object.values(nodes).forEach(n => {
      const raw = n.state * (n.attrs.decay ?? 0.2) + n.inbox; n.inbox = 0;
      const b = n.attrs.bias || 0, f = n.attrs.factor ?? 1;
      n.state = n.op==='scale' ? raw*f+b : n.op==='relu' ? Math.max(0,raw+b) : n.op==='tanh' ? Math.tanh(raw+b) : n.op==='accumulate' ? (n.memory_val+=raw) : raw+b;
      if (Math.abs(n.state) > 0.001) logs.push(`  * [${n.id}] state=${n.state.toFixed(3)}`);
    });
  }
  function askQuery(q) {
    logs.push(`\n🗣 [FOYDALANUVCHI]: "${q}"`);
    const ql = q.toLowerCase(), matched = [];
    Object.values(nodes).forEach(n => { if (n.node_type==='boss') n.state = 5.0; });
    Object.values(nodes).forEach(n => {
      if (n.match_keys) {
        for (const k of n.match_keys.split('|')) {
          if (k && ql.includes(k.toLowerCase())) { n.inbox += 4.5; matched.push(n.id); break; }
        }
      }
    });
    synapses.forEach(s => { if (matched.includes(s.to)) { s.weight = Math.min(2.0, s.weight + 0.05); s.active_signal = 5.0 * s.weight; } });
    matched.forEach(id => {
      const n = nodes[id];
      const extra = n.task_type==='calc' ? evalMathJS(ql) : n.task_type==='automonitor' ? `[Faol tugunlar: ${Object.keys(nodes).length}, Davr: #${tick+1}]` : '';
      const msg = `🤖 [${n.id}]: ${n.reply_text || ''} ${extra}`.trim();
      ai_replies.push(msg); logs.push(msg);
    });
    if (!matched.length) logs.push(`🤖 [Boss]: Mos agent topilmadi, impuls umumiy tarmoqqa uzatildi.`);
    stepSim();
  }
  script.split('\n').forEach(raw => {
    const line = raw.trim(); if (!line || line.startsWith('#')) return;
    const p = line.split(/\s+/), attrs = {}, m = line.match(/\[(.*?)\]/);
    if (m) m[1].split(',').forEach(kv => { const [k,v] = kv.split('=').map(s=>s.trim().replace(/^"|"$/g,'')); attrs[k] = isNaN(Number(v)) ? v : Number(v); });
    if (p[0] === 'node' && p[1]) {
      const id = p[1], t = attrs.type || 'worker', op = attrs.op || 'pass';
      const pos = (t==='boss') ? [0,0,0] : [Math.cos(idx*1.35)*(t==='memory'?7.5:5), ((idx%3)-1)*2.2, Math.sin(idx*1.35)*(t==='memory'?7.5:5)];
      idx++; nodes[id] = { id, node_type: t, op, match_keys: attrs.match||'', reply_text: attrs.reply||'', task_type: attrs.task||'', state: 0, inbox: 0, memory_val: 0, pos_3d: pos, attrs };
      logs.push(`+ [NODE] '${id}' | type=${t}`);
    } else if (p[0] === 'synapse' && p[2] === '->') {
      const from = p[1], to = p[3].split('[')[0], weight = attrs.weight ?? 1.0;
      synapses.push({ from, to, weight, active_signal: 0 });
    } else if (p[0] === 'pulse' && nodes[p[1]]) {
      const val = parseFloat(p[2]) || 1.0; nodes[p[1]].state += val;
      logs.push(`⚡ [PULSE] '${p[1]}' <= +${val.toFixed(2)}`);
    } else if (p[0] === 'ask') {
      askQuery(line.replace(/^ask\s+/i, '').replace(/^"|"$/g, ''));
    } else if (p[0] === 'run') {
      const steps = parseInt(p[1]) || 1; for (let s=0; s<steps; s++) stepSim();
    } else {
      askQuery(line);
    }
  });
  return { nodes, synapses, terminal_logs: logs, ai_replies, tick_count: tick };
}

function loadTemplate(name) { document.getElementById('editor').value = TEMPLATES[name]; executeCode(false); }
function newCustomFile() { document.getElementById('editor').value = `# Yangi Aqlli Agent\nnode Boss [type=boss]\nnode MyBot [type=worker, match=salom|yordam, reply="Salom! Men yangi agentman."]\nsynapse Boss -> MyBot [weight=1.0]\nask "salom"\n`; }
function insertText(txt) { const ed = document.getElementById('editor'), s = ed.selectionStart; ed.value = ed.value.substring(0, s) + txt + ed.value.substring(ed.selectionEnd); ed.focus(); }
function switchTab(tab, btn) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('view-' + tab).classList.add('active');
  if (btn) btn.classList.add('active');
  if (tab === '3d') { resize3D(); render3DGraph(currentState); }
}
function executeCode(goTo3D = true) {
  const runFn = window.rustExecute || fallbackExecute;
  currentState = runFn(document.getElementById('editor').value);
  const term = document.getElementById('terminal-out');
  term.innerText = currentState.terminal_logs.join('\n');
  term.scrollTop = term.scrollHeight;
  document.getElementById('hud-stats').innerText = `Tugunlar: ${Object.keys(currentState.nodes).length} | Sinapslar: ${currentState.synapses.length} | Davr: ${currentState.tick_count}`;
  const lastReply = (currentState.ai_replies || []).slice(-1)[0] || '';
  document.getElementById('hud-reply').innerText = lastReply;
  render3DGraph(currentState);
  if (goTo3D) switchTab('3d', document.querySelectorAll('.nav-btn')[2]);
}
function runTerminalCmd() {
  const inp = document.getElementById('term-cmd'), v = inp.value.trim(); if (!v) return;
  const cmd = (v.startsWith('pulse ') || v.startsWith('run ') || v.startsWith('node ') || v.startsWith('synapse ') || v.startsWith('ask ')) ? v : `ask "${v}"`;
  document.getElementById('editor').value += '\n' + cmd; inp.value = ''; executeCode(false);
}
function stepFrom3D() {
  document.getElementById('editor').value += `\nask "avto tekshir va hisob 12 + 8"`; executeCode(false);
}
function toggleAutoPulse() {
  const btn = document.getElementById('auto-btn');
  if (autoTimer) { clearInterval(autoTimer); autoTimer = null; btn.style.background = 'rgba(0,240,255,0.15)'; }
  else { btn.style.background = '#059669'; autoTimer = setInterval(stepFrom3D, 2000); }
}

let scene, camera, renderer, nodeMeshes = {}, pulseParticles = [], angleCam = 0.5, isDragging = false, prevX = 0;

function init3D() {
  const c = document.getElementById('canvas-container');
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(60, c.clientWidth / c.clientHeight, 0.1, 1000);
  camera.position.set(0, 6, 13);
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(c.clientWidth, c.clientHeight);
  c.appendChild(renderer.domElement);
  const light = new THREE.PointLight(0xffffff, 1.4, 100); light.position.set(10, 15, 10); scene.add(light);
  scene.add(new THREE.AmbientLight(0x404060, 1.5));
  c.addEventListener('pointerdown', e => { isDragging = true; prevX = e.clientX; });
  window.addEventListener('pointerup', () => isDragging = false);
  window.addEventListener('pointermove', e => { if (isDragging) { angleCam -= (e.clientX - prevX) * 0.01; prevX = e.clientX; } });

  function animate() {
    requestAnimationFrame(animate);
    if (!isDragging) angleCam += 0.004;
    camera.position.x = 13 * Math.sin(angleCam); camera.position.z = 13 * Math.cos(angleCam); camera.lookAt(0, 0, 0);
    Object.values(nodeMeshes).forEach(m => { m.rotation.y += 0.015; });
    for (let i = pulseParticles.length - 1; i >= 0; i--) {
      const p = pulseParticles[i]; p.t += 0.035;
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
  camera.aspect = c.clientWidth / c.clientHeight; camera.updateProjectionMatrix();
  renderer.setSize(c.clientWidth, c.clientHeight);
}

function render3DGraph(state) {
  if (!scene || !state) return;
  Object.values(nodeMeshes).forEach(m => scene.remove(m));
  scene.children.filter(c => c.userData.isSynapse).forEach(c => scene.remove(c));
  nodeMeshes = {};
  Object.values(state.nodes).forEach(n => {
    const isBoss = n.node_type === 'boss', isMem = n.node_type === 'memory';
    const r = (isBoss ? 1.05 : isMem ? 0.85 : 0.65) * Math.min(1.6, 1 + Math.abs(n.state)*0.08);
    const geom = isBoss ? new THREE.OctahedronGeometry(r, 1) : isMem ? new THREE.BoxGeometry(r*1.2, r*1.2, r*1.2) : new THREE.SphereGeometry(r, 16, 16);
    const color = isBoss ? 0xffbe0b : isMem ? 0xa855f7 : (n.state > 1.0 ? 0x00f0ff : 0x10b981);
    const mesh = new THREE.Mesh(geom, new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.45 }));
    mesh.position.set(n.pos_3d[0], n.pos_3d[1], n.pos_3d[2]);
    scene.add(mesh); nodeMeshes[n.id] = mesh;
  });
  state.synapses.forEach(s => {
    const a = nodeMeshes[s.from], b = nodeMeshes[s.to];
    if (a && b) {
      const act = Math.abs(s.active_signal) > 0.01;
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([a.position, b.position]), new THREE.LineBasicMaterial({ color: act ? 0x00f0ff : 0x334155 }));
      line.userData.isSynapse = true; scene.add(line);
      if (act) {
        const pm = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 8), new THREE.MeshBasicMaterial({ color: 0x00f0ff }));
        scene.add(pm); pulseParticles.push({ mesh: pm, start: a.position.clone(), end: b.position.clone(), t: 0 });
      }
    }
  });
}

window.onload = () => { init3D(); loadTemplate('smart_assistant'); };
window.onresize = resize3D;
