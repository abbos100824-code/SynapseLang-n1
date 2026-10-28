use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use wasm_bindgen::prelude::*;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Node {
    pub id: String,
    pub node_type: String,
    pub op: String,
    pub match_keys: String,
    pub reply_text: String,
    pub task_type: String,
    pub state: f64,
    pub inbox: f64,
    pub memory_val: f64,
    pub pos_3d: [f32; 3],
    pub attrs: HashMap<String, f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Synapse {
    pub from: String,
    pub to: String,
    pub weight: f64,
    pub active_signal: f64,
}

#[derive(Debug, Default, Serialize, Deserialize)]
pub struct SynapseRuntime {
    pub nodes: HashMap<String, Node>,
    pub synapses: Vec<Synapse>,
    pub terminal_logs: Vec<String>,
    pub ai_replies: Vec<String>,
    pub tick_count: usize,
}

impl SynapseRuntime {
    pub fn log(&mut self, msg: String) {
        self.terminal_logs.push(msg);
    }

    pub fn execute_script(&mut self, script: &str) {
        let mut node_index = 0usize;
        for (line_num, raw_line) in script.lines().enumerate() {
            let line = raw_line.trim();
            if line.is_empty() || line.starts_with('#') || line.starts_with("//") {
                continue;
            }
            let parts: Vec<&str> = line.split_whitespace().collect();
            match parts[0] {
                "node" if parts.len() >= 2 => {
                    let id = parts[1].to_string();
                    let (str_attrs, num_attrs) = Self::parse_brackets(line);
                    let node_type = str_attrs.get("type").cloned().unwrap_or_else(|| "worker".into());
                    let op = str_attrs.get("op").cloned().unwrap_or_else(|| "pass".into());
                    let match_keys = str_attrs.get("match").cloned().unwrap_or_default();
                    let reply_text = str_attrs.get("reply").cloned().unwrap_or_default();
                    let task_type = str_attrs.get("task").cloned().unwrap_or_default();

                    let pos_3d = if node_type == "boss" || node_type == "router" {
                        [0.0, 0.0, 0.0]
                    } else {
                        let angle = (node_index as f32) * 1.35;
                        let radius = if node_type == "memory" { 7.5 } else { 4.8 };
                        let height = ((node_index as f32 % 3.0) - 1.0) * 2.2;
                        [radius * angle.cos(), height, radius * angle.sin()]
                    };
                    node_index += 1;

                    self.nodes.insert(id.clone(), Node {
                        id: id.clone(),
                        node_type: node_type.clone(),
                        op: op.clone(),
                        match_keys,
                        reply_text,
                        task_type,
                        state: 0.0,
                        inbox: 0.0,
                        memory_val: 0.0,
                        pos_3d,
                        attrs: num_attrs,
                    });
                    self.log(format!("+ [NODE] '{}' | type={}", id, node_type));
                }
                "synapse" if parts.len() >= 4 && parts[2] == "->" => {
                    let from = parts[1].to_string();
                    let to = parts[3].split('[').next().unwrap_or("").trim().to_string();
                    let (_, num_attrs) = Self::parse_brackets(line);
                    let weight = *num_attrs.get("weight").unwrap_or(&1.0);
                    self.synapses.push(Synapse {
                        from: from.clone(),
                        to: to.clone(),
                        weight,
                        active_signal: 0.0,
                    });
                }
                "pulse" if parts.len() >= 3 => {
                    let target = parts[1];
                    let val: f64 = parts[2].parse().unwrap_or(1.0);
                    if let Some(node) = self.nodes.get_mut(target) {
                        node.state += val;
                        self.log(format!("⚡ [PULSE] '{}' <= +{:.2}", target, val));
                    }
                }
                "ask" => {
                    let query = line.strip_prefix("ask").unwrap_or("").trim().trim_matches('"');
                    self.process_text_query(query);
                }
                "run" => {
                    let steps: usize = parts.get(1).and_then(|s| s.parse().ok()).unwrap_or(1);
                    for _ in 0..steps {
                        self.step_simulation();
                    }
                }
                _ => {
                    // Agar foydalanuvchi terminaldan to'g'ridan-to'g'ri savol yozsa
                    self.process_text_query(line);
                }
            }
        }
    }

    pub fn process_text_query(&mut self, query: &str) {
        self.log(format!("\n🗣 [FOYDALANUVCHI]: \"{}\"", query));
        let q_lower = query.to_lowercase();

        // Boss uyg'onadi
        for node in self.nodes.values_mut() {
            if node.node_type == "boss" || node.node_type == "router" {
                node.state = 5.0;
            }
        }

        let mut matched_ids = Vec::new();
        for node in self.nodes.values_mut() {
            if !node.match_keys.is_empty() {
                for key in node.match_keys.split('|') {
                    if !key.is_empty() && q_lower.contains(&key.to_lowercase()) {
                        node.inbox += 4.5;
                        matched_ids.push(node.id.clone());
                        break;
                    }
                }
            }
        }

        // Hebbian Learning: faol agentning Boss bilan sinapsini kuchaytirish
        for syn in &mut self.synapses {
            if matched_ids.contains(&syn.to) {
                syn.weight = (syn.weight + 0.05).min(2.0);
                syn.active_signal = 5.0 * syn.weight;
            }
        }

        // Agentlar vazifani bajaradi va javob qaytaradi
        let mut replies = Vec::new();
        for id in &matched_ids {
            if let Some(node) = self.nodes.get_mut(id) {
                let extra = match node.task_type.as_str() {
                    "calc" => Self::eval_math(&q_lower),
                    "automonitor" => format!(" [Faol tugunlar: {}, Davr: #{}]", self.nodes.len(), self.tick_count + 1),
                    _ => String::new(),
                };
                if !node.reply_text.is_empty() || !extra.is_empty() {
                    let msg = format!("🤖 [{}]: {} {}", node.id, node.reply_text, extra);
                    replies.push(msg);
                }
            }
        }

        if replies.is_empty() {
            self.log("🤖 [Boss]: Bu mavzu bo'yicha mos Agent topilmadi, signal umumiy tarmoqqa uzatildi.".into());
        } else {
            for r in replies {
                self.ai_replies.push(r.clone());
                self.log(r);
            }
        }

        self.step_simulation();
    }

    fn eval_math(text: &str) -> String {
        let tokens: Vec<&str> = text.split_whitespace().collect();
        for i in 0..tokens.len() {
            if let Ok(a) = tokens[i].parse::<f64>() {
                if i + 2 < tokens.len() {
                    if let Ok(b) = tokens[i + 2].parse::<f64>() {
                        let res = match tokens[i + 1] {
                            "+" => Some(a + b),
                            "-" => Some(a - b),
                            "*" | "x" => Some(a * b),
                            "/" if b != 0.0 => Some(a / b),
                            _ => None,
                        };
                        if let Some(r) = res {
                            return format!("{} {} {} = {:.2}", a, tokens[i + 1], b, r);
                        }
                    }
                }
            }
        }
        "Misolni '25 * 4' ko'rinishida yozing.".into()
    }

    pub fn step_simulation(&mut self) {
        self.tick_count += 1;
        self.log(format!("--- [ TICK #{} ] ---", self.tick_count));
        let mut flow_logs = Vec::new();

        for syn in &mut self.synapses {
            let src_info = self.nodes.get(&syn.from).map(|src| {
                let threshold = *src.attrs.get("threshold").unwrap_or(&0.0);
                (src.state, threshold)
            });

            if let Some((src_state, threshold)) = src_info {
                if src_state.abs() > threshold {
                    let signal = src_state * syn.weight;
                    syn.active_signal = signal;
                    if let Some(dst) = self.nodes.get_mut(&syn.to) {
                        dst.inbox += signal;
                        flow_logs.push(format!(
                            "  {} ({:.2}) -> {} [{:+.2} | w:{:.2}]",
                            syn.from, src_state, syn.to, signal, syn.weight
                        ));
                    }
                } else {
                    syn.active_signal = 0.0;
                }
            }
        }
        for l in flow_logs { self.log(l); }

        let mut state_logs = Vec::new();
        for node in self.nodes.values_mut() {
            let decay = *node.attrs.get("decay").unwrap_or(&0.2);
            let raw = (node.state * decay) + node.inbox;
            node.inbox = 0.0;
            let bias = *node.attrs.get("bias").unwrap_or(&0.0);
            let factor = *node.attrs.get("factor").unwrap_or(&1.0);
            node.state = match node.op.as_str() {
                "pass" | "router" => raw + bias,
                "scale" => (raw * factor) + bias,
                "relu" => (raw + bias).max(0.0),
                "tanh" => (raw + bias).tanh(),
                "sin" => (raw * factor + bias).sin(),
                "accumulate" => { node.memory_val += raw; node.memory_val }
                _ => raw,
            };
            if node.state.abs() > 0.001 {
                state_logs.push(format!("  * [{}] state={:.3}", node.id, node.state));
            }
        }
        for l in state_logs { self.log(l); }
    }

    fn parse_brackets(line: &str) -> (HashMap<String, String>, HashMap<String, f64>) {
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
}

#[wasm_bindgen]
pub fn run_synapse_script(script: &str) -> String {
    let mut rt = SynapseRuntime::default();
    rt.execute_script(script);
    serde_json::to_string(&rt).unwrap_or_else(|_| "{}".into())
}
