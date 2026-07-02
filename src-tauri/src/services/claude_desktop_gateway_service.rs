use std::collections::{BTreeMap, HashMap};
use std::sync::{Mutex, OnceLock};

use reqwest::header::{HeaderMap, HeaderName, HeaderValue};
use reqwest::{Client, Method, Url};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use tauri::async_runtime::JoinHandle;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::oneshot;

use crate::models::claude::{ClaudeAccount, ClaudeDesktopGatewayModelMapping};
use crate::models::error::{AppError, AppResult};

const GATEWAY_HOST: &str = "127.0.0.1";
const MAX_REQUEST_BYTES: usize = 32 * 1024 * 1024;

#[derive(Debug, Clone)]
pub struct ClaudeDesktopLocalGatewayEndpoint {
    pub base_url: String,
    pub api_key: String,
}

#[derive(Debug, Clone)]
struct GatewayDesktopModel {
    name: String,
    label_override: Option<String>,
    supports_1m: Option<bool>,
}

#[derive(Debug, Clone)]
struct GatewayConfig {
    account_id: String,
    upstream_base_url: String,
    upstream_api_key: String,
    upstream_auth_scheme: String,
    mappings: BTreeMap<String, String>,
    desktop_models: Vec<GatewayDesktopModel>,
    fingerprint: String,
}

#[derive(Debug)]
struct GatewayRuntime {
    endpoint: ClaudeDesktopLocalGatewayEndpoint,
    fingerprint: String,
    shutdown: oneshot::Sender<()>,
    task: JoinHandle<()>,
}

#[derive(Debug)]
struct ParsedHttpRequest {
    method: Method,
    target: String,
    headers: HashMap<String, String>,
    body: Vec<u8>,
}

static GATEWAY_RUNTIMES: OnceLock<Mutex<HashMap<String, GatewayRuntime>>> = OnceLock::new();

fn runtime_store() -> &'static Mutex<HashMap<String, GatewayRuntime>> {
    GATEWAY_RUNTIMES.get_or_init(|| Mutex::new(HashMap::new()))
}

pub fn ensure_gateway_for_account(
    account: &ClaudeAccount,
) -> AppResult<ClaudeDesktopLocalGatewayEndpoint> {
    let config = GatewayConfig::from_account(account)?;
    let mut runtimes = runtime_store().lock().map_err(|_| {
        AppError::new(
            "CLAUDE_GATEWAY_LOCK_FAILED",
            "Claude 本地网关状态锁已损坏。",
            "请重启应用后再试。",
        )
    })?;

    if let Some(runtime) = runtimes.get(&config.account_id) {
        if runtime.fingerprint == config.fingerprint {
            return Ok(runtime.endpoint.clone());
        }
    }
    if let Some(runtime) = runtimes.remove(&config.account_id) {
        stop_runtime(runtime);
    }

    let std_listener = std::net::TcpListener::bind((GATEWAY_HOST, 0)).map_err(|err| {
        AppError::new(
            "CLAUDE_GATEWAY_START_FAILED",
            format!("启动 Claude 本地网关失败：{}", err),
            "请确认本机端口未被安全软件限制。",
        )
    })?;
    std_listener.set_nonblocking(true).map_err(|err| {
        AppError::new(
            "CLAUDE_GATEWAY_START_FAILED",
            format!("配置 Claude 本地网关失败：{}", err),
            "请重试。",
        )
    })?;
    let port = std_listener
        .local_addr()
        .map_err(|err| {
            AppError::new(
                "CLAUDE_GATEWAY_START_FAILED",
                format!("读取 Claude 本地网关端口失败：{}", err),
                "请重试。",
            )
        })?
        .port();
    let local_api_key = format!("claude-local-{}", uuid::Uuid::new_v4());
    let endpoint = ClaudeDesktopLocalGatewayEndpoint {
        base_url: format!("http://{}:{}", GATEWAY_HOST, port),
        api_key: local_api_key.clone(),
    };
    let (shutdown, shutdown_rx) = oneshot::channel();
    let task_config = config.clone();
    let task = tauri::async_runtime::spawn(async move {
        let Ok(listener) = TcpListener::from_std(std_listener) else {
            return;
        };
        run_gateway(listener, task_config, local_api_key, shutdown_rx).await;
    });

    runtimes.insert(
        config.account_id.clone(),
        GatewayRuntime {
            endpoint: endpoint.clone(),
            fingerprint: config.fingerprint,
            shutdown,
            task,
        },
    );
    Ok(endpoint)
}

