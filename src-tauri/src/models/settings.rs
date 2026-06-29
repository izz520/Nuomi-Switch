use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub schema_version: String,
    pub codex_home_path: Option<String>,
    pub auth_file_path: Option<String>,
    pub theme: String,
    #[serde(default = "default_quota_auto_refresh_enabled")]
    pub quota_auto_refresh_enabled: bool,
    #[serde(default = "default_quota_auto_refresh_interval_minutes")]
    pub quota_auto_refresh_interval_minutes: u64,
    pub quota_refresh_on_start: bool,
}

pub const MIN_QUOTA_AUTO_REFRESH_INTERVAL_MINUTES: u64 = 5;
pub const DEFAULT_QUOTA_AUTO_REFRESH_INTERVAL_MINUTES: u64 = 5;

fn default_quota_auto_refresh_enabled() -> bool {
    true
}

fn default_quota_auto_refresh_interval_minutes() -> u64 {
    DEFAULT_QUOTA_AUTO_REFRESH_INTERVAL_MINUTES
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            schema_version: "1.0.0".to_string(),
            codex_home_path: None,
            auth_file_path: None,
            theme: "system".to_string(),
            quota_auto_refresh_enabled: default_quota_auto_refresh_enabled(),
            quota_auto_refresh_interval_minutes: default_quota_auto_refresh_interval_minutes(),
            quota_refresh_on_start: false,
        }
    }
}

impl AppSettings {
    pub fn normalized(mut self) -> Self {
        if self.quota_auto_refresh_interval_minutes < MIN_QUOTA_AUTO_REFRESH_INTERVAL_MINUTES {
            self.quota_auto_refresh_interval_minutes = MIN_QUOTA_AUTO_REFRESH_INTERVAL_MINUTES;
        }
        self
    }
}
