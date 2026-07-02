use std::ffi::OsStr;
use std::fs;
use std::io::{self, Read};
use std::path::Path;
use std::process::Command;

use serde::Deserialize;
use serde_json::{Map, Value};
use tauri::{AppHandle, LogicalSize, Manager, WebviewUrl, WebviewWindowBuilder};

use crate::infra::{atomic_write, paths};
use crate::models::error::{AppError, AppResult};
use crate::models::working_light::{
    WorkingLightAgent, WorkingLightAgentState, WorkingLightAgentStatus, WorkingLightDetection,
    WorkingLightHookInstallation, WorkingLightHookStatus, WorkingLightPreferences,
    WorkingLightSnapshot, WorkingLightStateFile,
};
use crate::services::codex_app_service;

const WINDOW_LABEL: &str = "working-light";
const WINDOW_HEIGHT: f64 = 56.0;
const SINGLE_AGENT_WINDOW_WIDTH: f64 = 122.0;
const DOUBLE_AGENT_WINDOW_WIDTH: f64 = 212.0;
const MANUAL_WORKING_AUTO_IDLE_SECONDS: i64 = 15;
const CODEX_HOOKS_START: &str = "# >>> nuomi-switch working light codex hooks start";
const CODEX_HOOKS_END: &str = "# <<< nuomi-switch working light codex hooks end";

const AGENTS: [WorkingLightAgent; 2] = [WorkingLightAgent::Codex, WorkingLightAgent::Claude];
const STATES: [WorkingLightAgentState; 5] = [
    WorkingLightAgentState::Idle,
    WorkingLightAgentState::Working,
    WorkingLightAgentState::Done,
    WorkingLightAgentState::Waiting,
    WorkingLightAgentState::Error,
];

struct CodexHookSpec {
    name: &'static str,
    matcher: Option<&'static str>,
    status_message: &'static str,
}

struct ClaudeHookSpec {
    name: &'static str,
    matcher: Option<&'static str>,
}

const CODEX_HOOK_SPECS: [CodexHookSpec; 6] = [
    CodexHookSpec {
        name: "UserPromptSubmit",
        matcher: None,
        status_message: "Nuomi Switch: Codex working",
    },
    CodexHookSpec {
        name: "PreToolUse",
        matcher: Some(".*"),
        status_message: "Nuomi Switch: Codex working",
    },
    CodexHookSpec {
        name: "PermissionRequest",
        matcher: Some(".*"),
        status_message: "Nuomi Switch: Codex waiting",
    },
    CodexHookSpec {
        name: "Stop",
        matcher: None,
        status_message: "Nuomi Switch: Codex done",
    },
    CodexHookSpec {
        name: "SubagentStart",
        matcher: Some(".*"),
        status_message: "Nuomi Switch: Codex subagent working",
    },
    CodexHookSpec {
        name: "SubagentStop",
        matcher: Some(".*"),
        status_message: "Nuomi Switch: Codex subagent done",
    },
];

const CLAUDE_HOOK_SPECS: [ClaudeHookSpec; 7] = [
    ClaudeHookSpec {
        name: "UserPromptSubmit",
        matcher: None,
    },
    ClaudeHookSpec {
        name: "PreToolUse",
        matcher: Some("*"),
    },
    ClaudeHookSpec {
        name: "PermissionRequest",
        matcher: None,
    },
    ClaudeHookSpec {
        name: "Notification",
        matcher: None,
    },
    ClaudeHookSpec {
        name: "Stop",
        matcher: None,
    },
    ClaudeHookSpec {
        name: "StopFailure",
        matcher: None,
    },
    ClaudeHookSpec {
        name: "SubagentStop",
        matcher: None,
    },
];

#[derive(Debug, Clone)]
struct ProcessRecord {
    pid: Option<u32>,
    command: String,
    args: String,
}

pub fn get_snapshot() -> AppResult<WorkingLightSnapshot> {
    Ok(WorkingLightSnapshot {
        state: read_state()?,
        preferences: read_preferences()?,
        detections: detect_agents(),
    })
}

pub fn read_state() -> AppResult<WorkingLightStateFile> {
    let path = paths::working_light_state_file_path()?;
    let mut state = read_json_or_default(&path, WorkingLightStateFile::default())?;
    let preferences = read_preferences()?;
    if apply_state_expiry(&mut state, &preferences) {
        write_state(&state)?;
    }
    Ok(state)
}

pub fn write_state(state: &WorkingLightStateFile) -> AppResult<()> {
    let path = paths::working_light_state_file_path()?;
    write_json(&path, state)
}

pub fn update_agent_state(
    agent: WorkingLightAgent,
    state: WorkingLightAgentState,
    message: Option<String>,
) -> AppResult<WorkingLightStateFile> {
    let mut current = read_state()?;
    *agent_status_mut(&mut current, agent) = WorkingLightAgentStatus {
        state,
        updated_at: now_millis(),
        message,
    };
    write_state(&current)?;
    Ok(current)
}

pub fn read_preferences() -> AppResult<WorkingLightPreferences> {
    let path = paths::working_light_preferences_file_path()?;
    read_json_or_default(&path, WorkingLightPreferences::default())
}

pub fn set_muted(muted: bool) -> AppResult<WorkingLightPreferences> {
    let mut preferences = read_preferences()?;
    preferences.muted = muted;
    let path = paths::working_light_preferences_file_path()?;
    write_json(&path, &preferences)?;
    Ok(preferences)
}

