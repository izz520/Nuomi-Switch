import { useEffect, useMemo, useState } from 'react';
import { open as openFileDialog } from '@tauri-apps/plugin-dialog';
import { Database, Eye, EyeOff, FileUp, FolderOpen, KeyRound, Monitor, Plus, Trash2, Upload } from 'lucide-react';
import { Modal } from '../ui/Modal/Modal';
import { Button } from '../ui/Button';
import type {
  ClaudeAccountView,
  ClaudeDesktopGatewayConnectionMode,
  ClaudeDesktopGatewayInput,
  ClaudeDesktopGatewayModelMapping,
} from '../../types/claude';
import { listClaudeDesktopGatewayModels } from '../../services/claudeAccountService';
import './ClaudeAccountModal.css';

type Mode = 'create' | 'edit';
type DesktopSourceTab = 'desktop' | 'gateway' | 'json';

interface ClaudeAccountModalProps {
  open: boolean;
  mode: Mode;
  account?: ClaudeAccountView | null;
  saving: boolean;
  onClose: () => void;
  onImportDesktopLocal: (displayName?: string) => Promise<void>;
  onImportDesktopGateway: (payload: ClaudeDesktopGatewayInput) => Promise<void>;
  onImportDesktopJson: (jsonContent: string) => Promise<void>;
  onImportDesktopJsonFile: (filePath: string) => Promise<void>;
  onSaveDesktopGateway: (accountId: string, payload: ClaudeDesktopGatewayInput) => Promise<void>;
}

interface GatewayFormState {
  displayName: string;
  apiKey: string;
  apiBaseUrl: string;
  authScheme: 'bearer' | 'x-api-key' | 'auto';
  connectionMode: ClaudeDesktopGatewayConnectionMode;
  modelsText: string;
}

const desktopTabs: { id: DesktopSourceTab; label: string; icon: typeof Monitor }[] = [
  { id: 'desktop', label: '桌面', icon: Monitor },
  { id: 'gateway', label: '网关', icon: KeyRound },
  { id: 'json', label: 'JSON', icon: Database },
];

const defaultGatewayForm: GatewayFormState = {
  displayName: 'APIKEY.FUN',
  apiKey: '',
  apiBaseUrl: 'https://api.apikey.fun',
  authScheme: 'bearer',
  connectionMode: 'direct',
  modelsText: 'claude-sonnet-4-6\nclaude-haiku-4-5\nclaude-opus-4-8',
};

const defaultDesktopModels = [
  'claude-opus-4-8',
  'claude-fable-5',
  'claude-opus-4-7',
  'claude-opus-4-6',
  'claude-sonnet-4-6',
  'claude-haiku-4-5',
];

function parseModels(value: string): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  value
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean)
    .forEach((model) => {
      const key = model.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      result.push(model);
    });
  return result;
}

function isClaudeRouteModel(value: string): boolean {
  const model = value.trim().toLowerCase();
  return model.startsWith('claude-') || model.startsWith('anthropic/claude-');
}

function buildMappings(desktopModels: string[], upstreamModels: string[]): ClaudeDesktopGatewayModelMapping[] {
  const fallback = upstreamModels.find((model) => model.trim()) ?? '';
  return desktopModels
    .map((desktopModel, index) => ({
      desktopModel,
      upstreamModel: upstreamModels[index] ?? fallback,
      labelOverride: upstreamModels[index] ?? fallback,
      supports1m: false,
    }))
    .filter((mapping) => mapping.desktopModel.trim() && mapping.upstreamModel.trim());
}

function isGatewayAccount(account?: ClaudeAccountView | null): boolean {
  return account?.authMode === 'desktop_gateway';
}

