use crate::models::account::{CodexAccountView, SwitchResult};
use crate::models::error::AppResult;
use crate::infra::paths;
use crate::services::{account_service, codex_config_service, switch_service};

#[tauri::command]
pub fn list_codex_accounts() -> AppResult<Vec<CodexAccountView>> {
    account_service::list_accounts()
}

#[tauri::command]
pub fn get_current_codex_account() -> AppResult<Option<CodexAccountView>> {
    account_service::get_current_account()
}

#[tauri::command]
pub fn delete_codex_account(account_id: String) -> AppResult<()> {
    account_service::delete_account(&account_id)
}

#[tauri::command]
pub async fn update_codex_api_key_account(
    account_id: String,
    api_key: String,
    api_base_url: Option<String>,
    display_name: Option<String>,
) -> AppResult<CodexAccountView> {
    account_service::update_api_key_account(&account_id, api_key, api_base_url, display_name).await
}

#[tauri::command]
pub async fn update_codex_api_key_bound_oauth_account(
    account_id: String,
    bound_oauth_account_id: Option<String>,
) -> AppResult<CodexAccountView> {
    account_service::update_api_key_bound_oauth_account(&account_id, bound_oauth_account_id).await
}

#[tauri::command]
pub async fn switch_codex_account(account_id: String) -> AppResult<SwitchResult> {
    switch_service::switch_account(account_id).await
}

#[tauri::command]
pub fn reset_codex_provider_config() -> AppResult<()> {
    let config_path = paths::default_codex_config_file()?;
    codex_config_service::reset_provider_config(&config_path)
}
