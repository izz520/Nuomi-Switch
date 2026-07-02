use tauri::AppHandle;

use crate::models::error::AppResult;
use crate::models::working_light::{
    WorkingLightAgent, WorkingLightAgentState, WorkingLightHookStatus, WorkingLightPreferences,
    WorkingLightSnapshot, WorkingLightStateFile,
};
use crate::services::working_light_service;

#[tauri::command]
pub fn working_light_get_snapshot() -> AppResult<WorkingLightSnapshot> {
    working_light_service::get_snapshot()
}

#[tauri::command]
pub fn working_light_set_agent_state(
    agent: WorkingLightAgent,
    state: WorkingLightAgentState,
    message: Option<String>,
) -> AppResult<WorkingLightStateFile> {
    working_light_service::update_agent_state(agent, state, message)
}

#[tauri::command]
pub fn working_light_set_muted(muted: bool) -> AppResult<WorkingLightPreferences> {
    working_light_service::set_muted(muted)
}

#[tauri::command]
pub fn working_light_set_window_enabled(enabled: bool, app: AppHandle) -> AppResult<WorkingLightPreferences> {
    working_light_service::set_window_enabled(&app, enabled)
}

#[tauri::command]
pub fn working_light_set_agent_enabled(
    agent: WorkingLightAgent,
    enabled: bool,
) -> AppResult<WorkingLightPreferences> {
    working_light_service::set_agent_enabled(agent, enabled)
}

#[tauri::command]
pub fn working_light_get_hook_status() -> AppResult<WorkingLightHookStatus> {
    working_light_service::get_hook_status()
}

#[tauri::command]
pub fn working_light_install_hooks(agent: WorkingLightAgent) -> AppResult<WorkingLightHookStatus> {
    working_light_service::install_hooks(agent)
}

#[tauri::command]
pub fn working_light_show_window(app: AppHandle) -> AppResult<()> {
    working_light_service::show_window(&app)
}

#[tauri::command]
pub fn working_light_hide_window(app: AppHandle) -> AppResult<()> {
    working_light_service::hide_window(&app)
}

#[tauri::command]
pub fn working_light_close_window(app: AppHandle) -> AppResult<()> {
    working_light_service::close_window(&app)
}

#[tauri::command]
pub fn working_light_resize_window(visible_agent_count: usize, app: AppHandle) -> AppResult<()> {
    working_light_service::resize_window_for_agent_count(&app, visible_agent_count)
}