fn stop_runtime(runtime: GatewayRuntime) {
    let _ = runtime.shutdown.send(());
    runtime.task.abort();
}

impl GatewayConfig {
    fn from_account(account: &ClaudeAccount) -> AppResult<Self> {
        let account_id = account.id.trim().to_string();
        if account_id.is_empty() {
            return Err(AppError::new(
                "CLAUDE_GATEWAY_ACCOUNT_INVALID",
                "Claude Gateway 账号 ID 为空。",
                "请重新添加该账号。",
            ));
        }
        let upstream_base_url = account
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
            .trim_end_matches('/')
            .to_string();
        let upstream_api_key = account
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
            .to_string();
        let upstream_auth_scheme = account
            .desktop_gateway_auth_scheme
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .unwrap_or("bearer")
            .to_ascii_lowercase();
        let normalized = normalize_model_mappings(account.desktop_gateway_model_mappings.clone())
            .ok_or_else(|| {
            AppError::new(
                "CLAUDE_GATEWAY_MAPPING_MISSING",
                "Claude Gateway 本地映射为空。",
                "请获取模型并配置至少一条映射。",
            )
        })?;
        let desktop_models = normalized
            .iter()
            .map(|mapping| GatewayDesktopModel {
                name: mapping.desktop_model.clone(),
                label_override: mapping.label_override.clone(),
                supports_1m: mapping.supports_1m,
            })
            .collect::<Vec<_>>();
        let mappings = normalized
            .into_iter()
            .map(|mapping| {
                (
                    mapping.desktop_model.to_ascii_lowercase(),
                    mapping.upstream_model,
                )
            })
            .collect::<BTreeMap<_, _>>();
        let mut hasher = Sha256::new();
        hasher.update(upstream_api_key.as_bytes());
        let fingerprint = json!({
            "baseUrl": upstream_base_url,
            "authScheme": upstream_auth_scheme,
            "apiKeyHash": format!("{:x}", hasher.finalize()),
            "mappings": mappings,
            "desktopModels": desktop_models.iter().map(|model| {
                json!({
                    "name": model.name,
                    "labelOverride": model.label_override,
                    "supports1m": model.supports_1m,
                })
            }).collect::<Vec<_>>(),
        })
        .to_string();

        Ok(Self {
            account_id,
            upstream_base_url,
            upstream_api_key,
            upstream_auth_scheme,
            mappings,
            desktop_models,
            fingerprint,
        })
    }
}

