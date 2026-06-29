use std::fs;

use crate::infra::{atomic_write, paths};
use crate::models::account::AccountsFile;
use crate::models::claude::{ClaudeAccountsFile, ClaudeCurrentAccounts};
use crate::models::error::{AppError, AppResult};
use crate::models::settings::AppSettings;

fn now_timestamp() -> i64 {
    chrono::Utc::now().timestamp()
}

pub fn load_accounts_file() -> AppResult<AccountsFile> {
    let path = paths::accounts_file_path()?;
    if !path.exists() {
        return Ok(AccountsFile {
            schema_version: "1.0.0".to_string(),
            current_account_id: None,
            accounts: Vec::new(),
            updated_at: now_timestamp(),
        });
    }

    let content = fs::read_to_string(&path).map_err(|err| {
        AppError::new(
            "STORAGE_READ_FAILED",
            format!("读取 {} 失败：{}", path.display(), err),
            "请打开数据目录并检查文件权限。",
        )
    })?;
    serde_json::from_str(&content).map_err(|err| {
        AppError::new(
            "STORAGE_INVALID_FORMAT",
            format!("解析 {} 失败：{}", path.display(), err),
            "请先备份该文件，然后重新导入账号。",
        )
    })
}

pub fn save_accounts_file(mut file: AccountsFile) -> AppResult<()> {
    file.updated_at = now_timestamp();
    let path = paths::accounts_file_path()?;
    let content = serde_json::to_vec_pretty(&file).map_err(|err| {
        AppError::new(
            "STORAGE_SERIALIZE_FAILED",
            format!("序列化账号失败：{}", err),
            "请重试。",
        )
    })?;
    atomic_write::write_atomic(&path, &content)
}

pub fn load_claude_accounts_file() -> AppResult<ClaudeAccountsFile> {
    let path = paths::claude_accounts_file_path()?;
    if !path.exists() {
        return Ok(ClaudeAccountsFile {
            schema_version: "1.0.0".to_string(),
            accounts: Vec::new(),
            updated_at: now_timestamp(),
        });
    }

    let content = fs::read_to_string(&path).map_err(|err| {
        AppError::new(
            "STORAGE_READ_FAILED",
            format!("读取 {} 失败：{}", path.display(), err),
            "请打开数据目录并检查文件权限。",
        )
    })?;
    serde_json::from_str(&content).map_err(|err| {
        AppError::new(
            "STORAGE_INVALID_FORMAT",
            format!("解析 {} 失败：{}", path.display(), err),
            "请先备份该文件，然后重新导入 Claude 账号。",
        )
    })
}

pub fn save_claude_accounts_file(mut file: ClaudeAccountsFile) -> AppResult<()> {
    file.updated_at = now_timestamp();
    let path = paths::claude_accounts_file_path()?;
    let content = serde_json::to_vec_pretty(&file).map_err(|err| {
        AppError::new(
            "STORAGE_SERIALIZE_FAILED",
            format!("序列化 Claude 账号失败：{}", err),
            "请重试。",
        )
    })?;
    atomic_write::write_atomic(&path, &content)
}

pub fn load_claude_current_accounts() -> AppResult<ClaudeCurrentAccounts> {
    let path = paths::claude_current_accounts_file_path()?;
    if !path.exists() {
        return Ok(ClaudeCurrentAccounts::default());
    }

    let content = fs::read_to_string(&path).map_err(|err| {
        AppError::new(
            "STORAGE_READ_FAILED",
            format!("读取 {} 失败：{}", path.display(), err),
            "请打开数据目录并检查文件权限。",
        )
    })?;
    serde_json::from_str(&content).map_err(|err| {
        AppError::new(
            "STORAGE_INVALID_FORMAT",
            format!("解析 {} 失败：{}", path.display(), err),
            "请先备份该文件，然后重新设置 Claude 当前账号。",
        )
    })
}

pub fn save_claude_current_accounts(current: ClaudeCurrentAccounts) -> AppResult<()> {
    let path = paths::claude_current_accounts_file_path()?;
    let content = serde_json::to_vec_pretty(&current).map_err(|err| {
        AppError::new(
            "STORAGE_SERIALIZE_FAILED",
            format!("序列化 Claude 当前账号失败：{}", err),
            "请重试。",
        )
    })?;
    atomic_write::write_atomic(&path, &content)
}

