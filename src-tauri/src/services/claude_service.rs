use std::fs;
use std::path::{Path, PathBuf};
use std::time::Instant;

use crate::infra::{atomic_write, paths, storage};
use crate::models::claude::{
    ClaudeAccount, ClaudeAccountView, ClaudeAccountsFile, ClaudeApiKeyInput, ClaudeAuthMode,
    ClaudeCurrentAccounts, ClaudeDesktopGatewayInput, ClaudeDesktopGatewayModel,
    ClaudeDesktopGatewayModelMapping, ClaudeDesktopGatewayModelsResult,
    ClaudeDesktopJsonImportInput, ClaudeOauthPrepareResult, ClaudeSwitchResult,
};
use crate::models::error::{AppError, AppResult};
use crate::services::claude_desktop_gateway_service;
use reqwest::header::ACCEPT;
use reqwest::Url;

fn now_timestamp() -> i64 {
    chrono::Utc::now().timestamp()
}

fn normalize_required(value: &str, code: &str, message: &str, action: &str) -> AppResult<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err(AppError::new(code, message, action));
    }
    Ok(trimmed.to_string())
}

fn normalize_required_url(
    value: &str,
    code: &str,
    message: &str,
    action: &str,
) -> AppResult<String> {
    let normalized = normalize_required(value, code, message, action)?;
    Url::parse(&normalized).map_err(|err| {
        AppError::new(
            "CLAUDE_GATEWAY_BASE_URL_INVALID",
            format!("Gateway Base URL 无效：{}", err),
            "请填写包含 http:// 或 https:// 的完整地址。",
        )
    })?;
    Ok(normalized.trim_end_matches('/').to_string())
}

fn normalize_optional(value: Option<String>) -> Option<String> {
    value
        .map(|item| item.trim().to_string())
        .filter(|item| !item.is_empty())
}

fn normalize_model_catalog(models: Option<Vec<String>>) -> Option<Vec<String>> {
    let mut seen = std::collections::BTreeSet::new();
    let mut result = Vec::new();
    for model in models.into_iter().flatten() {
        let trimmed = model.trim();
        if trimmed.is_empty() {
            continue;
        }
        let key = trimmed.to_ascii_lowercase();
        if seen.insert(key) {
            result.push(trimmed.to_string());
        }
    }
    (!result.is_empty()).then_some(result)
}

fn is_claude_desktop_model(model: &str) -> bool {
    let normalized = model.trim().to_ascii_lowercase();
    normalized.starts_with("claude-") || normalized.starts_with("anthropic/claude-")
}

fn normalize_gateway_auth_scheme(value: &str) -> String {
    match value.trim().to_ascii_lowercase().replace('_', "-").as_str() {
        "auto" => "auto".to_string(),
        "x-api-key" => "x-api-key".to_string(),
        _ => "bearer".to_string(),
    }
}

fn normalize_gateway_connection_mode(value: &str) -> String {
    match value.trim().to_ascii_lowercase().replace('-', "_").as_str() {
        "local_mapping" | "mapping" | "local" => "local_mapping".to_string(),
        _ => "direct".to_string(),
    }
}

fn normalize_gateway_mappings(
    mappings: Option<Vec<ClaudeDesktopGatewayModelMapping>>,
) -> Option<Vec<ClaudeDesktopGatewayModelMapping>> {
    let mut seen = std::collections::BTreeMap::<String, ClaudeDesktopGatewayModelMapping>::new();
    for mapping in mappings.into_iter().flatten() {
        let desktop_model = mapping.desktop_model.trim().to_string();
        let upstream_model = mapping.upstream_model.trim().to_string();
        if desktop_model.is_empty() || upstream_model.is_empty() {
            continue;
        }
        seen.entry(desktop_model.to_ascii_lowercase())
            .or_insert_with(|| ClaudeDesktopGatewayModelMapping {
                desktop_model,
                upstream_model,
                label_override: mapping
                    .label_override
                    .as_deref()
                    .map(str::trim)
                    .filter(|value| !value.is_empty())
                    .map(str::to_string),
                supports_1m: mapping.supports_1m.filter(|value| *value),
            });
    }
    (!seen.is_empty()).then(|| seen.into_values().collect())
}

fn build_default_gateway_mappings(
    desktop_models: &[String],
    upstream_models: &[String],
) -> Vec<ClaudeDesktopGatewayModelMapping> {
    let fallback = upstream_models
        .iter()
        .find(|model| !model.trim().is_empty())
        .cloned()
        .unwrap_or_default();
    desktop_models
        .iter()
        .filter_map(|desktop_model| {
            let desktop_model = desktop_model.trim();
            if desktop_model.is_empty() || fallback.is_empty() {
                return None;
            }
            Some(ClaudeDesktopGatewayModelMapping {
                desktop_model: desktop_model.to_string(),
                upstream_model: fallback.clone(),
                label_override: Some(fallback.clone()),
                supports_1m: None,
            })
        })
        .collect()
}

fn gateway_models_url(base_url: &str) -> AppResult<String> {
    let trimmed = base_url.trim().trim_end_matches('/');
    let mut url = Url::parse(trimmed).map_err(|_| {
        AppError::new(
            "CLAUDE_GATEWAY_BASE_URL_INVALID",
            "Gateway Base URL 不是有效 URL。",
            "请填写完整的 http/https 地址。",
        )
    })?;
    if !matches!(url.scheme(), "http" | "https") {
        return Err(AppError::new(
            "CLAUDE_GATEWAY_BASE_URL_INVALID",
            "Gateway Base URL 仅支持 http/https。",
            "请填写完整的 http/https 地址。",
        ));
    }
    let path = url.path().trim_end_matches('/');
    let next_path = if path.is_empty() || path == "/" {
        "/v1/models".to_string()
    } else if path.ends_with("/v1") || path == "/v1" {
        format!("{}/models", path)
    } else {
        format!("{}/v1/models", path)
    };
    url.set_path(&next_path);
    url.set_query(None);
    Ok(url.to_string())
}

