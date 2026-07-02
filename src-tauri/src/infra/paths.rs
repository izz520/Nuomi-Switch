use std::path::PathBuf;

use crate::models::error::{AppError, AppResult};

const DATA_DIR_ENV: &str = "CODEX_LITE_DATA_DIR";
const CODEX_HOME_ENV: &str = "CODEX_LITE_CODEX_HOME";

pub fn app_data_dir() -> AppResult<PathBuf> {
    if let Ok(path) = std::env::var(DATA_DIR_ENV) {
        if !path.trim().is_empty() {
            return Ok(PathBuf::from(path));
        }
    }

    dirs::data_dir()
        .map(|path| path.join("nuomi-switch"))
        .ok_or_else(|| {
            AppError::new(
                "DATA_DIR_UNAVAILABLE",
                "无法解析应用数据目录。",
                "请检查当前用户资料目录权限。",
            )
        })
}

pub fn logs_dir() -> AppResult<PathBuf> {
    Ok(app_data_dir()?.join("logs"))
}

pub fn backups_dir() -> AppResult<PathBuf> {
    Ok(app_data_dir()?.join("backups"))
}

pub fn accounts_file_path() -> AppResult<PathBuf> {
    Ok(app_data_dir()?.join("accounts.json"))
}

pub fn claude_accounts_file_path() -> AppResult<PathBuf> {
    Ok(app_data_dir()?.join("claude_accounts.json"))
}

pub fn claude_current_accounts_file_path() -> AppResult<PathBuf> {
    Ok(app_data_dir()?.join("provider_current_accounts.json"))
}

pub fn settings_file_path() -> AppResult<PathBuf> {
    Ok(app_data_dir()?.join("settings.json"))
}

pub fn working_light_state_file_path() -> AppResult<PathBuf> {
    Ok(app_data_dir()?.join("working_light_state.json"))
}

pub fn working_light_preferences_file_path() -> AppResult<PathBuf> {
    Ok(app_data_dir()?.join("working_light_preferences.json"))
}

pub fn default_codex_home() -> AppResult<PathBuf> {
    if let Ok(path) = std::env::var(CODEX_HOME_ENV) {
        if !path.trim().is_empty() {
            return Ok(PathBuf::from(path));
        }
    }

    dirs::home_dir()
        .map(|path| path.join(".codex"))
        .ok_or_else(|| {
            AppError::new(
                "HOME_DIR_UNAVAILABLE",
                "无法解析用户主目录。",
                "请检查当前用户资料目录权限。",
            )
        })
}

pub fn default_codex_auth_file() -> AppResult<PathBuf> {
    Ok(default_codex_home()?.join("auth.json"))
}

pub fn default_codex_config_file() -> AppResult<PathBuf> {
    Ok(default_codex_home()?.join("config.toml"))
}

pub fn default_claude_desktop_dir() -> AppResult<PathBuf> {
    dirs::home_dir()
        .map(|path| {
            path.join("Library")
                .join("Application Support")
                .join("Claude")
        })
        .ok_or_else(|| {
            AppError::new(
                "HOME_DIR_UNAVAILABLE",
                "无法解析用户主目录。",
                "请检查当前用户资料目录权限。",
            )
        })
}

pub fn default_claude_cli_dir() -> AppResult<PathBuf> {
    dirs::home_dir()
        .map(|path| path.join(".claude"))
        .ok_or_else(|| {
            AppError::new(
                "HOME_DIR_UNAVAILABLE",
                "无法解析用户主目录。",
                "请检查当前用户资料目录权限。",
            )
        })
}