fn normalize_model_mappings(
    mappings: Option<Vec<ClaudeDesktopGatewayModelMapping>>,
) -> Option<Vec<ClaudeDesktopGatewayModelMapping>> {
    let mut seen = BTreeMap::<String, ClaudeDesktopGatewayModelMapping>::new();
    for mapping in mappings.into_iter().flatten() {
        let desktop_model = mapping.desktop_model.trim().to_string();
        let upstream_model = mapping.upstream_model.trim().to_string();
        if desktop_model.is_empty() || upstream_model.is_empty() {
            continue;
        }
        let key = desktop_model.to_ascii_lowercase();
        seen.entry(key)
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

async fn run_gateway(
    listener: TcpListener,
    config: GatewayConfig,
    local_api_key: String,
    mut shutdown: oneshot::Receiver<()>,
) {
    let client = match Client::builder().no_proxy().build() {
        Ok(client) => client,
        Err(_) => return,
    };
    loop {
        tokio::select! {
            _ = &mut shutdown => break,
            accepted = listener.accept() => {
                let Ok((stream, _addr)) = accepted else {
                    continue;
                };
                let client = client.clone();
                let config = config.clone();
                let local_api_key = local_api_key.clone();
                tauri::async_runtime::spawn(async move {
                    handle_connection(stream, client, config, local_api_key).await;
                });
            }
        }
    }
}

async fn handle_connection(
    mut stream: TcpStream,
    client: Client,
    config: GatewayConfig,
    local_api_key: String,
) {
    let Some(request) = read_http_request(&mut stream).await else {
        let _ = write_json_response(
            &mut stream,
            400,
            json!({ "error": { "message": "Invalid request" } }),
        )
        .await;
        return;
    };
    if request.method == Method::OPTIONS {
        let _ = write_empty_response(&mut stream, 204).await;
        return;
    }
    if !is_authorized(&request.headers, &local_api_key) {
        let _ = write_json_response(
            &mut stream,
            401,
            json!({ "error": { "message": "Unauthorized" } }),
        )
        .await;
        return;
    }
    if request.method == Method::GET
        && normalize_path_without_query(&request.target) == "/v1/models"
    {
        let data = config
            .desktop_models
            .iter()
            .map(|model| {
                let mut value = json!({
                    "id": model.name,
                    "object": "model",
                    "created": 0,
                    "owned_by": "anthropic",
                });
                if let Some(label) = model
                    .label_override
                    .as_deref()
                    .map(str::trim)
                    .filter(|value| !value.is_empty())
                {
                    value["display_name"] = Value::String(label.to_string());
                }
                if model.supports_1m.unwrap_or(false) {
                    value["supports1m"] = Value::Bool(true);
                }
                value
            })
            .collect::<Vec<_>>();
        let _ =
            write_json_response(&mut stream, 200, json!({ "object": "list", "data": data })).await;
        return;
    }

    let mapped_body = map_request_body(&request.body, &config).unwrap_or(request.body);
    match forward_request(
        &client,
        &config,
        request.method,
        &request.target,
        &request.headers,
        mapped_body,
    )
    .await
    {
        Ok(response) => {
            let _ = write_upstream_response(&mut stream, response).await;
        }
        Err(_) => {
            let _ = write_json_response(
                &mut stream,
                502,
                json!({ "error": { "message": "Claude local gateway upstream request failed" } }),
            )
            .await;
        }
    }
}

async fn read_http_request(stream: &mut TcpStream) -> Option<ParsedHttpRequest> {
    let mut received = Vec::with_capacity(8192);
    let header_end;
    loop {
        let mut chunk = [0u8; 4096];
        let n = stream.read(&mut chunk).await.ok()?;
        if n == 0 {
            return None;
        }
        received.extend_from_slice(&chunk[..n]);
        if received.len() > MAX_REQUEST_BYTES {
            return None;
        }
        if let Some(pos) = find_header_end(&received) {
            header_end = pos;
            break;
        }
    }

    let head = &received[..header_end];
    let mut body = received[header_end + 4..].to_vec();
    let (method, target, headers) = parse_head(head)?;
    let expected = content_length(&headers).unwrap_or(0);
    while body.len() < expected {
        let mut chunk = vec![0u8; (expected - body.len()).min(8192)];
        let n = stream.read(&mut chunk).await.ok()?;
        if n == 0 {
            break;
        }
        body.extend_from_slice(&chunk[..n]);
        if body.len() > MAX_REQUEST_BYTES {
            return None;
        }
    }
    Some(ParsedHttpRequest {
        method,
        target,
        headers,
        body,
    })
}

fn find_header_end(bytes: &[u8]) -> Option<usize> {
    bytes.windows(4).position(|window| window == b"\r\n\r\n")
}

fn parse_head(head: &[u8]) -> Option<(Method, String, HashMap<String, String>)> {
    let text = String::from_utf8_lossy(head);
    let mut lines = text.lines();
    let request_line = lines.next()?;
    let mut parts = request_line.split_whitespace();
    let method = Method::from_bytes(parts.next()?.as_bytes()).ok()?;
    let target = parts.next()?.to_string();
    let headers = lines
        .filter_map(|line| {
            let (name, value) = line.split_once(':')?;
            Some((name.trim().to_ascii_lowercase(), value.trim().to_string()))
        })
        .collect();
    Some((method, target, headers))
}

fn content_length(headers: &HashMap<String, String>) -> Option<usize> {
    headers.get("content-length")?.trim().parse().ok()
}

fn normalize_path_without_query(target: &str) -> String {
    target
        .split('?')
        .next()
        .unwrap_or(target)
        .trim_end_matches('/')
        .to_string()
}

fn is_authorized(headers: &HashMap<String, String>, local_api_key: &str) -> bool {
    headers.iter().any(|(name, value)| {
        let value = value.trim();
        (name == "x-api-key" && value == local_api_key)
            || (name == "authorization"
                && value
                    .strip_prefix("Bearer ")
                    .is_some_and(|token| token.trim() == local_api_key))
    })
}

fn map_request_body(body: &[u8], config: &GatewayConfig) -> Option<Vec<u8>> {
    if body.is_empty() {
        return None;
    }
    let mut value: Value = serde_json::from_slice(body).ok()?;
    let model = value.get("model").and_then(Value::as_str)?.trim();
    let upstream_model = config.mappings.get(&model.to_ascii_lowercase())?;
    value["model"] = Value::String(upstream_model.clone());
    serde_json::to_vec(&value).ok()
}

async fn forward_request(
    client: &Client,
    config: &GatewayConfig,
    method: Method,
    target: &str,
    headers: &HashMap<String, String>,
    body: Vec<u8>,
) -> reqwest::Result<reqwest::Response> {
    let url = build_upstream_url(&config.upstream_base_url, target).unwrap_or_else(|_| {
        Url::parse(&format!(
            "{}/{}",
            config.upstream_base_url.trim_end_matches('/'),
            target.trim_start_matches('/')
        ))
        .expect("fallback upstream url")
    });
    let mut builder = client.request(method, url);
    let mut forwarded_headers = HeaderMap::new();
    for (name, value) in headers {
        if matches!(
            name.as_str(),
            "host"
                | "authorization"
                | "x-api-key"
                | "content-length"
                | "connection"
                | "proxy-authorization"
        ) {
            continue;
        }
        if let (Ok(header_name), Ok(header_value)) = (
            HeaderName::from_bytes(name.as_bytes()),
            HeaderValue::from_str(value),
        ) {
            forwarded_headers.insert(header_name, header_value);
        }
    }
    builder = builder.headers(forwarded_headers);
    if config
        .upstream_auth_scheme
        .eq_ignore_ascii_case("x-api-key")
    {
        builder = builder.header("x-api-key", &config.upstream_api_key);
    } else {
        builder = builder.bearer_auth(&config.upstream_api_key);
    }
    builder.body(body).send().await
}

fn build_upstream_url(base_url: &str, target: &str) -> Result<Url, String> {
    let mut url = Url::parse(&format!("{}/", base_url.trim_end_matches('/')))
        .map_err(|err| err.to_string())?;
    let base_path = url.path().trim_end_matches('/');
    let request_path = target
        .split('?')
        .next()
        .unwrap_or(target)
        .trim_start_matches('/');
    let request_path = if base_path.ends_with("/v1") && request_path.starts_with("v1/") {
        &request_path[3..]
    } else {
        request_path
    };
    let next_path = if base_path.is_empty() || base_path == "/" {
        format!("/{}", request_path)
    } else {
        format!("{}/{}", base_path, request_path)
    };
    url.set_path(&next_path);
    url.set_query(target.split_once('?').map(|(_, query)| query));
    Ok(url)
}

async fn write_upstream_response(
    stream: &mut TcpStream,
    response: reqwest::Response,
) -> std::io::Result<()> {
    let status = response.status().as_u16();
    let reason = response.status().canonical_reason().unwrap_or("OK");
    let headers = response.headers().clone();
    let body = response.bytes().await.unwrap_or_default();
    let mut head = format!(
        "HTTP/1.1 {} {}\r\nContent-Length: {}\r\nAccess-Control-Allow-Origin: *\r\n",
        status,
        reason,
        body.len()
    );
    for (name, value) in headers.iter() {
        let lower = name.as_str().to_ascii_lowercase();
        if matches!(
            lower.as_str(),
            "content-length" | "connection" | "transfer-encoding" | "content-encoding"
        ) {
            continue;
        }
        if let Ok(value) = value.to_str() {
            head.push_str(name.as_str());
            head.push_str(": ");
            head.push_str(value);
            head.push_str("\r\n");
        }
    }
    head.push_str("\r\n");
    stream.write_all(head.as_bytes()).await?;
    stream.write_all(&body).await
}

async fn write_json_response(
    stream: &mut TcpStream,
    status: u16,
    value: Value,
) -> std::io::Result<()> {
    let body = serde_json::to_vec(&value).unwrap_or_else(|_| b"{}".to_vec());
    let reason = match status {
        200 => "OK",
        204 => "No Content",
        400 => "Bad Request",
        401 => "Unauthorized",
        502 => "Bad Gateway",
        _ => "OK",
    };
    let head = format!(
        "HTTP/1.1 {} {}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Headers: authorization,x-api-key,content-type,anthropic-version,anthropic-beta\r\n\r\n",
        status,
        reason,
        body.len(),
    );
    stream.write_all(head.as_bytes()).await?;
    stream.write_all(&body).await
}

async fn write_empty_response(stream: &mut TcpStream, status: u16) -> std::io::Result<()> {
    let reason = if status == 204 { "No Content" } else { "OK" };
    let head = format!(
        "HTTP/1.1 {} {}\r\nContent-Length: 0\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Headers: authorization,x-api-key,content-type,anthropic-version,anthropic-beta\r\n\r\n",
        status,
        reason,
    );
    stream.write_all(head.as_bytes()).await
}