fn parse_gateway_models(value: &serde_json::Value) -> Vec<ClaudeDesktopGatewayModel> {
    let mut seen = std::collections::BTreeSet::new();
    value
        .get("data")
        .and_then(serde_json::Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(|item| {
                    let id = item.get("id").and_then(serde_json::Value::as_str)?.trim();
                    if id.is_empty() {
                        return None;
                    }
                    if !seen.insert(id.to_ascii_lowercase()) {
                        return None;
                    }
                    Some(ClaudeDesktopGatewayModel {
                        id: id.to_string(),
                        display_name: item
                            .get("display_name")
                            .or_else(|| item.get("displayName"))
                            .and_then(serde_json::Value::as_str)
                            .map(str::trim)
                            .filter(|value| !value.is_empty())
                            .map(str::to_string),
                    })
                })
                .collect()
        })
        .unwrap_or_default()
}

fn string_vec_from_json(value: Option<&serde_json::Value>) -> Option<Vec<String>> {
    match value {
        Some(serde_json::Value::Array(items)) => normalize_model_catalog(Some(
            items
                .iter()
                .filter_map(serde_json::Value::as_str)
                .map(str::to_string)
                .collect(),
        )),
        Some(serde_json::Value::String(text)) => normalize_model_catalog(Some(
            text.split(|ch| ch == '\n' || ch == ',')
                .map(str::trim)
                .filter(|item| !item.is_empty())
                .map(str::to_string)
                .collect(),
        )),
        _ => None,
    }
}

fn sanitize_id_segment(value: &str) -> String {
    let filtered: String = value
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() {
                ch.to_ascii_lowercase()
            } else {
                '-'
            }
        })
        .collect();
    filtered.trim_matches('-').to_string()
}

fn make_account_id(prefix: &str, display_name: &str) -> String {
    let slug = sanitize_id_segment(display_name);
    if slug.is_empty() {
        format!("{}-{}", prefix, uuid::Uuid::new_v4())
    } else {
        format!(
            "{}-{}-{}",
            prefix,
            slug,
            &uuid::Uuid::new_v4().to_string()[..8]
        )
    }
}

fn load_accounts_file() -> AppResult<ClaudeAccountsFile> {
    storage::load_claude_accounts_file()
}

fn save_accounts_file(file: ClaudeAccountsFile) -> AppResult<()> {
    storage::save_claude_accounts_file(file)
}

fn read_text_if_exists(path: &Path) -> AppResult<Option<String>> {
    match fs::read_to_string(path) {
        Ok(value) => Ok(Some(value)),
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(err) => Err(AppError::new(
            "CLAUDE_FILE_READ_FAILED",
            format!("读取 {} 失败：{}", path.display(), err),
            "请检查文件权限后重试。",
        )),
    }
}

fn copy_dir_all(source: &Path, target: &Path) -> AppResult<()> {
    fs::create_dir_all(target).map_err(|err| {
        AppError::new(
            "CLAUDE_DIR_CREATE_FAILED",
            format!("创建目录 {} 失败：{}", target.display(), err),
            "请检查目录权限。",
        )
    })?;

    for entry in fs::read_dir(source).map_err(|err| {
        AppError::new(
            "CLAUDE_DIR_READ_FAILED",
            format!("读取目录 {} 失败：{}", source.display(), err),
            "请检查目录权限。",
        )
    })? {
        let entry = entry.map_err(|err| {
            AppError::new(
                "CLAUDE_DIR_READ_FAILED",
                format!("遍历目录 {} 失败：{}", source.display(), err),
                "请检查目录权限。",
            )
        })?;
        let file_type = entry.file_type().map_err(|err| {
            AppError::new(
                "CLAUDE_DIR_READ_FAILED",
                format!("读取目录项 {} 类型失败：{}", entry.path().display(), err),
                "请检查目录权限。",
            )
        })?;
        let next_target = target.join(entry.file_name());
        if file_type.is_dir() {
            copy_dir_all(&entry.path(), &next_target)?;
        } else if file_type.is_file() {
            if let Some(parent) = next_target.parent() {
                fs::create_dir_all(parent).map_err(|err| {
                    AppError::new(
                        "CLAUDE_DIR_CREATE_FAILED",
                        format!("创建目录 {} 失败：{}", parent.display(), err),
                        "请检查目录权限。",
                    )
                })?;
            }
            fs::copy(entry.path(), &next_target).map_err(|err| {
                AppError::new(
                    "CLAUDE_FILE_COPY_FAILED",
                    format!(
                        "复制 {} 到 {} 失败：{}",
                        entry.path().display(),
                        next_target.display(),
                        err
                    ),
                    "请关闭 Claude 后重试。",
                )
            })?;
        }
    }

    Ok(())
}

fn remove_dir_if_exists(path: &Path) -> AppResult<()> {
    match fs::remove_dir_all(path) {
        Ok(()) => Ok(()),
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(err) => Err(AppError::new(
            "CLAUDE_DIR_REMOVE_FAILED",
            format!("清理目录 {} 失败：{}", path.display(), err),
            "请关闭 Claude 后重试。",
        )),
    }
}

fn ensure_snapshot_root(name: &str) -> AppResult<PathBuf> {
    let root = paths::app_data_dir()?.join("claude_snapshots").join(name);
    fs::create_dir_all(&root).map_err(|err| {
        AppError::new(
            "CLAUDE_DIR_CREATE_FAILED",
            format!("创建目录 {} 失败：{}", root.display(), err),
            "请检查目录权限。",
        )
    })?;
    Ok(root)
}

fn current_slot_for_mode(auth_mode: &ClaudeAuthMode) -> &'static str {
    match auth_mode {
        ClaudeAuthMode::DesktopOAuth | ClaudeAuthMode::DesktopGateway => "desktop",
        ClaudeAuthMode::CliOAuth | ClaudeAuthMode::ApiKey => "cli",
    }
}

fn is_current_account(current: &ClaudeCurrentAccounts, account: &ClaudeAccount) -> bool {
    match current_slot_for_mode(&account.auth_mode) {
        "desktop" => current.claude_desktop_account.as_deref() == Some(account.id.as_str()),
        _ => current.claude_code_account.as_deref() == Some(account.id.as_str()),
    }
}

fn upsert_account(file: &mut ClaudeAccountsFile, mut account: ClaudeAccount) -> ClaudeAccount {
    account.updated_at = now_timestamp();
    if let Some(index) = file.accounts.iter().position(|item| item.id == account.id) {
        account.created_at = file.accounts[index].created_at;
        file.accounts[index] = account.clone();
    } else {
        file.accounts.insert(0, account.clone());
    }
    account
}