pub fn set_window_enabled(app: &AppHandle, enabled: bool) -> AppResult<WorkingLightPreferences> {
    if enabled {
        show_window(app)?;
    } else {
        hide_window(app)?;
    }

    let mut preferences = read_preferences()?;
    preferences.window_enabled = enabled;
    let path = paths::working_light_preferences_file_path()?;
    write_json(&path, &preferences)?;
    Ok(preferences)
}

pub fn set_agent_enabled(
    agent: WorkingLightAgent,
    enabled: bool,
) -> AppResult<WorkingLightPreferences> {
    let mut preferences = read_preferences()?;
    match agent {
        WorkingLightAgent::Codex => preferences.codex_enabled = enabled,
        WorkingLightAgent::Claude => preferences.claude_enabled = enabled,
    }
    let path = paths::working_light_preferences_file_path()?;
    write_json(&path, &preferences)?;
    Ok(preferences)
}

pub fn get_hook_status() -> AppResult<WorkingLightHookStatus> {
    let codex_path = paths::default_codex_config_file()?;
    let claude_path = paths::default_claude_cli_dir()?.join("settings.json");
    let executable_path = current_executable_path()?;

    let codex_content = fs::read_to_string(&codex_path).unwrap_or_default();
    let claude_settings = fs::read_to_string(&claude_path)
        .ok()
        .and_then(|content| serde_json::from_str::<Value>(&content).ok())
        .unwrap_or(Value::Null);
    let codex_installed = codex_hooks_installed(&codex_content)?;

    Ok(WorkingLightHookStatus {
        codex: WorkingLightHookInstallation {
            installed: codex_installed,
            authorized: Some(codex_installed && codex_hooks_authorized(&codex_content)),
            path: codex_path.display().to_string(),
        },
        claude: WorkingLightHookInstallation {
            installed: claude_hooks_installed(&claude_settings)?,
            authorized: None,
            path: claude_path.display().to_string(),
        },
        executable_path: executable_path.display().to_string(),
    })
}

pub fn install_hooks(agent: WorkingLightAgent) -> AppResult<WorkingLightHookStatus> {
    match agent {
        WorkingLightAgent::Codex => install_codex_hooks()?,
        WorkingLightAgent::Claude => install_claude_hooks()?,
    }
    get_hook_status()
}

pub fn show_window(app: &AppHandle) -> AppResult<()> {
    if let Some(window) = app.get_webview_window(WINDOW_LABEL) {
        show_existing_window(&window)?;
        return Ok(());
    }

    let (x, y) = resolve_initial_position(app, DOUBLE_AGENT_WINDOW_WIDTH, WINDOW_HEIGHT);
    let window = WebviewWindowBuilder::new(app, WINDOW_LABEL, WebviewUrl::App("index.html".into()))
        .title("Nuomi Working Light")
        .inner_size(DOUBLE_AGENT_WINDOW_WIDTH, WINDOW_HEIGHT)
        .min_inner_size(SINGLE_AGENT_WINDOW_WIDTH, WINDOW_HEIGHT)
        .max_inner_size(DOUBLE_AGENT_WINDOW_WIDTH, WINDOW_HEIGHT)
        .position(x, y)
        .decorations(false)
        .resizable(false)
        .transparent(true)
        .always_on_top(true)
        .visible_on_all_workspaces(true)
        .skip_taskbar(true)
        .shadow(false)
        .focused(false)
        .accept_first_mouse(true)
        .visible(false)
        .build()
        .map_err(|error| {
            AppError::new(
                "WORKING_LIGHT_WINDOW_CREATE_FAILED",
                format!("创建工作悬浮窗失败：{error}"),
                "请重启应用后再试。",
            )
        })?;

    show_existing_window(&window)?;
    Ok(())
}

pub fn hide_window(app: &AppHandle) -> AppResult<()> {
    if let Some(window) = app.get_webview_window(WINDOW_LABEL) {
        window.hide().map_err(|error| {
            AppError::new(
                "WORKING_LIGHT_WINDOW_HIDE_FAILED",
                format!("隐藏工作悬浮窗失败：{error}"),
                "请重试。",
            )
        })?;
    }
    Ok(())
}

pub fn close_window(app: &AppHandle) -> AppResult<()> {
    if let Some(window) = app.get_webview_window(WINDOW_LABEL) {
        window.close().map_err(|error| {
            AppError::new(
                "WORKING_LIGHT_WINDOW_CLOSE_FAILED",
                format!("关闭工作悬浮窗失败：{error}"),
                "请重试。",
            )
        })?;
    }
    Ok(())
}

pub fn resize_window_for_agent_count(app: &AppHandle, visible_agent_count: usize) -> AppResult<()> {
    let Some(window) = app.get_webview_window(WINDOW_LABEL) else {
        return Ok(());
    };

    let width = resolve_window_width(visible_agent_count);
    window
        .set_size(LogicalSize::new(width, WINDOW_HEIGHT))
        .map_err(|error| {
            AppError::new(
                "WORKING_LIGHT_WINDOW_RESIZE_FAILED",
                format!("调整工作悬浮窗大小失败：{error}"),
                "请重新打开悬浮窗。",
            )
        })?;
    Ok(())
}

pub fn activate_agent(agent: WorkingLightAgent) -> AppResult<()> {
    match agent {
        WorkingLightAgent::Codex => codex_app_service::activate_codex(),
        WorkingLightAgent::Claude => Err(AppError::new(
            "WORKING_LIGHT_AGENT_ACTIVATE_UNSUPPORTED",
            "暂不支持从悬浮窗打开 Claude。",
            "请手动打开 Claude。",
        )),
    }
}

