use crate::models::claude::{
    ClaudeAccountView, ClaudeApiKeyInput, ClaudeCurrentAccounts, ClaudeDesktopGatewayInput,
    ClaudeDesktopGatewayModelMapping, ClaudeDesktopGatewayModelsResult,
    ClaudeDesktopJsonImportInput, ClaudeOauthPrepareResult, ClaudeSwitchResult,
};
use crate::models::error::AppResult;
use crate::services::claude_service;

#[tauri::command]
pub fn list_claude_accounts() -> AppResult<Vec<ClaudeAccountView>> {
    claude_service::list_accounts()
}

#[tauri::command]
pub fn get_current_claude_accounts() -> AppResult<ClaudeCurrentAccounts> {
    claude_service::get_current_accounts()
}

#[tauri::command]
pub fn delete_claude_account(account_id: String) -> AppResult<()> {
    claude_service::delete_account(&account_id)
}

#[tauri::command]
pub fn import_claude_desktop_from_local() -> AppResult<ClaudeAccountView> {
    claude_service::import_desktop_from_local()
}

#[tauri::command]
pub fn import_claude_cli_from_local() -> AppResult<ClaudeAccountView> {
    claude_service::import_cli_from_local()
}

#[tauri::command]
pub fn import_claude_desktop_gateway(
    display_name: String,
    api_key: String,
    api_base_url: String,
    auth_scheme: String,
    connection_mode: String,
    desktop_gateway_models: Vec<String>,
    desktop_gateway_upstream_models: Option<Vec<String>>,
    desktop_gateway_model_mappings: Option<Vec<ClaudeDesktopGatewayModelMapping>>,
) -> AppResult<ClaudeAccountView> {
    claude_service::import_desktop_gateway(ClaudeDesktopGatewayInput {
        display_name,
        api_key,
        api_base_url,
        auth_scheme,
        connection_mode,
        desktop_gateway_models,
        desktop_gateway_upstream_models,
        desktop_gateway_model_mappings,
    })
}

#[tauri::command]
pub async fn claude_desktop_gateway_list_models(
    api_key: String,
    api_base_url: String,
    auth_scheme: Option<String>,
) -> AppResult<ClaudeDesktopGatewayModelsResult> {
    claude_service::list_desktop_gateway_models(api_base_url, api_key, auth_scheme).await
}

#[tauri::command]
pub fn import_claude_desktop_json(json_content: String) -> AppResult<ClaudeAccountView> {
    claude_service::import_desktop_json(ClaudeDesktopJsonImportInput { json_content })
}

#[tauri::command]
pub fn import_claude_desktop_json_file(file_path: String) -> AppResult<ClaudeAccountView> {
    claude_service::import_desktop_json_file(file_path)
}

#[tauri::command]
pub fn update_claude_desktop_gateway(
    account_id: String,
    display_name: String,
    api_key: String,
    api_base_url: String,
    auth_scheme: String,
    connection_mode: String,
    desktop_gateway_models: Vec<String>,
    desktop_gateway_upstream_models: Option<Vec<String>>,
    desktop_gateway_model_mappings: Option<Vec<ClaudeDesktopGatewayModelMapping>>,
) -> AppResult<ClaudeAccountView> {
    claude_service::update_desktop_gateway(
        &account_id,
        ClaudeDesktopGatewayInput {
            display_name,
            api_key,
            api_base_url,
            auth_scheme,
            connection_mode,
            desktop_gateway_models,
            desktop_gateway_upstream_models,
            desktop_gateway_model_mappings,
        },
    )
}

#[tauri::command]
pub fn import_claude_api_key(
    display_name: String,
    api_key: String,
    api_base_url: String,
) -> AppResult<ClaudeAccountView> {
    claude_service::import_api_key(ClaudeApiKeyInput {
        display_name,
        api_key,
        api_base_url,
    })
}

#[tauri::command]
pub fn update_claude_api_key(
    account_id: String,
    display_name: String,
    api_key: String,
    api_base_url: String,
) -> AppResult<ClaudeAccountView> {
    claude_service::update_api_key(
        &account_id,
        ClaudeApiKeyInput {
            display_name,
            api_key,
            api_base_url,
        },
    )
}

#[tauri::command]
pub fn prepare_claude_oauth_login() -> AppResult<ClaudeOauthPrepareResult> {
    claude_service::prepare_oauth_login()
}

#[tauri::command]
pub fn complete_claude_oauth_login(
    login_id: String,
    callback_or_code: String,
    email_hint: Option<String>,
) -> AppResult<ClaudeAccountView> {
    claude_service::complete_oauth_login(login_id, callback_or_code, email_hint)
}

#[tauri::command]
pub fn switch_claude_account(account_id: String) -> AppResult<ClaudeSwitchResult> {
    claude_service::switch_account(account_id)
}