pub fn list_accounts() -> AppResult<Vec<ClaudeAccountView>> {
    let file = load_accounts_file()?;
    let current = storage::load_claude_current_accounts()?;
    Ok(file
        .accounts
        .iter()
        .map(|account| account.to_view(is_current_account(&current, account)))
        .collect())
}

pub fn get_current_accounts() -> AppResult<ClaudeCurrentAccounts> {
    storage::load_claude_current_accounts()
}

pub fn delete_account(account_id: &str) -> AppResult<()> {
    let mut file = load_accounts_file()?;
    file.accounts.retain(|account| account.id != account_id);
    save_accounts_file(file)?;

    let mut current = storage::load_claude_current_accounts()?;
    if current.claude_desktop_account.as_deref() == Some(account_id) {
        current.claude_desktop_account = None;
    }
    if current.claude_code_account.as_deref() == Some(account_id) {
        current.claude_code_account = None;
    }
    storage::save_claude_current_accounts(current)
}

pub fn import_desktop_from_local() -> AppResult<ClaudeAccountView> {
    let source_dir = paths::default_claude_desktop_dir()?;
    if !source_dir.exists() {
        return Err(AppError::new(
            "CLAUDE_DESKTOP_NOT_FOUND",
            "未找到本机 Claude Desktop 数据目录。",
            "先登录 Claude Desktop，再回来导入。",
        ));
    }

    let snapshot_root = ensure_snapshot_root("desktop")?;
    let account_id = make_account_id("claude-desktop", "local-desktop");
    let target_dir = snapshot_root.join(&account_id);
    remove_dir_if_exists(&target_dir)?;
    copy_dir_all(&source_dir, &target_dir)?;

    let credentials_raw = read_text_if_exists(&source_dir.join("claude_desktop_config.json"))?;
    let config_raw = read_text_if_exists(&source_dir.join("config.json"))?;

    let account = ClaudeAccount {
        id: account_id.clone(),
        display_name: "Claude Desktop 本机登录".to_string(),
        email: None,
        auth_mode: ClaudeAuthMode::DesktopOAuth,
        account_id: None,
        organization_name: None,
        plan_type: None,
        api_key: None,
        api_base_url: None,
        desktop_profile_dir: Some(target_dir.display().to_string()),
        claude_credentials_raw: credentials_raw,
        claude_config_raw: config_raw,
        desktop_gateway_auth_scheme: None,
        desktop_gateway_connection_mode: None,
        desktop_gateway_models: None,
        desktop_gateway_upstream_models: None,
        desktop_gateway_model_mappings: None,
        tags: vec!["local".to_string(), "desktop".to_string()],
        note: Some("从本机 Claude Desktop 导入".to_string()),
        created_at: now_timestamp(),
        updated_at: now_timestamp(),
        last_used_at: None,
    };

    let mut file = load_accounts_file()?;
    let saved = upsert_account(&mut file, account);
    save_accounts_file(file)?;
    Ok(saved.to_view(false))
}

pub fn import_cli_from_local() -> AppResult<ClaudeAccountView> {
    let source_dir = paths::default_claude_cli_dir()?;
    if !source_dir.exists() {
        return Err(AppError::new(
            "CLAUDE_CLI_NOT_FOUND",
            "未找到本机 Claude CLI 配置目录。",
            "先登录 Claude CLI，再回来导入。",
        ));
    }

    let credentials_raw = read_text_if_exists(&source_dir.join(".credentials.json"))?;
    let config_raw = read_text_if_exists(&source_dir.join(".claude.json"))?;

    let account = ClaudeAccount {
        id: make_account_id("claude-cli", "local-cli"),
        display_name: "Claude CLI 本机登录".to_string(),
        email: None,
        auth_mode: ClaudeAuthMode::CliOAuth,
        account_id: None,
        organization_name: None,
        plan_type: None,
        api_key: None,
        api_base_url: None,
        desktop_profile_dir: None,
        claude_credentials_raw: credentials_raw,
        claude_config_raw: config_raw,
        desktop_gateway_auth_scheme: None,
        desktop_gateway_connection_mode: None,
        desktop_gateway_models: None,
        desktop_gateway_upstream_models: None,
        desktop_gateway_model_mappings: None,
        tags: vec!["local".to_string(), "cli".to_string()],
        note: Some("从本机 Claude CLI 导入".to_string()),
        created_at: now_timestamp(),
        updated_at: now_timestamp(),
        last_used_at: None,
    };

    let mut file = load_accounts_file()?;
    let saved = upsert_account(&mut file, account);
    save_accounts_file(file)?;
    Ok(saved.to_view(false))
}