pub fn decide_hook_state(
    agent: WorkingLightAgent,
    hook_name: &str,
    input: &Value,
    _previous_state: WorkingLightAgentState,
) -> (WorkingLightAgent, WorkingLightAgentState, String) {
    if hook_name == "Stop" {
        let assistant_text = extract_assistant_text(input);
        let next_state = if looks_like_waiting_for_user(&assistant_text) {
            WorkingLightAgentState::Waiting
        } else {
            WorkingLightAgentState::Done
        };
        return (agent, next_state, hook_name.to_string());
    }

    let state = match hook_name {
        "SessionStart" => WorkingLightAgentState::Idle,
        "UserPromptSubmit" | "PreToolUse" | "PostToolUse" | "SubagentStart" => {
            WorkingLightAgentState::Working
        }
        "PermissionRequest" | "Notification" => WorkingLightAgentState::Waiting,
        "StopFailure" => WorkingLightAgentState::Error,
        "SubagentStop" => WorkingLightAgentState::Done,
        _ => WorkingLightAgentState::Working,
    };
    (agent, state, hook_name.to_string())
}

pub fn run_cli(args: &[String]) -> AppResult<Option<String>> {
    let Some(command) = args.first().map(String::as_str) else {
        return Ok(None);
    };

    if command != "working-light" && command != "working-light-hook" {
        return Ok(None);
    }

    if command == "working-light-hook" {
        let agent = parse_agent(args.get(1).map(String::as_str))?;
        let hook_name = args.get(2).map(String::as_str).unwrap_or("Unknown");
        let mut raw = String::new();
        io::stdin().read_to_string(&mut raw).map_err(|error| {
            AppError::new(
                "WORKING_LIGHT_HOOK_READ_FAILED",
                format!("读取 hook 输入失败：{error}"),
                "请检查 hook 命令是否可读取标准输入。",
            )
        })?;
        let input = parse_hook_input(&raw)?;
        let current = read_state()?;
        let previous_state = agent_status(&current, agent).state;
        let (agent, state, message) = decide_hook_state(agent, hook_name, &input, previous_state);
        update_agent_state(agent, state, Some(message.clone()))?;
        if agent == WorkingLightAgent::Codex {
            return Ok(Some("{}".to_string()));
        }
        return Ok(Some(String::new()));
    }

    match args.get(1).map(String::as_str) {
        Some("set") => {
            let agent = parse_agent(args.get(2).map(String::as_str))?;
            let state = parse_state(args.get(3).map(String::as_str))?;
            let message = args.get(4..).map(|parts| parts.join(" ")).filter(|s| !s.is_empty());
            update_agent_state(agent, state, message)?;
            Ok(Some(format!("{} -> {}", agent.as_str(), state.as_str())))
        }
        Some("status") => {
            let snapshot = get_snapshot()?;
            if args.iter().any(|arg| arg == "--json") {
                serde_json::to_string_pretty(&snapshot)
                    .map(Some)
                    .map_err(|error| {
                        AppError::new(
                            "WORKING_LIGHT_STATUS_SERIALIZE_FAILED",
                            format!("序列化工作灯状态失败：{error}"),
                            "请重试。",
                        )
                    })
            } else {
                Ok(Some(format_status(snapshot)))
            }
        }
        Some("hook-status") => serde_json::to_string_pretty(&get_hook_status()?)
            .map(Some)
            .map_err(|error| {
                AppError::new(
                    "WORKING_LIGHT_HOOK_STATUS_SERIALIZE_FAILED",
                    format!("序列化 hook 安装状态失败：{error}"),
                    "请重试。",
                )
            }),
        Some("install-hooks") => {
            match args.get(2).map(String::as_str) {
                Some("all") | None => {
                    install_hooks(WorkingLightAgent::Codex)?;
                    install_hooks(WorkingLightAgent::Claude)?;
                }
                value => {
                    install_hooks(parse_agent(value)?)?;
                }
            }
            serde_json::to_string_pretty(&get_hook_status()?)
                .map(Some)
                .map_err(|error| {
                    AppError::new(
                        "WORKING_LIGHT_HOOK_STATUS_SERIALIZE_FAILED",
                        format!("序列化 hook 安装状态失败：{error}"),
                        "请重试。",
                    )
                })
        }
        Some("mute") => {
            set_muted(true)?;
            Ok(Some("muted: true".to_string()))
        }
        Some("unmute") => {
            set_muted(false)?;
            Ok(Some("muted: false".to_string()))
        }
        _ => Err(AppError::new(
            "WORKING_LIGHT_CLI_USAGE",
            "未知工作灯命令。",
            "用法：working-light set/status/hook-status/install-hooks/mute/unmute 或 working-light-hook <codex|claude> <HookName>。",
        )),
    }
}

fn install_codex_hooks() -> AppResult<()> {
    let path = paths::default_codex_config_file()?;
    let content = fs::read_to_string(&path).unwrap_or_default();
    let block = build_codex_hooks_block()?;
    let next = upsert_managed_block(&content, CODEX_HOOKS_START, CODEX_HOOKS_END, &block);
    if next == content {
        return Ok(());
    }
    backup_existing_file(&path, "codex-config")?;
    write_text_file(&path, &next)
}