export function ClaudeAccountModal({
  open,
  mode,
  account,
  saving,
  onClose,
  onImportDesktopLocal,
  onImportDesktopGateway,
  onImportDesktopJson,
  onImportDesktopJsonFile,
  onSaveDesktopGateway,
}: ClaudeAccountModalProps) {
  const [activeTab, setActiveTab] = useState<DesktopSourceTab>('desktop');
  const [desktopName, setDesktopName] = useState('');
  const [gatewayForm, setGatewayForm] = useState<GatewayFormState>(defaultGatewayForm);
  const [jsonText, setJsonText] = useState('');
  const [jsonFilePath, setJsonFilePath] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [gatewayMappings, setGatewayMappings] = useState<ClaudeDesktopGatewayModelMapping[]>(
    buildMappings(defaultDesktopModels, []),
  );
  const [upstreamModels, setUpstreamModels] = useState<string[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsMessage, setModelsMessage] = useState<string | null>(null);
  const [modelsError, setModelsError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    if (isGatewayAccount(account)) {
      setActiveTab('gateway');
      setGatewayForm({
        displayName: account?.displayName ?? 'APIKEY.FUN',
        apiKey: account?.apiKey ?? '',
        apiBaseUrl: account?.apiBaseUrl ?? 'https://api.apikey.fun',
        authScheme: 'bearer',
        connectionMode: account?.desktopGatewayConnectionMode ?? 'direct',
        modelsText: (account?.desktopGatewayModels?.length ? account.desktopGatewayModels : defaultDesktopModels).join('\n'),
      });
      setGatewayMappings(
        account?.desktopGatewayModelMappings?.length
          ? account.desktopGatewayModelMappings
          : buildMappings(defaultDesktopModels, account?.desktopGatewayUpstreamModels ?? []),
      );
      setUpstreamModels(account?.desktopGatewayUpstreamModels ?? []);
    } else {
      setActiveTab('desktop');
      setGatewayForm(defaultGatewayForm);
      setGatewayMappings(buildMappings(defaultDesktopModels, []));
      setUpstreamModels([]);
    }
    setDesktopName(account?.displayName ?? '');
    setJsonText('');
    setJsonFilePath('');
    setShowApiKey(false);
    setModelsMessage(null);
    setModelsError(null);
  }, [account, open]);

  const title = mode === 'edit' ? '编辑 Claude 账号' : '添加 Claude 账号';
  const isEditingGateway = mode === 'edit' && isGatewayAccount(account);

  const footer = useMemo(() => {
    if (activeTab === 'json') {
      return (
        <>
          <Button variant="ghost" onClick={onClose}>取消</Button>
          <Button
            variant="secondary"
            icon={<FileUp size={16} />}
            loading={saving}
            disabled={!jsonFilePath}
            onClick={() => void onImportDesktopJsonFile(jsonFilePath).then(onClose)}
          >
            选择文件导入
          </Button>
          <Button
            variant="primary"
            icon={<Upload size={16} />}
            loading={saving}
            disabled={jsonText.trim().length === 0}
            onClick={() => void onImportDesktopJson(jsonText.trim()).then(onClose)}
          >
            导入
          </Button>
        </>
      );
    }

    if (activeTab === 'gateway') {
      const payload: ClaudeDesktopGatewayInput = {
        displayName: gatewayForm.displayName.trim(),
        apiKey: gatewayForm.apiKey.trim(),
        apiBaseUrl: gatewayForm.apiBaseUrl.trim(),
        authScheme: gatewayForm.authScheme,
        connectionMode: gatewayForm.connectionMode,
        desktopGatewayModels:
          gatewayForm.connectionMode === 'local_mapping'
            ? gatewayMappings.map((mapping) => mapping.desktopModel.trim()).filter(Boolean)
            : parseModels(gatewayForm.modelsText),
        desktopGatewayUpstreamModels: upstreamModels,
        desktopGatewayModelMappings:
          gatewayForm.connectionMode === 'local_mapping'
            ? gatewayMappings
            : null,
      };
      const disabled =
        payload.displayName.length === 0 ||
        payload.apiKey.length === 0 ||
        payload.apiBaseUrl.length === 0 ||
        payload.desktopGatewayModels.length === 0 ||
        (payload.connectionMode === 'local_mapping' && gatewayMappings.length === 0);

      return (
        <>
          <Button variant="ghost" onClick={onClose}>取消</Button>
          <Button
            variant="primary"
            icon={<KeyRound size={16} />}
            loading={saving}
            disabled={disabled}
            onClick={() => {
              if (isEditingGateway && account) {
                void onSaveDesktopGateway(account.id, payload).then(onClose);
                return;
              }
              void onImportDesktopGateway(payload).then(onClose);
            }}
          >
            {isEditingGateway ? '保存 Gateway' : '导入 Gateway'}
          </Button>
        </>
      );
    }

    return (
      <>
        <Button variant="ghost" onClick={onClose}>取消</Button>
        <Button
          variant="primary"
          icon={<Monitor size={16} />}
          loading={saving}
          onClick={() => void onImportDesktopLocal(desktopName.trim() || undefined).then(onClose)}
        >
          打开登录
        </Button>
      </>
    );
  }, [
    activeTab,
    account,
    desktopName,
    gatewayForm,
    gatewayMappings,
    isEditingGateway,
    jsonFilePath,
    jsonText,
    onClose,
    onImportDesktopGateway,
    onImportDesktopJson,
    onImportDesktopJsonFile,
    onImportDesktopLocal,
    onSaveDesktopGateway,
    saving,
    upstreamModels,
  ]);

  async function fetchGatewayModels() {
    const apiKey = gatewayForm.apiKey.trim();
    const apiBaseUrl = gatewayForm.apiBaseUrl.trim();
    if (!apiKey || !apiBaseUrl) {
      setModelsError('请先填写基础 URL 和 API 密钥。');
      return;
    }
    setModelsLoading(true);
    setModelsError(null);
    setModelsMessage(null);
    try {
      const result = await listClaudeDesktopGatewayModels({
        apiKey,
        apiBaseUrl,
        authScheme: gatewayForm.authScheme,
      });
      const models = result.models.map((model) => model.id.trim()).filter(Boolean);
      const resolvedAuthScheme = result.authScheme;
      setUpstreamModels(models);
      if (models.length === 0) {
        setGatewayForm((state) => ({
          ...state,
          authScheme: resolvedAuthScheme ?? state.authScheme,
          connectionMode: 'local_mapping',
        }));
        setGatewayMappings(buildMappings(defaultDesktopModels, []));
        setModelsMessage('供应商没有返回模型，已保留默认映射模板。');
        return;
      }
      const claudeModels = models.filter(isClaudeRouteModel);
      if (claudeModels.length > 0) {
        setGatewayForm((state) => ({
          ...state,
          authScheme: resolvedAuthScheme ?? state.authScheme,
          connectionMode: 'direct',
          modelsText: claudeModels.join('\n'),
        }));
        setGatewayMappings(buildMappings(claudeModels, []));
      } else {
        setGatewayForm((state) => ({
          ...state,
          authScheme: resolvedAuthScheme ?? state.authScheme,
          connectionMode: 'local_mapping',
          modelsText: defaultDesktopModels.join('\n'),
        }));
        setGatewayMappings(buildMappings(defaultDesktopModels, models));
      }
      setModelsMessage(`已获取 ${models.length} 个模型，可按需修改。`);
    } catch (error) {
      setModelsError(error instanceof Error ? error.message : '查询模型失败，请检查配置。');
      setGatewayForm((state) => ({ ...state, connectionMode: 'local_mapping' }));
    } finally {
      setModelsLoading(false);
    }
  }

  function updateMapping(index: number, patch: Partial<ClaudeDesktopGatewayModelMapping>) {
    setGatewayMappings((items) => items.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)));
  }

  if (!open) {
    return null;
  }

  return (
    <Modal open={open} onClose={onClose} title={title} size="lg" footer={footer}>
      <div className="claude-desktop-modal">
        {mode === 'create' ? (
          <div className="claude-desktop-tabs" role="tablist" aria-label="Claude Desktop 添加方式">
            {desktopTabs.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={activeTab === id}
                className={`claude-desktop-tab ${activeTab === id ? 'active' : ''}`}
                onClick={() => setActiveTab(id)}
              >
                <Icon size={16} />
                <span>{label}</span>
              </button>
            ))}
          </div>
        ) : null}

        {activeTab === 'desktop' ? (
          <div className="claude-desktop-pane">
            <div className="claude-pane-card">
              <div className="claude-pane-card-icon">
                <Monitor size={22} />
              </div>
              <div className="claude-pane-card-copy">
                <h3>Claude 登录</h3>
                <p>在本工具打开 Claude 登录窗口，支持 Google、Apple、邮箱和 free 账号。</p>
              </div>
              <Button variant="primary" icon={<Monitor size={16} />} loading={saving} onClick={() => void onImportDesktopLocal(desktopName.trim() || undefined).then(onClose)}>
                打开登录
              </Button>
            </div>

            <div className="claude-info-box">登录态会先保存在本工具本地账号库，不会立刻写入官方 Claude；切换时才写回 Claude。</div>
            <div className="claude-info-box">首次使用时会采集本机 Desktop 登录态快照，后续切换时直接恢复。</div>

            <label className="claude-field">
              <span>账号名称</span>
              <input
                value={desktopName}
                onChange={(event) => setDesktopName(event.target.value)}
                placeholder="可选，例如 Claude Free"
              />
            </label>
          </div>
        ) : null}

        {activeTab === 'gateway' ? (
          <div className="claude-desktop-pane">
            <label className="claude-field">
              <span>基础 URL</span>
              <input
                value={gatewayForm.apiBaseUrl}
                onChange={(event) => setGatewayForm((state) => ({ ...state, apiBaseUrl: event.target.value }))}
              />
            </label>

            <div className="claude-field">
              <span>认证方式</span>
              <div className="claude-segmented">
                {(['bearer', 'x-api-key', 'auto'] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    className={`claude-segmented-option ${gatewayForm.authScheme === option ? 'active' : ''}`}
                    onClick={() => setGatewayForm((state) => ({ ...state, authScheme: option }))}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>

            <label className="claude-field">
              <span>账号名称</span>
              <input
                value={gatewayForm.displayName}
                onChange={(event) => setGatewayForm((state) => ({ ...state, displayName: event.target.value }))}
              />
            </label>

            <label className="claude-field">
              <span>API 密钥</span>
              <div className="claude-password-row">
                <input
                  type={showApiKey ? 'text' : 'password'}
                  value={gatewayForm.apiKey}
                  onChange={(event) => setGatewayForm((state) => ({ ...state, apiKey: event.target.value }))}
                  placeholder="粘贴供应商 API Key"
                />
                <button
                  type="button"
                  className="claude-visibility-toggle"
                  onClick={() => setShowApiKey((state) => !state)}
                  aria-label={showApiKey ? '隐藏 API Key' : '显示 API Key'}
                >
                  {showApiKey ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </label>

            <div className="claude-gateway-model-actions">
              <Button
                variant="secondary"
                icon={<KeyRound size={16} />}
                loading={modelsLoading}
                disabled={!gatewayForm.apiBaseUrl.trim() || !gatewayForm.apiKey.trim()}
                onClick={() => void fetchGatewayModels()}
              >
                获取模型
              </Button>
              {modelsMessage ? <span className="claude-model-status success">{modelsMessage}</span> : null}
              {modelsError ? <span className="claude-model-status error">{modelsError}</span> : null}
            </div>

            <div className="claude-field">
              <span>连接方式</span>
              <div className="claude-segmented two">
                {([
                  ['direct', '直连'],
                  ['local_mapping', '本地网关映射'],
                ] as const).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    className={`claude-segmented-option ${gatewayForm.connectionMode === value ? 'active' : ''}`}
                    onClick={() => setGatewayForm((state) => ({ ...state, connectionMode: value }))}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {gatewayForm.connectionMode === 'direct' ? (
              <label className="claude-field">
                <span>模型目录</span>
                <textarea
                  rows={7}
                  value={gatewayForm.modelsText}
                  onChange={(event) => setGatewayForm((state) => ({ ...state, modelsText: event.target.value }))}
                  placeholder="每行一个 Claude 可识别模型，例如 claude-sonnet-4-6"
                />
              </label>
            ) : (
              <div className="claude-mapping-section">
                <div className="claude-mapping-heading">
                  <div>
                    <h3>模型目录</h3>
                    <p>左侧是 Claude Desktop 看到的模型名，右侧是供应商真实模型。</p>
                  </div>
                  <Button
                    variant="ghost"
                    icon={<Plus size={16} />}
                    onClick={() =>
                      setGatewayMappings((items) => [
                        ...items,
                        {
                          desktopModel: 'claude-sonnet-4-6',
                          upstreamModel: upstreamModels[0] ?? '',
                          labelOverride: upstreamModels[0] ?? '',
                          supports1m: false,
                        },
                      ])
                    }
                  >
                    添加映射
                  </Button>
                </div>
                <div className="claude-mapping-list">
                  {gatewayMappings.map((mapping, index) => (
                    <div className="claude-mapping-row" key={`${mapping.desktopModel}-${index}`}>
                      <input
                        value={mapping.desktopModel}
                        onChange={(event) => updateMapping(index, { desktopModel: event.target.value })}
                        placeholder="claude-sonnet-4-6"
                      />
                      <select
                        value={mapping.upstreamModel}
                        onChange={(event) =>
                          updateMapping(index, {
                            upstreamModel: event.target.value,
                            labelOverride: event.target.value,
                          })
                        }
                      >
                        {upstreamModels.length === 0 ? <option value="">手动填写上游模型</option> : null}
                        {upstreamModels.map((model) => (
                          <option value={model} key={model}>{model}</option>
                        ))}
                      </select>
                      {upstreamModels.length === 0 ? (
                        <input
                          value={mapping.upstreamModel}
                          onChange={(event) =>
                            updateMapping(index, {
                              upstreamModel: event.target.value,
                              labelOverride: event.target.value,
                            })
                          }
                          placeholder="上游模型"
                        />
                      ) : null}
                      <label className="claude-checkbox">
                        <input
                          type="checkbox"
                          checked={mapping.supports1m === true}
                          onChange={(event) => updateMapping(index, { supports1m: event.target.checked })}
                        />
                        <span>1M上下文</span>
                      </label>
                      <button
                        type="button"
                        className="claude-mapping-delete"
                        aria-label="删除映射"
                        onClick={() => setGatewayMappings((items) => items.filter((_, itemIndex) => itemIndex !== index))}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="claude-info-box">Gateway 账号不会读取 Claude 订阅信息；API Key 会按官方 3P 配置写入本机 Claude。</div>
          </div>
        ) : null}

        {activeTab === 'json' ? (
          <div className="claude-desktop-pane">
            <label className="claude-field">
              <span>JSON 数据</span>
              <textarea
                rows={10}
                value={jsonText}
                onChange={(event) => setJsonText(event.target.value)}
                placeholder="粘贴导出的 Claude Gateway 账号 JSON"
              />
            </label>

            <div className="claude-json-actions">
              <div className="claude-json-file-chip">
                <FolderOpen size={16} />
                <span>{jsonFilePath || '未选择文件'}</span>
              </div>
              <Button
                variant="secondary"
                icon={<FileUp size={16} />}
                onClick={async () => {
                  const selected = await openFileDialog({
                    multiple: false,
                    filters: [{ name: 'JSON', extensions: ['json'] }],
                  });
                  if (typeof selected === 'string') {
                    setJsonFilePath(selected);
                  }
                }}
              >
                选择文件
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