pub fn import_desktop_gateway(input: ClaudeDesktopGatewayInput) -> AppResult<ClaudeAccountView> {
    let display_name = normalize_required(
        &input.display_name,
        "CLAUDE_GATEWAY_NAME_EMPTY",
        "显示名称不能为空。",
        "请输入一个易于识别的 Gateway 名称。",
    )?;
    let api_key = normalize_required(
        &input.api_key,
        "CLAUDE_GATEWAY_KEY_EMPTY",
        "Gateway API Key 不能为空。",
        "请粘贴有效的 Gateway API Key。",
    )?;
    let api_base_url = normalize_required_url(
        &input.api_base_url,
        "CLAUDE_GATEWAY_BASE_URL_EMPTY",
        "Gateway Base URL 不能为空。",
        "请填写完整的 Gateway Base URL。",
    )?;

    let connection_mode = normalize_gateway_connection_mode(&input.connection_mode);
    let mut desktop_gateway_models = normalize_model_catalog(Some(input.desktop_gateway_models));
    let desktop_gateway_upstream_models =
        normalize_model_catalog(input.desktop_gateway_upstream_models);
    let mut desktop_gateway_model_mappings =
        normalize_gateway_mappings(input.desktop_gateway_model_mappings);

    if connection_mode == "local_mapping" {
        if desktop_gateway_model_mappings.is_none() {
            if let (Some(desktop_models), Some(upstream_models)) = (
                desktop_gateway_models.as_ref(),
                desktop_gateway_upstream_models.as_ref(),
            ) {
                desktop_gateway_model_mappings = Some(build_default_gateway_mappings(
                    desktop_models,
                    upstream_models,
                ));
            }
        }
        let mappings = desktop_gateway_model_mappings
            .as_ref()
            .filter(|items| !items.is_empty())
            .ok_or_else(|| {
                AppError::new(
                    "CLAUDE_GATEWAY_MAPPING_EMPTY",
                    "请配置模型映射。",
                    "先查询供应商模型，或手动添加至少一条映射。",
                )
            })?;
        if mappings
            .iter()
            .any(|mapping| !is_claude_desktop_model(&mapping.desktop_model))
        {
            return Err(AppError::new(
                "CLAUDE_GATEWAY_DESKTOP_MODEL_INVALID",
                "映射左侧必须是 Claude 可识别的模型名。",
                "使用 claude-* 或 anthropic/claude-* 作为桌面模型名。",
            ));
        }
        desktop_gateway_models = normalize_model_catalog(Some(
            mappings
                .iter()
                .map(|mapping| mapping.desktop_model.clone())
                .collect(),
        ));
    } else {
        let models = desktop_gateway_models
            .as_ref()
            .filter(|items| !items.is_empty())
            .ok_or_else(|| {
                AppError::new(
                    "CLAUDE_GATEWAY_MODELS_EMPTY",
                    "请填写模型目录。",
                    "点击获取模型，或手动填写 Claude 可识别模型。",
                )
            })?;
        if models.iter().any(|model| !is_claude_desktop_model(model)) {
            return Err(AppError::new(
                "CLAUDE_GATEWAY_MODELS_INVALID",
                "直连模式的模型目录必须使用 Claude 可识别模型名。",
                "如果供应商模型不是 Claude 模型，请切换到本地网关映射。",
            ));
        }
    }

    let account = ClaudeAccount {
        id: make_account_id("claude-gateway", &display_name),
        display_name,
        email: None,
        auth_mode: ClaudeAuthMode::DesktopGateway,
        account_id: None,
        organization_name: None,
        plan_type: None,
        api_key: Some(api_key),
        api_base_url: Some(api_base_url),
        desktop_profile_dir: None,
        claude_credentials_raw: None,
        claude_config_raw: None,
        desktop_gateway_auth_scheme: Some(normalize_gateway_auth_scheme(&input.auth_scheme)),
        desktop_gateway_connection_mode: Some(connection_mode),
        desktop_gateway_models,
        desktop_gateway_upstream_models,
        desktop_gateway_model_mappings,
        tags: vec!["gateway".to_string(), "desktop".to_string()],
        note: Some("Claude Desktop Gateway".to_string()),
        created_at: now_timestamp(),
        updated_at: now_timestamp(),
        last_used_at: None,
    };

    let mut file = load_accounts_file()?;
    let saved = upsert_account(&mut file, account);
    save_accounts_file(file)?;
    Ok(saved.to_view(false))
}

async fn list_gateway_models_with_scheme(
    api_base_url: &str,
    api_key: &str,
    auth_scheme: &str,
) -> AppResult<ClaudeDesktopGatewayModelsResult> {
    let url = gateway_models_url(api_base_url)?;
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(20))
        .build()
        .map_err(|err| {
            AppError::new(
                "CLAUDE_GATEWAY_CLIENT_FAILED",
                format!("创建 Gateway HTTP 客户端失败：{}", err),
                "请稍后重试。",
            )
        })?;
    let started = Instant::now();
    let mut request = client.get(url).header(ACCEPT, "application/json");
    if auth_scheme == "x-api-key" {
        request = request.header("x-api-key", api_key);
    } else {
        request = request.bearer_auth(api_key);
    }
    let response = request.send().await.map_err(|err| {
        AppError::new(
            "CLAUDE_GATEWAY_MODELS_NETWORK_FAILED",
            format!("查询 Gateway 模型失败：{}", err),
            "请检查 Base URL、网络和供应商服务状态。",
        )
        .retryable()
    })?;
    let latency_ms = started.elapsed().as_millis().try_into().unwrap_or(u64::MAX);
    let status = response.status();
    let text = response.text().await.unwrap_or_default();
    if !status.is_success() {
        return Err(AppError::new(
            &format!("CLAUDE_GATEWAY_MODELS_HTTP_{}", status.as_u16()),
            format!(
                "Gateway 返回错误：{}",
                text.chars().take(300).collect::<String>()
            ),
            "请检查 API Key、认证方式和 Base URL。",
        ));
    }
    let parsed = serde_json::from_str::<serde_json::Value>(&text).map_err(|err| {
        AppError::new(
            "CLAUDE_GATEWAY_MODELS_PARSE_FAILED",
            format!("解析 Gateway 模型响应失败：{}", err),
            "请确认供应商兼容 OpenAI /v1/models 响应格式。",
        )
    })?;
    let models = parse_gateway_models(&parsed);
    let has_claude_models = models
        .iter()
        .any(|model| is_claude_desktop_model(&model.id));
    Ok(ClaudeDesktopGatewayModelsResult {
        models,
        latency_ms,
        recommended_mode: Some(
            if has_claude_models {
                "direct"
            } else {
                "local_mapping"
            }
            .to_string(),
        ),
        has_claude_models,
        auth_scheme: Some(auth_scheme.to_string()),
    })
}

pub async fn list_desktop_gateway_models(
    api_base_url: String,
    api_key: String,
    auth_scheme: Option<String>,
) -> AppResult<ClaudeDesktopGatewayModelsResult> {
    let api_base_url = normalize_required(
        &api_base_url,
        "CLAUDE_GATEWAY_BASE_URL_EMPTY",
        "Gateway Base URL 不能为空。",
        "请填写完整的 Gateway Base URL。",
    )?;
    let api_key = normalize_required(
        &api_key,
        "CLAUDE_GATEWAY_KEY_EMPTY",
        "Gateway API Key 不能为空。",
        "请粘贴有效的 Gateway API Key。",
    )?;
    let auth_scheme = normalize_gateway_auth_scheme(auth_scheme.as_deref().unwrap_or("bearer"));
    if auth_scheme == "auto" {
        match list_gateway_models_with_scheme(&api_base_url, &api_key, "bearer").await {
            Ok(result) => Ok(result),
            Err(error) if error.code.ends_with("_401") || error.code.ends_with("_403") => {
                list_gateway_models_with_scheme(&api_base_url, &api_key, "x-api-key").await
            }
            Err(error) => Err(error),
        }
    } else {
        list_gateway_models_with_scheme(&api_base_url, &api_key, &auth_scheme).await
    }
}