pub fn load_settings() -> AppResult<AppSettings> {
    let path = paths::settings_file_path()?;
    if !path.exists() {
        return Ok(AppSettings::default());
    }
    let content = fs::read_to_string(&path).map_err(|err| {
        AppError::new(
            "SETTINGS_READ_FAILED",
            format!("读取 {} 失败：{}", path.display(), err),
            "请打开数据目录并检查文件权限。",
        )
    })?;
    serde_json::from_str::<AppSettings>(&content)
        .map(|settings| settings.normalized())
        .map_err(|err| {
            AppError::new(
                "SETTINGS_INVALID_FORMAT",
                format!("解析 {} 失败：{}", path.display(), err),
                "请重置设置，或手动编辑该文件。",
            )
        })
}

pub fn save_settings(settings: AppSettings) -> AppResult<AppSettings> {
    let settings = settings.normalized();
    let path = paths::settings_file_path()?;
    let content = serde_json::to_vec_pretty(&settings).map_err(|err| {
        AppError::new(
            "SETTINGS_SERIALIZE_FAILED",
            format!("序列化设置失败：{}", err),
            "请重试。",
        )
    })?;
    atomic_write::write_atomic(&path, &content)?;
    Ok(settings)
}

#[cfg(test)]
mod tests {
    use super::{load_accounts_file, load_settings, save_settings};
    use crate::infra::paths;
    use crate::models::settings::AppSettings;
    use crate::test_support::TestEnv;

    #[test]
    fn load_accounts_file_returns_default_for_empty_data_dir() {
        let _env = TestEnv::new("empty-accounts");

        let file = load_accounts_file().expect("empty data dir should load default accounts");

        assert_eq!(file.schema_version, "1.0.0");
        assert!(file.current_account_id.is_none());
        assert!(file.accounts.is_empty());
    }

    #[test]
    fn load_accounts_file_rejects_corrupt_json() {
        let _env = TestEnv::new("corrupt-accounts");
        let path = paths::accounts_file_path().expect("accounts path should resolve");
        std::fs::write(&path, "{not-json").expect("corrupt accounts file should be written");

        let error = load_accounts_file().expect_err("corrupt accounts file should fail");

        assert_eq!(error.code, "STORAGE_INVALID_FORMAT");
    }

    #[test]
    fn save_settings_can_be_loaded_again() {
        let _env = TestEnv::new("settings-roundtrip");
        let settings = AppSettings {
            schema_version: "1.0.0".to_string(),
            codex_home_path: Some("/tmp/codex-home".to_string()),
            auth_file_path: Some("/tmp/codex-home/auth.json".to_string()),
            theme: "dark".to_string(),
            quota_auto_refresh_enabled: true,
            quota_auto_refresh_interval_minutes: 5,
            quota_refresh_on_start: true,
        };

        save_settings(settings.clone()).expect("settings should save");
        let loaded = load_settings().expect("settings should load");

        assert_eq!(loaded.schema_version, settings.schema_version);
        assert_eq!(loaded.codex_home_path, settings.codex_home_path);
        assert_eq!(loaded.auth_file_path, settings.auth_file_path);
        assert_eq!(loaded.theme, settings.theme);
        assert_eq!(
            loaded.quota_auto_refresh_enabled,
            settings.quota_auto_refresh_enabled
        );
        assert_eq!(
            loaded.quota_auto_refresh_interval_minutes,
            settings.quota_auto_refresh_interval_minutes
        );
        assert_eq!(
            loaded.quota_refresh_on_start,
            settings.quota_refresh_on_start
        );
    }

    #[test]
    fn load_settings_backfills_auto_quota_refresh_defaults() {
        let _env = TestEnv::new("settings-auto-refresh-defaults");
        let path = paths::settings_file_path().expect("settings path should resolve");
        std::fs::write(
            &path,
            r#"{
              "schemaVersion": "1.0.0",
              "theme": "system",
              "quotaRefreshOnStart": false
            }"#,
        )
        .expect("legacy settings should be written");

        let loaded = load_settings().expect("settings should load");

        assert!(loaded.quota_auto_refresh_enabled);
        assert_eq!(loaded.quota_auto_refresh_interval_minutes, 5);
    }

    #[test]
    fn save_settings_clamps_too_short_auto_refresh_interval() {
        let _env = TestEnv::new("settings-auto-refresh-clamp");
        let settings = AppSettings {
            schema_version: "1.0.0".to_string(),
            codex_home_path: None,
            auth_file_path: None,
            theme: "system".to_string(),
            quota_auto_refresh_enabled: true,
            quota_auto_refresh_interval_minutes: 1,
            quota_refresh_on_start: false,
        };

        let saved = save_settings(settings).expect("settings should save");

        assert_eq!(saved.quota_auto_refresh_interval_minutes, 5);
    }
}
