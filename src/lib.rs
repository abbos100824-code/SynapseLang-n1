use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use wasm_bindgen::prelude::*;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BrainBlock {
    pub id: String,
    pub center: [f32; 3],
    pub frozen: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NeuralGate {
    pub id: String,
    pub block: String,
    pub act: String,
    pub bias: f64,
    pub state: f64,
    pub net: f64,
    pub grad: f64,
    pub pos_3d: [f32; 3],
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Pathway {
    pub from: String,
    pub to: String,
    pub weight: f64,
    pub last_signal: f64,
    pub plastic: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DataSample {
    pub inputs: Vec<(String, f64)>,
    pub targets: Vec<(String, f64)>,
}

#[derive(Debug, Default, Serialize, Deserialize)]
pub struct SynapseEngine {
    pub blocks: HashMap<String, BrainBlock>,
    pub gates: Vec<NeuralGate>,
    pub gate_map: HashMap<String, usize>,
    pub pathways: Vec<Pathway>,
    pub dataset: Vec<DataSample>,
    pub logs: Vec<String>,
    pub last_loss: f64,
    pub total_epochs: usize,
    rng_seed: u64,
}

impl SynapseEngine {
    pub fn new() -> Self {
        Self {
            rng_seed: 0x853c49e6748fea9b,
            ..Default::default()
        }
    }

    fn next_rand(&mut self) -> f64 {
        let mut x = self.rng_seed;
        x ^= x << 13;
        x ^= x >> 7;
        x ^= x << 17;
        self.rng_seed = x;
        let norm = (x % 10000) as f64 / 5000.0 - 1.0; // [-1.0, 1.0]
        norm * 0.8
    }

    fn log(&mut self, msg: String) {
        self.logs.push(msg);
    }

    fn activate(x: f64, act: &str) -> f64 {
        match act {
            "sigmoid" => 1.0 / (1.0 + (-x).exp()),
            "tanh" => x.tanh(),
            "relu" => x.max(0.0),
            "leaky_relu" => if x > 0.0 { x } else { 0.05 * x },
            "step" => if x >= 0.0 { 1.0 } else { 0.0 },
            _ => x, // "pass" yoki "linear"
        }
    }

    fn d_activate(state: f64, act: &str) -> f64 {
        match act {
            "sigmoid" => state * (1.0 - state),
            "tanh" => 1.0 - state * state,
            "relu" => if state > 0.0 { 1.0 } else { 0.0 },
            "leaky_relu" => if state > 0.0 { 1.0 } else { 0.05 },
            "step" => 0.1,
            _ => 1.0,
        }
    }

    pub fn execute(&mut self, script: &str) {
        for (line_idx, raw_line) in script.lines().enumerate() {
            let line = raw_line.trim();
            if line.is_empty() || line.starts_with('#') || line.starts_with("//") {
                continue;
            }
            let parts: Vec<&str> = line.split_whitespace().collect();
            let cmd = parts[0].to_lowercase();

            match cmd.as_str() {
                "block" | "region" if parts.len() >= 2 => {
                    let id = parts[1].to_string();
                    let (s_map, n_map) = Self::parse_attrs(line);
                    let x = *n_map.get("x").unwrap_or(&((self.blocks.len() as f64 - 1.0) * 5.0)) as f32;
                    let y = *n_map.get("y").unwrap_or(&0.0) as f32;
                    let z = *n_map.get("z").unwrap_or(&0.0) as f32;
                    let frozen = s_map.get("learn").map(|v| v == "false").unwrap_or(false);
                    self.blocks.insert(id.clone(), BrainBlock { id: id.clone(), center: [x, y, z], frozen });
                    self.log(format!("📦 [BLOCK] '{}' markaz=({:.1}, {:.1}, {:.1}) | muzlatilgan={}", id, x, y, z, frozen));
                }
                "gate" | "neuron" if parts.len() >= 2 => {
                    let id = parts[1].to_string();
                    let (s_map, n_map) = Self::parse_attrs(line);
                    let block_id = s_map.get("block").cloned().unwrap_or_else(|| "Default".into());
                    let act = s_map.get("act").cloned().unwrap_or_else(|| "sigmoid".into());
                    let bias = if s_map.get("bias").map(|v| v == "random").unwrap_or(false) {
                        self.next_rand() * 0.3
                    } else {
                        *n_map.get("bias").unwrap_or(&0.0)
                    };

                    if !self.blocks.contains_key(&block_id) {
                        let bx = (self.blocks.len() as f32 - 1.0) * 5.0;
                        self.blocks.insert(block_id.clone(), BrainBlock {
                            id: block_id.clone(),
                            center: [bx, 0.0, 0.0],
                            frozen: false,
                        });
                    }
                    let b_center = self.blocks[&block_id].center;
                    let count_in_block = self.gates.iter().filter(|g| g.block == block_id).count() as f32;
                    let offset_y = (count_in_block - 1.0) * 2.2;
                    let offset_z = ((count_in_block as i32 % 2) as f32 - 0.5) * 1.5;

                    let idx = self.gates.len();
                    self.gate_map.insert(id.clone(), idx);
                    self.gates.push(NeuralGate {
                        id: id.clone(),
                        block: block_id.clone(),
                        act: act.clone(),
                        bias,
                        state: 0.0,
                        net: 0.0,
                        grad: 0.0,
                        pos_3d: [b_center[0], b_center[1] + offset_y, b_center[2] + offset_z],
                    });
                    self.log(format!("🔘 [GATE] '{}' | bo'lak={} | act={} | bias={:+.3}", id, block_id, act, bias));
                }
                "path" | "synapse" if parts.len() >= 4 && parts[2] == "->" => {
                    let from = parts[1].to_string();
                    let to = parts[3].split('[').next().unwrap_or("").trim().to_string();
                    let (s_map, n_map) = Self::parse_attrs(line);
                    let w = if s_map.get("w").map(|v| v == "random").unwrap_or(false) {
                        self.next_rand()
                    } else {
                        *n_map.get("w").or_else(|| n_map.get("weight")).unwrap_or(&0.5)
                    };
                    let plastic = s_map.get("learn").map(|v| v != "false").unwrap_or(true);
                    self.pathways.push(Pathway { from: from.clone(), to: to.clone(), weight: w, last_signal: 0.0, plastic });
                    self.log(format!("🔗 [PATH] {} -> {} [w={:+.3}]", from, to, w));
                }
                "tract" if parts.len() >= 4 && parts[2] == "=>" => {
                    let from_block = parts[1];
                    let to_block = parts[3].split('[').next().unwrap_or("").trim();
                    let (s_map, n_map) = Self::parse_attrs(line);
                    let is_rand = s_map.get("w").map(|v| v == "random").unwrap_or(true);
                    let fixed_w = *n_map.get("w").unwrap_or(&0.5);

                    let src_ids: Vec<String> = self.gates.iter().filter(|g| g.block == from_block).map(|g| g.id.clone()).collect();
                    let dst_ids: Vec<String> = self.gates.iter().filter(|g| g.block == to_block).map(|g| g.id.clone()).collect();
                    let mut count = 0;
                    for s in &src_ids {
                        for d in &dst_ids {
                            let w = if is_rand { self.next_rand() } else { fixed_w };
                            self.pathways.push(Pathway { from: s.clone(), to: d.clone(), weight: w, last_signal: 0.0, plastic: true });
                            count += 1;
                        }
                    }
                    self.log(format!("🛤️ [TRACT] {} => {} ({} ta sinaps yo'lak ulandi)", from_block, to_block, count));
                }
                "freeze" if parts.len() >= 2 => {
                    if let Some(b) = self.blocks.get_mut(parts[1]) {
                        b.frozen = true;
                        self.log(format!("❄️ [FREEZE] '{}' bo'lagi muzlatildi (o'qitishda o'zgarmaydi)", parts[1]));
                    }
                }
                "unfreeze" if parts.len() >= 2 => {
                    if let Some(b) = self.blocks.get_mut(parts[1]) {
                        b.frozen = false;
                        self.log(format!("🔥 [UNFREEZE] '{}' bo'lagi o'qitish uchun ochildi", parts[1]));
                    }
                }
                "data" | "sample" => {
                    if let Some((ins, outs)) = Self::parse_data_line(line) {
                        self.dataset.push(DataSample { inputs: ins, targets: outs });
                    }
                }
                "train" => {
                    let (s_map, n_map) = Self::parse_attrs(line);
                    let epochs = *n_map.get("epochs").unwrap_or(&200.0) as usize;
                    let lr = *n_map.get("lr").unwrap_or(&0.4);
                    let only_block = s_map.get("block").cloned();
                    self.train_network(epochs, lr, only_block);
                }
                "test" | "forward" | "eval" => {
                    let pairs = Self::parse_kv_pairs(line);
                    self.forward_pass(&pairs);
                    let out_str: Vec<String> = self.gates.iter().map(|g| format!("{}={:.3}", g.id, g.state)).collect();
                    self.log(format!("⚡ [TEST] Kirish: {:?} => Natija: [{}]", pairs, out_str.join(", ")));
                }
                _ => {
                    self.log(format!("⚠️ Noma'lum buyruq (qator {}): {}", line_idx + 1, parts[0]));
                }
            }
        }
    }

    pub fn forward_pass(&mut self, inputs: &[(String, f64)]) {
        for g in &mut self.gates {
            g.net = g.bias;
            g.state = 0.0;
        }
        let mut is_input = vec![false; self.gates.len()];
        for (id, val) in inputs {
            if let Some(&idx) = self.gate_map.get(id) {
                self.gates[idx].state = *val;
                is_input[idx] = true;
            }
        }

        for i in 0..self.gates.len() {
            if !is_input[i] {
                let act = self.gates[i].act.clone();
                let net = self.gates[i].net;
                self.gates[i].state = Self::activate(net, &act);
            }
            let src_id = self.gates[i].id.clone();
            let src_state = self.gates[i].state;

            for p in &mut self.pathways {
                if p.from == src_id {
                    let sig = src_state * p.weight;
                    p.last_signal = sig;
                    if let Some(&dst_idx) = self.gate_map.get(&p.to) {
                        self.gates[dst_idx].net += sig;
                    }
                }
            }
        }
    }

    pub fn train_network(&mut self, epochs: usize, lr: f64, target_block: Option<String>) {
        if self.dataset.is_empty() {
            self.log("⚠️ [TRAIN] O'qitish uchun 'data' namunalari kiritilmagan!".into());
            return;
        }
        let samples = self.dataset.clone();
        let mut initial_loss = 0.0;
        let mut final_loss = 0.0;

        for ep in 0..epochs {
            let mut epoch_loss = 0.0;
            for sample in &samples {
                self.forward_pass(&sample.inputs);

                for g in &mut self.gates {
                    g.grad = 0.0;
                }

                for (t_id, t_val) in &sample.targets {
                    if let Some(&idx) = self.gate_map.get(t_id) {
                        let out = self.gates[idx].state;
                        let err = *t_val - out;
                        epoch_loss += err * err;
                        let act = self.gates[idx].act.clone();
                        self.gates[idx].grad = err * Self::d_activate(out, &act);
                    }
                }

                for i in (0..self.gates.len()).rev() {
                    let dst_id = self.gates[i].id.clone();
                    let dst_grad = self.gates[i].grad;
                    if dst_grad.abs() < 1e-12 {
                        continue;
                    }
                    for p in &self.pathways {
                        if p.to == dst_id {
                            if let Some(&src_idx) = self.gate_map.get(&p.from) {
                                let src_state = self.gates[src_idx].state;
                                let src_act = self.gates[src_idx].act.clone();
                                self.gates[src_idx].grad += dst_grad * p.weight * Self::d_activate(src_state, &src_act);
                            }
                        }
                    }
                }

                for p in &mut self.pathways {
                    if !p.plastic { continue; }
                    if let (Some(&s_idx), Some(&d_idx)) = (self.gate_map.get(&p.from), self.gate_map.get(&p.to)) {
                        let dst_block = &self.gates[d_idx].block;
                        let is_frozen = self.blocks.get(dst_block).map(|b| b.frozen).unwrap_or(false);
                        if is_frozen { continue; }
                        if let Some(ref tb) = target_block {
                            if dst_block != tb { continue; }
                        }
                        let grad = self.gates[d_idx].grad;
                        let src_state = self.gates[s_idx].state;
                        p.weight += lr * grad * src_state;
                    }
                }

                for i in 0..self.gates.len() {
                    let b_name = &self.gates[i].block;
                    let is_frozen = self.blocks.get(b_name).map(|b| b.frozen).unwrap_or(false);
                    if is_frozen { continue; }
                    if let Some(ref tb) = target_block {
                        if b_name != tb { continue; }
                    }
                    self.gates[i].bias += lr * self.gates[i].grad;
                }
            }
            epoch_loss /= samples.len() as f64;
            if ep == 0 { initial_loss = epoch_loss; }
            final_loss = epoch_loss;
        }

        self.total_epochs += epochs;
        self.last_loss = final_loss;
        self.log(format!(
            "🎓 [TRAIN] {} davr (lr={}) yakunlandi | Xatolik (Loss): {:.4} -> {:.4}",
            epochs, lr, initial_loss, final_loss
        ));
    }

    fn parse_attrs(line: &str) -> (HashMap<String, String>, HashMap<String, f64>) {
        let mut s_map = HashMap::new();
        let mut n_map = HashMap::new();
        if let (Some(a), Some(b)) = (line.find('['), line.rfind(']')) {
            for pair in line[a + 1..b].split(',') {
                let kv: Vec<&str> = pair.split('=').map(|s| s.trim()).collect();
                if kv.len() == 2 {
                    let clean_v = kv[1].trim_matches('"');
                    if let Ok(v) = clean_v.parse::<f64>() {
                        n_map.insert(kv[0].into(), v);
                    } else {
                        s_map.insert(kv[0].into(), clean_v.into());
                    }
                }
            }
        }
        (s_map, n_map)
    }

    fn parse_kv_pairs(segment: &str) -> Vec<(String, f64)> {
        let mut res = Vec::new();
        let cleaned = segment
            .trim_start_matches("data")
            .trim_start_matches("sample")
            .trim_start_matches("test")
            .trim_start_matches("forward")
            .trim_start_matches("eval")
            .trim();
        for item in cleaned.split(',') {
            let kv: Vec<&str> = item.split('=').map(|s| s.trim()).collect();
            if kv.len() == 2 {
                if let Ok(v) = kv[1].parse::<f64>() {
                    let key = kv[0].split_whitespace().last().unwrap_or(kv[0]).to_string();
                    res.push((key, v));
                }
            }
        }
        res
    }

    fn parse_data_line(line: &str) -> Option<(Vec<(String, f64)>, Vec<(String, f64)>)> {
        let parts: Vec<&str> = line.split("=>").collect();
        if parts.len() == 2 {
            let ins = Self::parse_kv_pairs(parts[0]);
            let outs = Self::parse_kv_pairs(parts[1]);
            if !ins.is_empty() && !outs.is_empty() {
                return Some((ins, outs));
            }
        }
        None
    }
}

#[wasm_bindgen]
pub fn run_synapse_script(script: &str) -> String {
    let mut eng = SynapseEngine::new();
    eng.execute(script);
    serde_json::to_string(&eng).unwrap_or_else(|_| "{}".into())
}