pub fn import_desktop_json(input: ClaudeDesktopJsonImportInput) -> AppResult<ClaudeAccountView> {
    let json_content = normalize_required(
        &input.json_content,
        "CLAUDE_JSON_EMPTY",
        "JSON 数据不能为空。",
        "请粘贴有效的 Claude Gateway 账号 JSON。",
    )?;

    let parsed: serde_json::Value = serde_json::from_str(&json_content).map_err(|err| {
        AppError::new(
            "CLAUDE_JSON_INVALID",
            format!("解析 Claude JSON 失败：{}", err),
            "请检查 JSON 格式是否正确。",
        )
    })?;

    let display_name = parsed
        .get("displayName")
        .and_then(|value| value.as_str())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("Claude Gateway JSON")
        .to_string();
    let api_base_url = parsed
        .get("apiBaseUrl")
        .or_else(|| parsed.get("baseUrl"))
        .and_then(|value| value.as_str())
        .unwrap_or("https://api.apikey.fun")
        .to_string();
    let api_key = parsed
        .get("apiKey")
        .or_else(|| parsed.get("key"))
        .and_then(|value| value.as_str())
        .unwrap_or("")
        .to_string();
    let auth_scheme = parsed
        .get("authScheme")
        .or_else(|| parsed.get("desktopGatewayAuthScheme"))
        .or_else(|| parsed.get("gatewayAuthScheme"))
        .and_then(|value| value.as_str())
        .unwrap_or("bearer")
        .to_string();
    let desktop_gateway_models = string_vec_from_json(
        parsed
            .get("desktopGatewayModels")
            .or_else(|| parsed.get("gatewayModels"))
            .or_else(|| parsed.get("desktop_gateway_models")),
    )
    .unwrap_or_else(|| vec!["claude-sonnet-4-6".to_string()]);
    let desktop_gateway_upstream_models = string_vec_from_json(
        parsed
            .get("desktopGatewayUpstreamModels")
            .or_else(|| parsed.get("gatewayUpstreamModels"))
            .or_else(|| parsed.get("desktop_gateway_upstream_models")),
    );
    let desktop_gateway_model_mappings = parsed
        .get("desktopGatewayModelMappings")
        .or_else(|| parsed.get("gatewayModelMappings"))
        .or_else(|| parsed.get("desktop_gateway_model_mappings"))
        .and_then(|value| {
            serde_json::from_value::<Vec<ClaudeDesktopGatewayModelMapping>>(value.clone()).ok()
        });
    let connection_mode = parsed
        .get("desktopGatewayConnectionMode")
        .or_else(|| parsed.get("gatewayConnectionMode"))
        .or_else(|| parsed.get("desktop_gateway_connection_mode"))
        .and_then(|value| value.as_str())
        .unwrap_or(if desktop_gateway_model_mappings.is_some() {
            "local_mapping"
        } else {
            "direct"
        })
        .to_string();

    import_desktop_gateway(ClaudeDesktopGatewayInput {
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

pub fn import_desktop_json_file(file_path: String) -> AppResult<ClaudeAccountView> {
    let content = fs::read_to_string(&file_path).map_err(|err| {
        AppError::new(
            "CLAUDE_JSON_FILE_READ_FAILED",
            format!("读取 JSON 文件失败：{}", err),
            "请确认文件存在且可读。",
        )
    })?;
    import_desktop_json(ClaudeDesktopJsonImportInput {
        json_content: content,
    })
}

pub fn update_desktop_gateway(
    account_id: &str,
    input: ClaudeDesktopGatewayInput,
) -> AppResult<ClaudeAccountView> {
    let mut file = load_accounts_file()?;
    let current = storage::load_claude_current_accounts()?;
    let index = file
        .accounts
        .iter()
        .position(|account| account.id == account_id)
        .ok_or_else(|| {
            AppError::new(
                "CLAUDE_ACCOUNT_NOT_FOUND",
                "未找到 Claude 账号。",
                "请刷新列表后重试。",
            )
        })?;
    if file.accounts[index].auth_mode != ClaudeAuthMode::DesktopGateway {
        return Err(AppError::new(
            "CLAUDE_ACCOUNT_MODE_MISMATCH",
            "该账号不是 Desktop Gateway 类型。",
            "请选择一个 Desktop Gateway 账号。",
        ));
    }

    let display_name = normalize_required(
        &input.display_name,
        "CLAUDE_GATEWAY_NAME_EMPTY",
        "显示名称不能为空。",
        "请输入一个易于识别的 Gateway 名称。",
    )?;
    let api_key = normalize_required(
        &input.api_key,
        "CLAUDE_GATEWAY_KEY_EMPTY",
        "Gateway API Key 不能为空。",
        "请粘贴有效的 Gateway API Key。",
    )?;
    let api_base_url = normalize_required_url(
        &input.api_base_url,
        "CLAUDE_GATEWAY_BASE_URL_EMPTY",
        "Gateway Base URL 不能为空。",
        "请填写完整的 Gateway Base URL。",
    )?;
    let connection_mode = normalize_gateway_connection_mode(&input.connection_mode);
    let mut desktop_gateway_models = normalize_model_catalog(Some(input.desktop_gateway_models));
    let desktop_gateway_upstream_models =
        normalize_model_catalog(input.desktop_gateway_upstream_models);
    let mut desktop_gateway_model_mappings =
        normalize_gateway_mappings(input.desktop_gateway_model_mappings);

    if connection_mode == "local_mapping" {
        if desktop_gateway_model_mappings.is_none() {
            if let (Some(desktop_models), Some(upstream_models)) = (
                desktop_gateway_models.as_ref(),
                desktop_gateway_upstream_models.as_ref(),
            ) {
                desktop_gateway_model_mappings = Some(build_default_gateway_mappings(
                    desktop_models,
                    upstream_models,
                ));
            }
        }
        let mappings = desktop_gateway_model_mappings
            .as_ref()
            .filter(|items| !items.is_empty())
            .ok_or_else(|| {
                AppError::new(
                    "CLAUDE_GATEWAY_MAPPING_EMPTY",
                    "请配置模型映射。",
                    "先查询供应商模型，或手动添加至少一条映射。",
                )
            })?;
        if mappings
            .iter()
            .any(|mapping| !is_claude_desktop_model(&mapping.desktop_model))
        {
            return Err(AppError::new(
                "CLAUDE_GATEWAY_DESKTOP_MODEL_INVALID",
                "映射左侧必须是 Claude 可识别的模型名。",
                "使用 claude-* 或 anthropic/claude-* 作为桌面模型名。",
            ));
        }
        desktop_gateway_models = normalize_model_catalog(Some(
            mappings
                .iter()
                .map(|mapping| mapping.desktop_model.clone())
                .collect(),
        ));
    } else {
        let models = desktop_gateway_models
            .as_ref()
            .filter(|items| !items.is_empty())
            .ok_or_else(|| {
                AppError::new(
                    "CLAUDE_GATEWAY_MODELS_EMPTY",
                    "请填写模型目录。",
                    "点击获取模型，或手动填写 Claude 可识别模型。",
                )
            })?;
        if models.iter().any(|model| !is_claude_desktop_model(model)) {
            return Err(AppError::new(
                "CLAUDE_GATEWAY_MODELS_INVALID",
                "直连模式的模型目录必须使用 Claude 可识别模型名。",
                "如果供应商模型不是 Claude 模型，请切换到本地网关映射。",
            ));
        }
    }

    file.accounts[index].display_name = display_name;
    file.accounts[index].api_key = Some(api_key);
    file.accounts[index].api_base_url = Some(api_base_url);
    file.accounts[index].desktop_gateway_auth_scheme =
        Some(normalize_gateway_auth_scheme(&input.auth_scheme));
    file.accounts[index].desktop_gateway_connection_mode = Some(connection_mode);
    file.accounts[index].desktop_gateway_models = desktop_gateway_models;
    file.accounts[index].desktop_gateway_upstream_models = desktop_gateway_upstream_models;
    file.accounts[index].desktop_gateway_model_mappings = desktop_gateway_model_mappings;
    file.accounts[index].updated_at = now_timestamp();

    let updated = file.accounts[index].clone();
    save_accounts_file(file)?;
    Ok(updated.to_view(is_current_account(&current, &updated)))
}

pub fn import_api_key(input: ClaudeApiKeyInput) -> AppResult<ClaudeAccountView> {
    let display_name = normalize_required(
        &input.display_name,
        "CLAUDE_API_NAME_EMPTY",
        "显示名称不能为空。",
        "请输入一个易于识别的 Gateway 名称。",
    )?;
    let api_key = normalize_required(
        &input.api_key,
        "CLAUDE_API_KEY_EMPTY",
        "Gateway API Key 不能为空。",
        "请粘贴有效的 Gateway API Key。",
    )?;
    let api_base_url = normalize_required_url(
        &input.api_base_url,
        "CLAUDE_API_BASE_URL_EMPTY",
        "Base URL 不能为空。",
        "请填写完整的 Base URL。",
    )?;
    let connection_mode = normalize_gateway_connection_mode(&input.connection_mode);
    let mut desktop_gateway_models = normalize_model_catalog(Some(input.desktop_gateway_models));
    let desktop_gateway_upstream_models =
        normalize_model_catalog(input.desktop_gateway_upstream_models);
    let mut desktop_gateway_model_mappings =
        normalize_gateway_mappings(input.desktop_gateway_model_mappings);

    if connection_mode == "local_mapping" {
        if desktop_gateway_model_mappings.is_none() {
            if let (Some(desktop_models), Some(upstream_models)) = (
                desktop_gateway_models.as_ref(),
                desktop_gateway_upstream_models.as_ref(),
            ) {
                desktop_gateway_model_mappings = Some(build_default_gateway_mappings(
                    desktop_models,
                    upstream_models,
                ));
            }
        }
        let mappings = desktop_gateway_model_mappings
            .as_ref()
            .filter(|items| !items.is_empty())
            .ok_or_else(|| {
                AppError::new(
                    "CLAUDE_API_GATEWAY_MAPPING_EMPTY",
                    "本地网关映射不能为空。",
                    "请至少添加一个模型映射。",
                )
            })?;
        desktop_gateway_models = normalize_model_catalog(Some(
            mappings
                .iter()
                .map(|mapping| mapping.desktop_model.clone())
                .collect(),
        ));
    }

    let account = ClaudeAccount {
        id: make_account_id("claude-api", &display_name),
        display_name,
        email: None,
        auth_mode: ClaudeAuthMode::ApiKey,
        account_id: None,
        organization_name: None,
        plan_type: None,
        api_key: Some(api_key),
        api_base_url: Some(api_base_url),
        desktop_profile_dir: None,
        claude_credentials_raw: None,
        claude_config_raw: None,
        desktop_gateway_auth_scheme: Some(normalize_gateway_auth_scheme(&input.auth_scheme)),
        desktop_gateway_connection_mode: Some(connection_mode),
        desktop_gateway_models,
        desktop_gateway_upstream_models,
        desktop_gateway_model_mappings,
        tags: vec!["api".to_string(), "cli".to_string()],
        note: Some("Claude CLI Gateway".to_string()),
        created_at: now_timestamp(),
        updated_at: now_timestamp(),
        last_used_at: None,
    };

    let mut file = load_accounts_file()?;
    let saved = upsert_account(&mut file, account);
    save_accounts_file(file)?;
    Ok(saved.to_view(false))
}

pub fn update_api_key(account_id: &str, input: ClaudeApiKeyInput) -> AppResult<ClaudeAccountView> {
    let mut file = load_accounts_file()?;
    let current = storage::load_claude_current_accounts()?;
    let index = file
        .accounts
        .iter()
        .position(|account| account.id == account_id)
        .ok_or_else(|| {
            AppError::new(
                "CLAUDE_ACCOUNT_NOT_FOUND",
                "未找到 Claude 账号。",
                "请刷新列表后重试。",
            )
        })?;
    if file.accounts[index].auth_mode != ClaudeAuthMode::ApiKey {
        return Err(AppError::new(
        "CLAUDE_ACCOUNT_MODE_MISMATCH",
            "该账号不是 Gateway 类型。",
            "请选择一个 Claude Gateway 账号。",
        ));
    }

    let connection_mode = normalize_gateway_connection_mode(&input.connection_mode);
    let mut desktop_gateway_models = normalize_model_catalog(Some(input.desktop_gateway_models));
    let desktop_gateway_upstream_models =
        normalize_model_catalog(input.desktop_gateway_upstream_models);
    let mut desktop_gateway_model_mappings =
        normalize_gateway_mappings(input.desktop_gateway_model_mappings);

    if connection_mode == "local_mapping" {
        if desktop_gateway_model_mappings.is_none() {
            if let (Some(desktop_models), Some(upstream_models)) = (
                desktop_gateway_models.as_ref(),
                desktop_gateway_upstream_models.as_ref(),
            ) {
                desktop_gateway_model_mappings = Some(build_default_gateway_mappings(
                    desktop_models,
                    upstream_models,
                ));
            }
        }
        let mappings = desktop_gateway_model_mappings
            .as_ref()
            .filter(|items| !items.is_empty())
            .ok_or_else(|| {
                AppError::new(
                    "CLAUDE_API_GATEWAY_MAPPING_EMPTY",
                    "本地网关映射不能为空。",
                    "请至少添加一个模型映射。",
                )
            })?;
        desktop_gateway_models = normalize_model_catalog(Some(
            mappings
                .iter()
                .map(|mapping| mapping.desktop_model.clone())
                .collect(),
        ));
    }

    file.accounts[index].display_name = normalize_required(
        &input.display_name,
        "CLAUDE_API_NAME_EMPTY",
        "显示名称不能为空。",
        "请输入一个易于识别的 Gateway 名称。",
    )?;
    file.accounts[index].api_key = Some(normalize_required(
        &input.api_key,
        "CLAUDE_API_KEY_EMPTY",
        "Gateway API Key 不能为空。",
        "请粘贴有效的 Gateway API Key。",
    )?);
    file.accounts[index].api_base_url = Some(normalize_required_url(
        &input.api_base_url,
        "CLAUDE_API_BASE_URL_EMPTY",
        "Base URL 不能为空。",
        "请填写完整的 Base URL。",
    )?);
    file.accounts[index].desktop_gateway_auth_scheme =
        Some(normalize_gateway_auth_scheme(&input.auth_scheme));
    file.accounts[index].desktop_gateway_connection_mode = Some(connection_mode);
    file.accounts[index].desktop_gateway_models = desktop_gateway_models;
    file.accounts[index].desktop_gateway_upstream_models = desktop_gateway_upstream_models;
    file.accounts[index].desktop_gateway_model_mappings = desktop_gateway_model_mappings;
    file.accounts[index].updated_at = now_timestamp();
    let updated = file.accounts[index].clone();
    save_accounts_file(file)?;
    Ok(updated.to_view(is_current_account(&current, &updated)))
}

pub fn prepare_oauth_login() -> AppResult<ClaudeOauthPrepareResult> {
    let login_id = uuid::Uuid::new_v4().to_string();
    let authorize_url = format!("https://claude.ai/oauth/authorize?state={}", login_id);
    Ok(ClaudeOauthPrepareResult {
        login_id,
        authorize_url,
    })
}

pub fn complete_oauth_login(
    login_id: String,
    callback_or_code: String,
    email_hint: Option<String>,
) -> AppResult<ClaudeAccountView> {
    let callback = normalize_required(
        &callback_or_code,
        "CLAUDE_OAUTH_CALLBACK_EMPTY",
        "回调地址或 code 不能为空。",
        "请粘贴授权完成后的回调地址或 code。",
    )?;
    let email = normalize_optional(email_hint);
    let credentials_raw = serde_json::json!({
        "type": "claudeAiOauth",
        "loginId": login_id,
        "callbackOrCode": callback,
    })
    .to_string();
    let config_raw = serde_json::json!({
        "oauthAccount": {
            "emailHint": email,
        }
    })
    .to_string();

    let display_name = email
        .clone()
        .unwrap_or_else(|| "Claude CLI OAuth".to_string());
    let account = ClaudeAccount {
        id: make_account_id("claude-oauth", &display_name),
        display_name,
        email,
        auth_mode: ClaudeAuthMode::CliOAuth,
        account_id: None,
        organization_name: None,
        plan_type: None,
        api_key: None,
        api_base_url: None,
        desktop_profile_dir: None,
        claude_credentials_raw: Some(credentials_raw),
        claude_config_raw: Some(config_raw),
        desktop_gateway_auth_scheme: None,
        desktop_gateway_connection_mode: None,
        desktop_gateway_models: None,
        desktop_gateway_upstream_models: None,
        desktop_gateway_model_mappings: None,
        tags: vec!["oauth".to_string(), "cli".to_string()],
        note: Some("通过 OAuth 回调录入".to_string()),
        created_at: now_timestamp(),
        updated_at: now_timestamp(),
        last_used_at: None,
    };

    let mut file = load_accounts_file()?;
    let saved = upsert_account(&mut file, account);
    save_accounts_file(file)?;
    Ok(saved.to_view(false))
}

fn write_claude_cli_api_settings(account: &ClaudeAccount) -> AppResult<()> {
    let cli_dir = paths::default_claude_cli_dir()?;
    fs::create_dir_all(&cli_dir).map_err(|err| {
        AppError::new(
            "CLAUDE_DIR_CREATE_FAILED",
            format!("创建目录 {} 失败：{}", cli_dir.display(), err),
            "请检查目录权限。",
        )
    })?;
    let settings_path = cli_dir.join("settings.json");
    let mut settings = serde_json::Map::new();
    settings.insert(
        "env".to_string(),
        serde_json::json!({
            "ANTHROPIC_API_KEY": account.api_key.clone().unwrap_or_default(),
            "ANTHROPIC_BASE_URL": account.api_base_url.clone().unwrap_or_default(),
        }),
    );
    let content =
        serde_json::to_vec_pretty(&serde_json::Value::Object(settings)).map_err(|err| {
            AppError::new(
                "CLAUDE_JSON_SERIALIZE_FAILED",
                format!("序列化 Claude CLI settings.json 失败：{}", err),
                "请重试。",
            )
        })?;
    atomic_write::write_atomic(&settings_path, &content)
}

fn write_claude_cli_oauth(account: &ClaudeAccount) -> AppResult<()> {
    let cli_dir = paths::default_claude_cli_dir()?;
    fs::create_dir_all(&cli_dir).map_err(|err| {
        AppError::new(
            "CLAUDE_DIR_CREATE_FAILED",
            format!("创建目录 {} 失败：{}", cli_dir.display(), err),
            "请检查目录权限。",
        )
    })?;
    if let Some(credentials) = account.claude_credentials_raw.as_deref() {
        atomic_write::write_atomic(&cli_dir.join(".credentials.json"), credentials.as_bytes())?;
    }
    if let Some(config) = account.claude_config_raw.as_deref() {
        atomic_write::write_atomic(&cli_dir.join(".claude.json"), config.as_bytes())?;
    }
    Ok(())
}

fn write_claude_desktop_gateway(account: &ClaudeAccount) -> AppResult<()> {
    let desktop_dir = paths::default_claude_desktop_dir()?;
    fs::create_dir_all(&desktop_dir).map_err(|err| {
        AppError::new(
            "CLAUDE_DIR_CREATE_FAILED",
            format!("创建目录 {} 失败：{}", desktop_dir.display(), err),
            "请检查目录权限。",
        )
    })?;
    let mapping_meta = account
        .desktop_gateway_model_mappings
        .clone()
        .unwrap_or_default()
        .into_iter()
        .map(|mapping| (mapping.desktop_model.to_ascii_lowercase(), mapping))
        .collect::<std::collections::BTreeMap<_, _>>();
    let inference_models = account.desktop_gateway_models.as_ref().map(|models| {
        serde_json::Value::Array(
            models
                .iter()
                .filter_map(|model| {
                    let name = model.trim();
                    if name.is_empty() {
                        return None;
                    }
                    let mut item = serde_json::json!({ "name": name });
                    if let Some(mapping) = mapping_meta.get(&name.to_ascii_lowercase()) {
                        if let Some(label) = mapping
                            .label_override
                            .as_deref()
                            .map(str::trim)
                            .filter(|value| !value.is_empty())
                        {
                            item["labelOverride"] = serde_json::Value::String(label.to_string());
                        }
                        if mapping.supports_1m.unwrap_or(false) {
                            item["supports1m"] = serde_json::Value::Bool(true);
                        }
                    }
                    Some(item)
                })
                .collect(),
        )
    });
    let connection_mode = normalize_gateway_connection_mode(
        account
            .desktop_gateway_connection_mode
            .as_deref()
            .unwrap_or("direct"),
    );
    let (base_url, api_key, auth_scheme) = if connection_mode == "local_mapping" {
        let endpoint = claude_desktop_gateway_service::ensure_gateway_for_account(account)?;
        (endpoint.base_url, endpoint.api_key, "bearer".to_string())
    } else {
        (
            account
                .api_base_url
                .as_deref()
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .ok_or_else(|| {
                    AppError::new(
                        "CLAUDE_GATEWAY_BASE_URL_MISSING",
                        "Claude Gateway 账号缺少 Base URL。",
                        "请编辑账号后重试。",
                    )
                })?
                .to_string(),
            account
                .api_key
                .as_deref()
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .ok_or_else(|| {
                    AppError::new(
                        "CLAUDE_GATEWAY_API_KEY_MISSING",
                        "Claude Gateway 账号缺少 API Key。",
                        "请编辑账号后重试。",
                    )
                })?
                .to_string(),
            account
                .desktop_gateway_auth_scheme
                .as_deref()
                .map(|scheme| {
                    let normalized = normalize_gateway_auth_scheme(&scheme);
                    if normalized == "auto" {
                        "bearer".to_string()
                    } else {
                        normalized
                    }
                })
                .unwrap_or_else(|| "bearer".to_string()),
        )
    };
    let mut payload = serde_json::json!({
        "deploymentMode": "3p",
        "coworkEgressAllowedHosts": ["*"],
        "disableDeploymentModeChooser": true,
        "inferenceProvider": "gateway",
        "inferenceGatewayApiKey": api_key,
        "inferenceGatewayBaseUrl": base_url,
        "inferenceGatewayAuthScheme": auth_scheme,
        "connectionMode": connection_mode,
        "gatewayUpstreamModels": account.desktop_gateway_upstream_models.clone(),
        "gatewayModelMappings": account.desktop_gateway_model_mappings.clone(),
    });
    if let Some(models) = inference_models {
        payload["inferenceModels"] = models;
    }
    let content = serde_json::to_vec_pretty(&payload).map_err(|err| {
        AppError::new(
            "CLAUDE_JSON_SERIALIZE_FAILED",
            format!("序列化 Claude Desktop Gateway 配置失败：{}", err),
            "请重试。",
        )
    })?;
    atomic_write::write_atomic(&desktop_dir.join("claude_desktop_config.json"), &content)
}

fn restore_claude_desktop_snapshot(account: &ClaudeAccount) -> AppResult<()> {
    let source = account
        .desktop_profile_dir
        .as_deref()
        .map(PathBuf::from)
        .ok_or_else(|| {
            AppError::new(
                "CLAUDE_PROFILE_MISSING",
                "该 Desktop 账号没有可恢复的 profile 快照。",
                "请重新导入 Claude Desktop 账号。",
            )
        })?;
    let desktop_dir = paths::default_claude_desktop_dir()?;
    remove_dir_if_exists(&desktop_dir)?;
    copy_dir_all(&source, &desktop_dir)
}

pub fn switch_account(account_id: String) -> AppResult<ClaudeSwitchResult> {
    let mut file = load_accounts_file()?;
    let index = file
        .accounts
        .iter()
        .position(|account| account.id == account_id)
        .ok_or_else(|| {
            AppError::new(
                "CLAUDE_ACCOUNT_NOT_FOUND",
                "未找到 Claude 账号。",
                "请刷新列表后重试。",
            )
        })?;
    let mut account = file.accounts[index].clone();
    let warnings = Vec::new();

    match account.auth_mode {
        ClaudeAuthMode::DesktopOAuth => restore_claude_desktop_snapshot(&account)?,
        ClaudeAuthMode::DesktopGateway => write_claude_desktop_gateway(&account)?,
        ClaudeAuthMode::CliOAuth => write_claude_cli_oauth(&account)?,
        ClaudeAuthMode::ApiKey => write_claude_cli_api_settings(&account)?,
    }

    let mut current = storage::load_claude_current_accounts()?;
    match current_slot_for_mode(&account.auth_mode) {
        "desktop" => current.claude_desktop_account = Some(account.id.clone()),
        _ => current.claude_code_account = Some(account.id.clone()),
    }
    storage::save_claude_current_accounts(current.clone())?;

    account.last_used_at = Some(now_timestamp());
    account.updated_at = now_timestamp();
    file.accounts[index] = account.clone();
    save_accounts_file(file)?;

    Ok(ClaudeSwitchResult {
        account: account.to_view(true),
        warnings,
        current_accounts: current,
    })
}
