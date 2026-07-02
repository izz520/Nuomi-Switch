use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum WorkingLightAgent {
    Codex,
    Claude,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum WorkingLightAgentState {
    Idle,
    Working,
    Done,
    Waiting,
    Error,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkingLightAgentStatus {
    pub state: WorkingLightAgentState,
    pub updated_at: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkingLightAgents {
    pub codex: WorkingLightAgentStatus,
    pub claude: WorkingLightAgentStatus,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkingLightStateFile {
    pub version: u8,
    pub agents: WorkingLightAgents,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkingLightPreferences {
    pub muted: bool,
    pub done_auto_idle_seconds: u64,
    pub waiting_blink_seconds: u64,
    #[serde(default = "default_agent_enabled")]
    pub codex_enabled: bool,
    #[serde(default = "default_agent_enabled")]
    pub claude_enabled: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkingLightDetection {
    pub agent: WorkingLightAgent,
    pub label: String,
    pub detected: bool,
    pub source: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pid: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub process_name: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkingLightHookInstallation {
    pub installed: bool,
    pub path: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkingLightHookStatus {
    pub codex: WorkingLightHookInstallation,
    pub claude: WorkingLightHookInstallation,
    pub executable_path: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkingLightSnapshot {
    pub state: WorkingLightStateFile,
    pub preferences: WorkingLightPreferences,
    pub detections: Vec<WorkingLightDetection>,
}

impl WorkingLightAgent {
    pub fn label(self) -> &'static str {
        match self {
            Self::Codex => "Codex",
            Self::Claude => "Claude",
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Self::Codex => "codex",
            Self::Claude => "claude",
        }
    }
}

impl WorkingLightAgentState {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Idle => "idle",
            Self::Working => "working",
            Self::Done => "done",
            Self::Waiting => "waiting",
            Self::Error => "error",
        }
    }
}

impl Default for WorkingLightAgentStatus {
    fn default() -> Self {
        Self {
            state: WorkingLightAgentState::Idle,
            updated_at: 0,
            message: None,
        }
    }
}

impl Default for WorkingLightAgents {
    fn default() -> Self {
        Self {
            codex: WorkingLightAgentStatus::default(),
            claude: WorkingLightAgentStatus::default(),
        }
    }
}

impl Default for WorkingLightStateFile {
    fn default() -> Self {
        Self {
            version: 1,
            agents: WorkingLightAgents::default(),
        }
    }
}

impl Default for WorkingLightPreferences {
    fn default() -> Self {
        Self {
            muted: false,
            done_auto_idle_seconds: 600,
            waiting_blink_seconds: 10,
            codex_enabled: true,
            claude_enabled: true,
        }
    }
}

fn default_agent_enabled() -> bool {
    true
}