fn install_claude_hooks() -> AppResult<()> {
    let path = paths::default_claude_cli_dir()?.join("settings.json");
    let original_content = fs::read_to_string(&path).ok();
    let mut settings = match fs::read_to_string(&path) {
        Ok(content) if !content.trim().is_empty() => serde_json::from_str::<Value>(&content)
            .map_err(|error| {
                AppError::new(
                    "WORKING_LIGHT_CLAUDE_SETTINGS_INVALID",
                    format!("解析 {} 失败：{error}", path.display()),
                    "请先修复 Claude settings.json 后再安装悬浮窗识别。",
                )
            })?,
        _ => Value::Object(Map::new()),
    };

    let Some(settings_object) = settings.as_object_mut() else {
        return Err(AppError::new(
            "WORKING_LIGHT_CLAUDE_SETTINGS_NOT_OBJECT",
            "Claude settings.json 不是 JSON 对象。",
            "请先修复 Claude settings.json 后再安装悬浮窗识别。",
        ));
    };

    let hooks_value = settings_object
        .entry("hooks".to_string())
        .or_insert_with(|| Value::Object(Map::new()));
    let Some(hooks_object) = hooks_value.as_object_mut() else {
        return Err(AppError::new(
            "WORKING_LIGHT_CLAUDE_HOOKS_NOT_OBJECT",
            "Claude hooks 配置不是 JSON 对象。",
            "请先修复 settings.json 中的 hooks 字段后再安装悬浮窗识别。",
        ));
    };

    for spec in CLAUDE_HOOK_SPECS {
        let hooks = hooks_object
            .entry(spec.name.to_string())
            .or_insert_with(|| Value::Array(Vec::new()));
        let Some(items) = hooks.as_array_mut() else {
            return Err(AppError::new(
                "WORKING_LIGHT_CLAUDE_HOOK_EVENT_NOT_ARRAY",
                format!("Claude hooks.{} 不是数组。", spec.name),
                "请先修复 settings.json 中该 hook 事件后再安装悬浮窗识别。",
            ));
        };

        items.retain(|item| !json_contains_text(item, "working-light-hook claude"));
        items.push(build_claude_hook_entry(spec)?);
    }

    let next_content = serde_json::to_vec_pretty(&settings).map_err(|error| {
        AppError::new(
            "WORKING_LIGHT_SERIALIZE_FAILED",
            format!("序列化 Claude hook 配置失败：{error}"),
            "请重试。",
        )
    })?;
    if original_content
        .as_deref()
        .map(|content| content.as_bytes() == next_content.as_slice())
        .unwrap_or(false)
    {
        return Ok(());
    }
    backup_existing_file(&path, "claude-settings")?;
    atomic_write::write_atomic(&path, &next_content)
}

fn build_codex_hooks_block() -> AppResult<String> {
    let mut lines = Vec::new();
    for spec in CODEX_HOOK_SPECS {
        lines.push(format!("[[hooks.{}]]", spec.name));
        if let Some(matcher) = spec.matcher {
            lines.push(format!("matcher = {}", toml_basic_string(matcher)));
        }
        lines.push(format!("[[hooks.{}.hooks]]", spec.name));
        lines.push("type = \"command\"".to_string());
        lines.push(format!(
            "command = {}",
            toml_basic_string(&hook_command(WorkingLightAgent::Codex, spec.name)?)
        ));
        lines.push("timeout = 5".to_string());
        lines.push(format!(
            "statusMessage = {}",
            toml_basic_string(spec.status_message)
        ));
        lines.push(String::new());
    }
    Ok(lines.join("\n").trim_end().to_string())
}

fn build_claude_hook_entry(spec: ClaudeHookSpec) -> AppResult<Value> {
    let mut command = Map::new();
    command.insert("type".to_string(), Value::String("command".to_string()));
    command.insert(
        "command".to_string(),
        Value::String(hook_command(WorkingLightAgent::Claude, spec.name)?),
    );

    let mut entry = Map::new();
    if let Some(matcher) = spec.matcher {
        entry.insert("matcher".to_string(), Value::String(matcher.to_string()));
    }
    entry.insert(
        "hooks".to_string(),
        Value::Array(vec![Value::Object(command)]),
    );
    Ok(Value::Object(entry))
}

fn codex_hooks_installed(content: &str) -> AppResult<bool> {
    if !content.contains(CODEX_HOOKS_START) {
        return Ok(false);
    }
    for spec in CODEX_HOOK_SPECS {
        if !content.contains(&hook_command(WorkingLightAgent::Codex, spec.name)?) {
            return Ok(false);
        }
    }
    Ok(true)
}

fn codex_hooks_authorized(content: &str) -> bool {
    CODEX_HOOK_SPECS
        .iter()
        .all(|spec| codex_hook_authorized(content, spec.name))
}

fn codex_hook_authorized(content: &str, hook_name: &str) -> bool {
    let Some(event_name) = codex_hook_state_event_name(hook_name) else {
        return false;
    };
    let event_marker = format!(":{event_name}:");
    let mut lines = content.lines().peekable();

    while let Some(line) = lines.next() {
        let trimmed = line.trim();
        if !trimmed.starts_with("[hooks.state.") || !trimmed.contains(&event_marker) {
            continue;
        }

        while let Some(next_line) = lines.peek() {
            let next_trimmed = next_line.trim();
            if next_trimmed.starts_with('[') {
                break;
            }
            if next_trimmed.starts_with("trusted_hash") && next_trimmed.contains("\"sha256:") {
                return true;
            }
            lines.next();
        }
    }

    false
}

