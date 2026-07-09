mod commands;
mod infra;
mod models;
mod services;

#[cfg(target_os = "macos")]
use tauri::Manager;

#[cfg(test)]
mod test_support;

const MAIN_WINDOW_LABEL: &str = "main";

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    infra::logger::init_logger();

    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init());

    #[cfg(any(target_os = "macos", target_os = "windows", target_os = "linux"))]
    let builder = builder.plugin(tauri_plugin_updater::Builder::new().build());

    #[cfg(target_os = "macos")]
    let builder = builder.on_window_event(|window, event| {
        if window.label() == MAIN_WINDOW_LABEL {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        }
    });

    builder
        .setup(|app| {
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                if let Err(error) =
                    crate::services::codex_local_access_gateway::restore_for_current_account().await
                {
                    tracing::warn!(
                        code = error.code,
                        message = error.message,
                        "failed to restore codex local access gateway"
                    );
                }
                drop(handle);
            });
            tauri::async_runtime::spawn(async move {
                crate::services::quota_scheduler_service::run_auto_refresh_loop().await;
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::account::list_codex_accounts,
            commands::account::get_current_codex_account,
            commands::account::delete_codex_account,
            commands::account::update_codex_api_key_account,
            commands::account::update_codex_api_key_bound_oauth_account,
            commands::account::switch_codex_account,
            commands::account::reset_codex_provider_config,
            commands::claude::list_claude_accounts,
            commands::claude::get_current_claude_accounts,
            commands::claude::delete_claude_account,
            commands::claude::import_claude_desktop_from_local,
            commands::claude::import_claude_cli_from_local,
            commands::claude::import_claude_desktop_gateway,
            commands::claude::claude_desktop_gateway_list_models,
            commands::claude::import_claude_desktop_json,
            commands::claude::import_claude_desktop_json_file,
            commands::claude::update_claude_desktop_gateway,
            commands::claude::import_claude_api_key,
            commands::claude::update_claude_api_key,
            commands::claude::prepare_claude_oauth_login,
            commands::claude::complete_claude_oauth_login,
            commands::claude::switch_claude_account,
            commands::import::import_codex_from_local,
            commands::import::import_codex_from_json,
            commands::import::import_codex_from_files,
            commands::import::start_codex_batch_import_from_files,
            commands::import::confirm_codex_batch_import,
            commands::import::add_codex_account_with_token,
            commands::import::add_codex_account_with_api_key,
            commands::oauth::codex_oauth_login_start,
            commands::oauth::codex_oauth_submit_callback_url,
            commands::oauth::codex_oauth_login_status,
            commands::oauth::codex_oauth_login_completed,
            commands::oauth::codex_oauth_login_cancel,
            commands::oauth::is_codex_oauth_port_in_use,
            commands::quota::refresh_codex_quota,
            commands::quota::refresh_all_codex_quotas,
            commands::session::list_codex_sessions,
            commands::session::restore_codex_sessions_visibility,
            commands::session::delete_codex_sessions,
            commands::settings::get_settings,
            commands::settings::save_settings,
            commands::settings::detect_codex_paths,
            commands::system::open_data_dir,
            commands::system::open_log_dir,
            commands::system::get_log_snapshot,
            commands::system::get_system_snapshot,
            commands::window::window_start_dragging,
            commands::working_light::working_light_get_snapshot,
            commands::working_light::working_light_set_agent_state,
            commands::working_light::working_light_set_muted,
            commands::working_light::working_light_set_window_enabled,
            commands::working_light::working_light_set_agent_enabled,
            commands::working_light::working_light_get_hook_status,
            commands::working_light::working_light_install_hooks,
            commands::working_light::working_light_show_window,
            commands::working_light::working_light_hide_window,
            commands::working_light::working_light_close_window,
            commands::working_light::working_light_resize_window,
            commands::working_light::working_light_activate_agent,
        ])
        .build(tauri::generate_context!())
        .expect("failed to build Nuomi Switch")
        .run(|app_handle, event| {
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Reopen { .. } = event {
                show_main_window(app_handle);
            }
        });
}

#[cfg(target_os = "macos")]
fn show_main_window(app_handle: &tauri::AppHandle) {
    let Some(window) = app_handle.get_webview_window(MAIN_WINDOW_LABEL) else {
        return;
    };

    let _ = window.unminimize();
    let _ = window.show();
    let _ = window.set_focus();
}

pub fn try_run_working_light_cli() -> bool {
    let args: Vec<String> = std::env::args().skip(1).collect();
    match services::working_light_service::run_cli(&args) {
        Ok(Some(output)) => {
            if !output.is_empty() {
                println!("{output}");
            }
            true
        }
        Ok(None) => false,
        Err(error) => {
            eprintln!("{}: {}", error.code, error.message);
            eprintln!("{}", error.action);
            std::process::exit(1);
        }
    }
}
