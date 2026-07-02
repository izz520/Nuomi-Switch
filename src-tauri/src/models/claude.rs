use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum ClaudeAuthMode {
    #[serde(rename = "desktop_oauth")]
    DesktopOAuth,
    #[serde(rename = "desktop_gateway")]
    DesktopGateway,
    #[serde(rename = "cli_oauth")]
    CliOAuth,
    #[serde(rename = "api_key")]
    ApiKey,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeAccount {
    pub id: String,
    pub display_name: String,
    pub email: Option<String>,
    pub auth_mode: ClaudeAuthMode,
    pub account_id: Option<String>,
    pub organization_name: Option<String>,
    pub plan_type: Option<String>,
    pub api_key: Option<String>,
    pub api_base_url: Option<String>,
    pub desktop_profile_dir: Option<String>,
    pub claude_credentials_raw: Option<String>,
    pub claude_config_raw: Option<String>,
    pub desktop_gateway_auth_scheme: Option<String>,
    pub desktop_gateway_connection_mode: Option<String>,
    pub desktop_gateway_models: Option<Vec<String>>,
    pub desktop_gateway_upstream_models: Option<Vec<String>>,
    pub desktop_gateway_model_mappings: Option<Vec<ClaudeDesktopGatewayModelMapping>>,
    pub tags: Vec<String>,
    pub note: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
    pub last_used_at: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeAccountView {
    pub id: String,
    pub display_name: String,
    pub email: Option<String>,
    pub auth_mode: ClaudeAuthMode,
    pub account_id: Option<String>,
    pub organization_name: Option<String>,
    pub plan_type: Option<String>,
    pub api_key: Option<String>,
    pub api_base_url: Option<String>,
    pub desktop_profile_dir: Option<String>,
    pub desktop_gateway_auth_scheme: Option<String>,
    pub desktop_gateway_models: Option<Vec<String>>,
    pub desktop_gateway_connection_mode: Option<String>,
    pub desktop_gateway_upstream_models: Option<Vec<String>>,
    pub desktop_gateway_model_mappings: Option<Vec<ClaudeDesktopGatewayModelMapping>>,
    pub tags: Vec<String>,
    pub note: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
    pub last_used_at: Option<i64>,
    pub is_current: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeCurrentAccounts {
    pub claude_desktop_account: Option<String>,
    pub claude_code_account: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeAccountsFile {
    pub schema_version: String,
    pub accounts: Vec<ClaudeAccount>,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeSwitchResult {
    pub account: ClaudeAccountView,
    pub warnings: Vec<String>,
    pub current_accounts: ClaudeCurrentAccounts,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeDesktopGatewayInput {
    pub display_name: String,
    pub api_key: String,
    pub api_base_url: String,
    pub auth_scheme: String,
    pub connection_mode: String,
    pub desktop_gateway_models: Vec<String>,
    #[serde(default)]
    pub desktop_gateway_upstream_models: Option<Vec<String>>,
    #[serde(default)]
    pub desktop_gateway_model_mappings: Option<Vec<ClaudeDesktopGatewayModelMapping>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeDesktopGatewayModel {
    pub id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub display_name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeDesktopGatewayModelMapping {
    pub desktop_model: String,
    pub upstream_model: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub label_override: Option<String>,
    #[serde(
        default,
        rename = "supports1m",
        skip_serializing_if = "Option::is_none"
    )]
    pub supports_1m: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeDesktopGatewayModelsResult {
    pub models: Vec<ClaudeDesktopGatewayModel>,
    pub latency_ms: u64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub recommended_mode: Option<String>,
    pub has_claude_models: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub auth_scheme: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeApiKeyInput {
    pub display_name: String,
    pub api_key: String,
    pub api_base_url: String,
    pub auth_scheme: String,
    pub connection_mode: String,
    pub desktop_gateway_models: Vec<String>,
    #[serde(default)]
    pub desktop_gateway_upstream_models: Option<Vec<String>>,
    #[serde(default)]
    pub desktop_gateway_model_mappings: Option<Vec<ClaudeDesktopGatewayModelMapping>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeDesktopJsonImportInput {
    pub json_content: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeOauthPrepareResult {
    pub login_id: String,
    pub authorize_url: String,
}

impl ClaudeAccount {
    pub fn to_view(&self, is_current: bool) -> ClaudeAccountView {
        ClaudeAccountView {
            id: self.id.clone(),
            display_name: self.display_name.clone(),
            email: self.email.clone(),
            auth_mode: self.auth_mode.clone(),
            account_id: self.account_id.clone(),
            organization_name: self.organization_name.clone(),
            plan_type: self.plan_type.clone(),
            api_key: self.api_key.clone(),
            api_base_url: self.api_base_url.clone(),
            desktop_profile_dir: self.desktop_profile_dir.clone(),
            desktop_gateway_auth_scheme: self.desktop_gateway_auth_scheme.clone(),
            desktop_gateway_models: self.desktop_gateway_models.clone(),
            desktop_gateway_connection_mode: self.desktop_gateway_connection_mode.clone(),
            desktop_gateway_upstream_models: self.desktop_gateway_upstream_models.clone(),
            desktop_gateway_model_mappings: self.desktop_gateway_model_mappings.clone(),
            tags: self.tags.clone(),
            note: self.note.clone(),
            created_at: self.created_at,
            updated_at: self.updated_at,
            last_used_at: self.last_used_at,
            is_current,
        }
    }
}