fn codex_hook_state_event_name(hook_name: &str) -> Option<&'static str> {
    match hook_name {
        "UserPromptSubmit" => Some("user_prompt_submit"),
        "PreToolUse" => Some("pre_tool_use"),
        "PermissionRequest" => Some("permission_request"),
        "Stop" => Some("stop"),
        "SubagentStart" => Some("subagent_start"),
        "SubagentStop" => Some("subagent_stop"),
        _ => None,
    }
}

fn claude_hooks_installed(settings: &Value) -> AppResult<bool> {
    for spec in CLAUDE_HOOK_SPECS {
        if !json_contains_text(
            settings,
            &hook_command(WorkingLightAgent::Claude, spec.name)?,
        ) {
            return Ok(false);
        }
    }
    Ok(true)
}

fn hook_command(agent: WorkingLightAgent, hook_name: &str) -> AppResult<String> {
    let executable = current_executable_path()?;
    Ok(format!(
        "{} working-light-hook {} {}",
        shell_quote(&executable.display().to_string()),
        agent.as_str(),
        hook_name
    ))
}

fn current_executable_path() -> AppResult<std::path::PathBuf> {
    std::env::current_exe().map_err(|error| {
        AppError::new(
            "WORKING_LIGHT_EXE_PATH_FAILED",
            format!("无法解析当前应用程序路径：{error}"),
            "请重启 Nuomi Switch 后再安装悬浮窗识别。",
        )
    })
}

fn write_text_file(path: &Path, content: &str) -> AppResult<()> {
    atomic_write::write_atomic(path, content.as_bytes())
}

fn backup_existing_file(path: &Path, label: &str) -> AppResult<()> {
    if !path.exists() {
        return Ok(());
    }

    let backups_dir = paths::backups_dir()?.join("working-light-hooks");
    fs::create_dir_all(&backups_dir).map_err(|error| {
        AppError::new(
            "WORKING_LIGHT_BACKUP_CREATE_FAILED",
            format!("创建 hook 配置备份目录失败：{error}"),
            "请检查应用数据目录权限。",
        )
    })?;
    let extension = path
        .extension()
        .and_then(OsStr::to_str)
        .map(|value| format!(".{value}"))
        .unwrap_or_default();
    let backup_path = backups_dir.join(format!(
        "{}-{}{}",
        chrono::Utc::now().format("%Y%m%d-%H%M%S"),
        label,
        extension
    ));
    fs::copy(path, &backup_path).map(|_| ()).map_err(|error| {
        AppError::new(
            "WORKING_LIGHT_BACKUP_FAILED",
            format!("备份 {} 失败：{error}", path.display()),
            "请检查文件权限后重试。",
        )
    })
}

fn upsert_managed_block(content: &str, start: &str, end: &str, block: &str) -> String {
    let managed = format!("{start}\n{}\n{end}", block.trim_end());
    if let Some(start_index) = content.find(start) {
        if let Some(end_relative) = content[start_index..].find(end) {
            let end_index = start_index + end_relative + end.len();
            let before = content[..start_index].trim_end();
            let after =
                content[end_index..].trim_start_matches(|value| value == '\n' || value == '\r');
            let mut next = String::new();
            if !before.is_empty() {
                next.push_str(before);
                next.push_str("\n\n");
            }
            next.push_str(&managed);
            if !after.trim().is_empty() {
                next.push_str("\n\n");
                next.push_str(after.trim_start());
            }
            if !next.ends_with('\n') {
                next.push('\n');
            }
            return next;
        }
    }

    let mut next = content.trim_end().to_string();
    if !next.is_empty() {
        next.push_str("\n\n");
    }
    next.push_str(&managed);
    next.push('\n');
    next
}

fn shell_quote(value: &str) -> String {
    if value
        .chars()
        .all(|character| character.is_ascii_alphanumeric() || "-_./:@%+=".contains(character))
    {
        return value.to_string();
    }
    format!("'{}'", value.replace('\'', "'\\''"))
}

fn toml_basic_string(value: &str) -> String {
    let mut output = String::from("\"");
    for character in value.chars() {
        match character {
            '\\' => output.push_str("\\\\"),
            '"' => output.push_str("\\\""),
            '\n' => output.push_str("\\n"),
            '\r' => output.push_str("\\r"),
            '\t' => output.push_str("\\t"),
            other => output.push(other),
        }
    }
    output.push('"');
    output
}

fn json_contains_text(value: &Value, needle: &str) -> bool {
    match value {
        Value::String(text) => text.contains(needle),
        Value::Array(items) => items.iter().any(|item| json_contains_text(item, needle)),
        Value::Object(object) => object.values().any(|item| json_contains_text(item, needle)),
        _ => false,
    }
}

pub fn detect_agents() -> Vec<WorkingLightDetection> {
    let processes = read_processes();
    AGENTS
        .iter()
        .map(|agent| detect_agent_in_processes(*agent, &processes))
        .collect()
}

fn show_existing_window(window: &tauri::WebviewWindow) -> AppResult<()> {
    window.set_always_on_top(true).map_err(|error| {
        AppError::new(
            "WORKING_LIGHT_WINDOW_TOP_FAILED",
            format!("设置工作悬浮窗置顶失败：{error}"),
            "请重新打开悬浮窗。",
        )
    })?;
    #[cfg(any(target_os = "macos", target_os = "linux"))]
    window
        .set_visible_on_all_workspaces(true)
        .map_err(|error| {
            AppError::new(
                "WORKING_LIGHT_WINDOW_WORKSPACE_FAILED",
                format!("设置工作悬浮窗跨桌面显示失败：{error}"),
                "请重新打开悬浮窗。",
            )
        })?;
    window.show().map_err(|error| {
        AppError::new(
            "WORKING_LIGHT_WINDOW_SHOW_FAILED",
            format!("显示工作悬浮窗失败：{error}"),
            "请重启应用后再试。",
        )
    })?;
    Ok(())
}

fn read_json_or_default<T>(path: &Path, fallback: T) -> AppResult<T>
where
    T: for<'de> Deserialize<'de>,
{
    if !path.exists() {
        return Ok(fallback);
    }

    let content = fs::read_to_string(path).map_err(|error| {
        AppError::new(
            "WORKING_LIGHT_READ_FAILED",
            format!("读取 {} 失败：{}", path.display(), error),
            "请打开数据目录并检查文件权限。",
        )
    })?;
    serde_json::from_str(&content).map_err(|error| {
        AppError::new(
            "WORKING_LIGHT_INVALID_FORMAT",
            format!("解析 {} 失败：{}", path.display(), error),
            "请备份并删除该工作灯状态文件后重试。",
        )
    })
}

fn write_json<T: serde::Serialize>(path: &Path, value: &T) -> AppResult<()> {
    let content = serde_json::to_vec_pretty(value).map_err(|error| {
        AppError::new(
            "WORKING_LIGHT_SERIALIZE_FAILED",
            format!("序列化工作灯数据失败：{error}"),
            "请重试。",
        )
    })?;
    atomic_write::write_atomic(path, &content)
}

fn now_millis() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

fn agent_status(
    state: &WorkingLightStateFile,
    agent: WorkingLightAgent,
) -> &WorkingLightAgentStatus {
    match agent {
        WorkingLightAgent::Codex => &state.agents.codex,
        WorkingLightAgent::Claude => &state.agents.claude,
    }
}

fn agent_status_mut(
    state: &mut WorkingLightStateFile,
    agent: WorkingLightAgent,
) -> &mut WorkingLightAgentStatus {
    match agent {
        WorkingLightAgent::Codex => &mut state.agents.codex,
        WorkingLightAgent::Claude => &mut state.agents.claude,
    }
}

fn apply_state_expiry(
    state: &mut WorkingLightStateFile,
    preferences: &WorkingLightPreferences,
) -> bool {
    if preferences.done_auto_idle_seconds == 0 {
        return false;
    }

    let now = now_millis();
    let auto_idle_ms = preferences.done_auto_idle_seconds as i64 * 1000;
    let mut changed = false;

    for agent in AGENTS {
        let status = agent_status_mut(state, agent);
        if status.state == WorkingLightAgentState::Done
            && status.updated_at > 0
            && now.saturating_sub(status.updated_at) >= auto_idle_ms
        {
            *status = WorkingLightAgentStatus {
                state: WorkingLightAgentState::Idle,
                updated_at: now,
                message: Some("auto-idle".to_string()),
            };
            changed = true;
        }

        if status.state == WorkingLightAgentState::Working
            && status.message.as_deref() == Some("ui")
            && status.updated_at > 0
            && now.saturating_sub(status.updated_at) >= MANUAL_WORKING_AUTO_IDLE_SECONDS * 1000
        {
            *status = WorkingLightAgentStatus {
                state: WorkingLightAgentState::Idle,
                updated_at: now,
                message: Some("manual-auto-idle".to_string()),
            };
            changed = true;
        }
    }

    changed
}

fn resolve_window_width(visible_agent_count: usize) -> f64 {
    if visible_agent_count >= 2 {
        DOUBLE_AGENT_WINDOW_WIDTH
    } else {
        SINGLE_AGENT_WINDOW_WIDTH
    }
}

fn resolve_initial_position(app: &AppHandle, width: f64, height: f64) -> (f64, f64) {
    let padding = 24.0;
    let fallback = (120.0, 120.0);
    let Ok(Some(monitor)) = app.primary_monitor() else {
        return fallback;
    };
    let scale = monitor.scale_factor();
    let area = monitor.work_area();
    let area_x = area.position.x as f64 / scale;
    let area_y = area.position.y as f64 / scale;
    let area_width = area.size.width as f64 / scale;
    let target_x = area_x + area_width - width - padding;
    let target_y = area_y + 96.0;

    if target_x.is_finite() && target_y.is_finite() && target_x >= area_x && target_y >= area_y {
        (target_x, target_y)
    } else {
        (fallback.0, fallback.1.min((area_y + height).max(area_y)))
    }
}

fn read_processes() -> Vec<ProcessRecord> {
    if cfg!(target_os = "windows") {
        read_windows_processes()
    } else {
        read_posix_processes()
    }
}

fn read_posix_processes() -> Vec<ProcessRecord> {
    let Ok(output) = Command::new("ps")
        .args(["-axo", "pid=,comm=,args="])
        .output()
    else {
        return Vec::new();
    };
    if !output.status.success() {
        return Vec::new();
    }
    let raw = String::from_utf8_lossy(&output.stdout);
    parse_posix_process_list(&raw)
}

fn read_windows_processes() -> Vec<ProcessRecord> {
    let Ok(output) = Command::new("powershell.exe")
        .args([
            "-NoProfile",
            "-Command",
            "Get-CimInstance Win32_Process | Select-Object ProcessId,Name,CommandLine | ConvertTo-Json -Compress",
        ])
        .output()
    else {
        return Vec::new();
    };
    if !output.status.success() {
        return Vec::new();
    }

    let raw = String::from_utf8_lossy(&output.stdout);
    let Ok(parsed) = serde_json::from_str::<Value>(&raw) else {
        return Vec::new();
    };
    let items = match parsed {
        Value::Array(items) => items,
        value => vec![value],
    };

    items
        .into_iter()
        .filter_map(|item| {
            let object = item.as_object()?;
            Some(ProcessRecord {
                pid: object
                    .get("ProcessId")
                    .and_then(Value::as_u64)
                    .and_then(|value| u32::try_from(value).ok()),
                command: object
                    .get("Name")
                    .and_then(Value::as_str)
                    .unwrap_or_default()
                    .to_string(),
                args: object
                    .get("CommandLine")
                    .and_then(Value::as_str)
                    .unwrap_or_default()
                    .to_string(),
            })
        })
        .collect()
}

fn parse_posix_process_list(raw: &str) -> Vec<ProcessRecord> {
    raw.lines()
        .filter_map(|line| {
            let trimmed = line.trim();
            if trimmed.is_empty() {
                return None;
            }

            let mut parts = trimmed.splitn(3, char::is_whitespace);
            let pid = parts.next()?.parse::<u32>().ok();
            let command = parts.next().unwrap_or_default().to_string();
            let args = parts.next().unwrap_or_default().trim().to_string();
            Some(ProcessRecord { pid, command, args })
        })
        .collect()
}

fn detect_agent_in_processes(
    agent: WorkingLightAgent,
    processes: &[ProcessRecord],
) -> WorkingLightDetection {
    let expected_name = agent.as_str();

    for process in processes {
        if is_excluded_process(process) {
            continue;
        }

        let tokens = split_command_line(&format!("{} {}", process.command, process.args));
        if tokens
            .iter()
            .map(|token| normalize_process_token(token))
            .any(|token| token == expected_name)
        {
            return WorkingLightDetection {
                agent,
                label: agent.label().to_string(),
                detected: true,
                source: "process".to_string(),
                pid: process.pid,
                process_name: Some(expected_name.to_string()),
            };
        }
    }

    WorkingLightDetection {
        agent,
        label: agent.label().to_string(),
        detected: false,
        source: "none".to_string(),
        pid: None,
        process_name: None,
    }
}

fn is_excluded_process(process: &ProcessRecord) -> bool {
    if process.pid == Some(std::process::id()) {
        return true;
    }

    let text = format!("{} {}", process.command, process.args).to_lowercase();
    [
        "nuomi-switch",
        "nuomi switch",
        "working-light",
        "working_light",
        "tauri dev",
        "/src-tauri/",
        "/target/debug/",
    ]
    .iter()
    .any(|pattern| text.contains(pattern))
}

fn split_command_line(command_line: &str) -> Vec<String> {
    command_line
        .split_whitespace()
        .map(|token| token.trim_matches('"').trim_matches('\'').to_string())
        .collect()
}

fn normalize_process_token(token: &str) -> String {
    let basename = Path::new(token)
        .file_name()
        .and_then(OsStr::to_str)
        .unwrap_or(token);
    basename
        .trim_end_matches(".cmd")
        .trim_end_matches(".exe")
        .trim_end_matches(".js")
        .trim_end_matches(".mjs")
        .trim_end_matches(".cjs")
        .to_lowercase()
}

fn parse_agent(value: Option<&str>) -> AppResult<WorkingLightAgent> {
    match value {
        Some("codex") => Ok(WorkingLightAgent::Codex),
        Some("claude") => Ok(WorkingLightAgent::Claude),
        _ => Err(AppError::new(
            "WORKING_LIGHT_INVALID_AGENT",
            "无效 agent。",
            "请使用 codex 或 claude。",
        )),
    }
}

fn parse_state(value: Option<&str>) -> AppResult<WorkingLightAgentState> {
    for state in STATES {
        if Some(state.as_str()) == value {
            return Ok(state);
        }
    }
    Err(AppError::new(
        "WORKING_LIGHT_INVALID_STATE",
        "无效工作灯状态。",
        "请使用 idle、working、done、waiting 或 error。",
    ))
}

fn parse_hook_input(raw: &str) -> AppResult<Value> {
    if raw.trim().is_empty() {
        return Ok(Value::Object(Default::default()));
    }
    serde_json::from_str(raw).map_err(|error| {
        AppError::new(
            "WORKING_LIGHT_HOOK_INVALID_JSON",
            format!("解析 hook 输入失败：{error}"),
            "请确认 hook 输入是 JSON 对象。",
        )
    })
}

fn extract_assistant_text(input: &Value) -> String {
    let mut strings = Vec::new();
    for key in [
        "lastAssistantMessage",
        "last_assistant_message",
        "assistantMessage",
        "assistant_message",
        "message",
        "response",
        "output",
        "result",
    ] {
        collect_strings(input.get(key).unwrap_or(&Value::Null), &mut strings, 0);
    }
    collect_latest_assistant_message_strings(
        input.get("messages").unwrap_or(&Value::Null),
        &mut strings,
    );
    strings.join("\n")
}

fn collect_latest_assistant_message_strings(value: &Value, bucket: &mut Vec<String>) {
    let Some(messages) = value.as_array() else {
        return;
    };

    for message in messages.iter().rev() {
        let Some(object) = message.as_object() else {
            continue;
        };
        let role = object
            .get("role")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_lowercase();
        if role != "assistant" {
            continue;
        }

        for key in ["message", "content", "text"] {
            if let Some(value) = object.get(key) {
                collect_strings(value, bucket, 0);
            }
        }
        return;
    }
}

fn collect_strings(value: &Value, bucket: &mut Vec<String>, depth: usize) {
    if depth > 8 || bucket.len() > 200 {
        return;
    }

    match value {
        Value::String(text) => bucket.push(text.clone()),
        Value::Array(items) => {
            for item in items {
                collect_strings(item, bucket, depth + 1);
            }
        }
        Value::Object(object) => {
            for key in [
                "message",
                "content",
                "text",
                "lastAssistantMessage",
                "last_assistant_message",
                "last_message",
                "prompt",
                "status",
                "state",
                "reason",
                "transcript",
            ] {
                if let Some(value) = object.get(key) {
                    collect_strings(value, bucket, depth + 1);
                }
            }
        }
        _ => {}
    }
}

fn looks_like_waiting_for_user(text: &str) -> bool {
    let lower = text.to_lowercase();
    let direct_patterns = [
        "需要你确认",
        "需要你授权",
        "需要你登录",
        "需要你选择",
        "请你确认",
        "请你授权",
        "请你登录",
        "请你选择",
        "请回复",
        "请选择",
        "请告诉我",
        "请提供",
        "请补充",
        "请发我",
        "你想用哪个",
        "waitingonuserinput",
        "waiting on user input",
        "waiting for user",
        "inputrequired",
        "input required",
        "requestuserinputquestionoption",
        "request user input",
        "which option would you like",
        "please choose",
        "please confirm",
        "please reply",
        "please provide",
        "可以吗",
        "要不要",
        "行不行",
    ];
    if direct_patterns
        .iter()
        .any(|pattern| lower.contains(pattern))
    {
        return true;
    }

    let action_words = [
        "回复",
        "确认",
        "授权",
        "登录",
        "验证码",
        "文件",
        "截图",
        "选择",
        "提供",
        "补充",
        "决定",
        "输入",
        "发我",
        "告诉我",
    ];
    let asks_for_action = (lower.contains("需要你")
        || lower.contains("请你")
        || lower.contains("请 ")
        || lower.contains("please ")
        || lower.contains("麻烦你"))
        && action_words.iter().any(|word| lower.contains(word));
    asks_for_action || looks_like_user_directed_question(&lower)
}

fn looks_like_user_directed_question(lower: &str) -> bool {
    let trimmed = lower.trim_end();
    if !(trimmed.ends_with('?') || trimmed.ends_with('？')) {
        return false;
    }

    [
        "你想",
        "你要",
        "你希望",
        "是否要",
        "要不要",
        "可以吗",
        "行不行",
        "which",
        "would you",
        "do you want",
        "should i",
    ]
    .iter()
    .any(|pattern| lower.contains(pattern))
}

fn format_status(snapshot: WorkingLightSnapshot) -> String {
    let codex = snapshot.state.agents.codex.state.as_str();
    let claude = snapshot.state.agents.claude.state.as_str();
    format!(
        "codex: {codex}\nclaude: {claude}\nmuted: {}",
        snapshot.preferences.muted
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn stop_after_previous_waiting_resolves_to_done_when_response_is_complete() {
        let input = json!({
            "lastAssistantMessage": "已完成。验证已通过。"
        });

        let (_, state, _) = decide_hook_state(
            WorkingLightAgent::Codex,
            "Stop",
            &input,
            WorkingLightAgentState::Waiting,
        );

        assert_eq!(state, WorkingLightAgentState::Done);
    }

    #[test]
    fn stop_resolves_to_done_when_response_only_mentions_waiting_status_label() {
        let input = json!({
            "lastAssistantMessage": "已修复，不会再把完成状态误显示成等你回复。"
        });

        let (_, state, _) = decide_hook_state(
            WorkingLightAgent::Codex,
            "Stop",
            &input,
            WorkingLightAgentState::Working,
        );

        assert_eq!(state, WorkingLightAgentState::Done);
    }

    #[test]
    fn stop_ignores_user_prompt_when_deciding_final_state() {
        let input = json!({
            "prompt": "明明已经完成了，为什么还显示等你回复？",
            "lastAssistantMessage": "已修复。"
        });

        let (_, state, _) = decide_hook_state(
            WorkingLightAgent::Codex,
            "Stop",
            &input,
            WorkingLightAgentState::Working,
        );

        assert_eq!(state, WorkingLightAgentState::Done);
    }

    #[test]
    fn stop_resolves_to_waiting_when_final_response_requests_user_input() {
        let input = json!({
            "lastAssistantMessage": "请选择一个方案后回复我。"
        });

        let (_, state, _) = decide_hook_state(
            WorkingLightAgent::Codex,
            "Stop",
            &input,
            WorkingLightAgentState::Working,
        );

        assert_eq!(state, WorkingLightAgentState::Waiting);
    }

    #[test]
    fn permission_request_resolves_to_waiting() {
        let input = json!({});

        let (_, state, _) = decide_hook_state(
            WorkingLightAgent::Codex,
            "PermissionRequest",
            &input,
            WorkingLightAgentState::Working,
        );

        assert_eq!(state, WorkingLightAgentState::Waiting);
    }
}
