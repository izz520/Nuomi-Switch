import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckCircle2,
  CircleAlert,
  Database,
  Eye,
  EyeOff,
  KeyRound,
  LoaderCircle,
  Monitor,
  Plus,
  Trash2,
} from 'lucide-react';
import { Modal } from '../ui/Modal/Modal';
import { Button } from '../ui/Button';
import type {
  ClaudeAccountView,
  ClaudeApiKeyInput,
  ClaudeDesktopGatewayConnectionMode,
  ClaudeDesktopGatewayModelMapping,
} from '../../types/claude';
import { listClaudeDesktopGatewayModels } from '../../services/claudeAccountService';
import './ClaudeApiKeyModal.css';

type CliSourceTab = 'desktop' | 'gateway' | 'json';

interface ClaudeApiKeyModalProps {
  open: boolean;
  account?: ClaudeAccountView | null;
  saving: boolean;
  onClose: () => void;
  onCreate: (input: ClaudeApiKeyInput) => Promise<void>;
  onSave: (accountId: string, input: ClaudeApiKeyInput) => Promise<void>;
}

interface GatewayFormState {
  displayName: string;
  apiKey: string;
  apiBaseUrl: string;
  authScheme: 'bearer' | 'x-api-key' | 'auto';
  connectionMode: ClaudeDesktopGatewayConnectionMode;
  modelsText: string;
}

const cliTabs: { id: CliSourceTab; label: string; icon: typeof Monitor }[] = [
  { id: 'desktop', label: '桌面', icon: Monitor },
  { id: 'gateway', label: '网关', icon: KeyRound },
  { id: 'json', label: 'JSON', icon: Database },
];
const temporarilyDisabledCreateTabs = new Set<CliSourceTab>(['desktop', 'json']);

const defaultDesktopModels = [
  'claude-opus-4-8',
  'claude-fable-5',
  'claude-opus-4-7',
  'claude-opus-4-6',
  'claude-sonnet-4-6',
  'claude-haiku-4-5',
];

const defaultGatewayForm: GatewayFormState = {
  displayName: '',
  apiKey: '',
  apiBaseUrl: '',
  authScheme: 'bearer',
  connectionMode: 'direct',
  modelsText: defaultDesktopModels.join('\n'),
};

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

export function ClaudeApiKeyModal({
  open,
  account,
  saving,
  onClose,
  onCreate,
  onSave,
}: ClaudeApiKeyModalProps) {
  const [activeTab, setActiveTab] = useState<CliSourceTab>('gateway');
  const [gatewayForm, setGatewayForm] = useState<GatewayFormState>(defaultGatewayForm);
  const [showApiKey, setShowApiKey] = useState(false);
  const [gatewayMappings, setGatewayMappings] = useState<ClaudeDesktopGatewayModelMapping[]>(
    buildMappings(defaultDesktopModels, []),
  );
  const [upstreamModels, setUpstreamModels] = useState<string[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsMessage, setModelsMessage] = useState<string | null>(null);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const modelFetchSequence = useRef(0);
  const lastModelFetchKey = useRef('');

  useEffect(() => {
    if (!open) {
      return;
    }
    setActiveTab('gateway');
    setGatewayForm({
      displayName: account?.displayName ?? '',
      apiKey: account?.apiKey ?? '',
      apiBaseUrl: account?.apiBaseUrl ?? '',
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
    setShowApiKey(false);
    setModelsMessage(null);
    setModelsError(null);
    lastModelFetchKey.current = '';
  }, [account, open]);

  useEffect(() => {
    const apiKey = gatewayForm.apiKey.trim();
    const apiBaseUrl = gatewayForm.apiBaseUrl.trim();

    if (!open || activeTab !== 'gateway') {
      return;
    }

    if (!apiKey || !apiBaseUrl) {
      modelFetchSequence.current += 1;
      setModelsLoading(false);
      setModelsMessage(null);
      setModelsError(null);
      lastModelFetchKey.current = '';
      return;
    }

    const fetchKey = `${apiBaseUrl}\n${apiKey}\n${gatewayForm.authScheme}`;
    if (lastModelFetchKey.current === fetchKey) {
      return;
    }

    modelFetchSequence.current += 1;
    const timeoutId = window.setTimeout(() => {
      lastModelFetchKey.current = fetchKey;
      void fetchGatewayModels(apiBaseUrl, apiKey, gatewayForm.authScheme);
    }, 650);

    return () => window.clearTimeout(timeoutId);
  }, [activeTab, gatewayForm.apiBaseUrl, gatewayForm.apiKey, gatewayForm.authScheme, open]);

  const payload = useMemo<ClaudeApiKeyInput>(
    () => ({
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
    }),
    [gatewayForm, gatewayMappings, upstreamModels],
  );

  const canSave =
    payload.displayName.length > 0 &&
    payload.apiKey.length > 0 &&
    payload.apiBaseUrl.length > 0 &&
    payload.desktopGatewayModels.length > 0 &&
    (payload.connectionMode !== 'local_mapping' || gatewayMappings.length > 0);
  const isEdit = Boolean(account);

  const footer = (
    <>
      <Button variant="ghost" disabled={saving} onClick={onClose}>
        取消
      </Button>
      <Button
        variant="primary"
        icon={<KeyRound size={16} />}
        loading={saving}
        disabled={!canSave}
        onClick={() => {
          if (account) {
            void onSave(account.id, payload).then(onClose);
            return;
          }
          void onCreate(payload).then(onClose);
        }}
      >
        {isEdit ? '保存 Gateway' : '导入 Gateway'}
      </Button>
    </>
  );

  async function fetchGatewayModels(
    apiBaseUrl: string,
    apiKey: string,
    authScheme: GatewayFormState['authScheme'],
  ) {
    const sequence = modelFetchSequence.current + 1;
    modelFetchSequence.current = sequence;
    setModelsLoading(true);
    setModelsError(null);
    setModelsMessage('正在自动获取模型...');
    try {
      const result = await listClaudeDesktopGatewayModels({
        apiKey,
        apiBaseUrl,
        authScheme,
      });
      if (modelFetchSequence.current !== sequence) {
        return;
      }
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
        setModelsMessage('供应商没有返回模型');
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
      setModelsMessage(`已获取 ${models.length} 个模型`);
    } catch (error) {
      if (modelFetchSequence.current !== sequence) {
        return;
      }
      setModelsError(error instanceof Error ? error.message : '查询模型失败，请检查配置。');
      setModelsMessage(null);
      setGatewayForm((state) => ({ ...state, connectionMode: 'local_mapping' }));
    } finally {
      if (modelFetchSequence.current === sequence) {
        setModelsLoading(false);
      }
    }
  }

  function updateMapping(index: number, patch: Partial<ClaudeDesktopGatewayModelMapping>) {
    setGatewayMappings((items) => items.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)));
  }

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? '编辑 Claude 账号' : '添加 Claude 账号'} size="lg" footer={footer}>
      <div className="claude-desktop-modal">
        {!isEdit ? (
          <div className="claude-desktop-tabs" role="tablist" aria-label="Claude CLI 添加方式">
            {cliTabs.map(({ id, label, icon: Icon }) => {
              const disabled = temporarilyDisabledCreateTabs.has(id);
              return (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === id}
                  aria-disabled={disabled}
                  disabled={disabled}
                  className={`claude-desktop-tab ${activeTab === id ? 'active' : ''}`}
                  onClick={() => setActiveTab(id)}
                >
                  <Icon size={16} />
                  <span>{label}</span>
                </button>
              );
            })}
          </div>
        ) : null}

        {activeTab === 'gateway' ? (
          <div className="claude-desktop-pane">
            <label className="claude-field">
              <span>账号名称</span>
              <input
                required
                value={gatewayForm.displayName}
                onChange={(event) => setGatewayForm((state) => ({ ...state, displayName: event.target.value }))}
                placeholder="必填，例如主用网关"
              />
            </label>

            <label className="claude-field">
              <span>基础 URL</span>
              <input
                required
                value={gatewayForm.apiBaseUrl}
                onChange={(event) => setGatewayForm((state) => ({ ...state, apiBaseUrl: event.target.value }))}
                placeholder="必填，例如 https://api.example.com"
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
              <span>API 密钥</span>
              <div className="claude-password-row">
                <input
                  required
                  type={showApiKey ? 'text' : 'password'}
                  value={gatewayForm.apiKey}
                  onChange={(event) => setGatewayForm((state) => ({ ...state, apiKey: event.target.value }))}
                  placeholder="必填，粘贴供应商 API Key"
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

            {modelsLoading || modelsError || modelsMessage ? (
              <div className="claude-gateway-model-actions">
                <div
                  className={`claude-model-auto-status ${modelsLoading ? 'loading' : ''} ${modelsError ? 'error' : ''} ${modelsMessage && !modelsLoading ? 'success' : ''}`}
                  role="status"
                  aria-live="polite"
                >
                  <span className="claude-model-auto-icon" aria-hidden="true">
                    {modelsLoading ? (
                      <LoaderCircle size={16} />
                    ) : modelsError ? (
                      <CircleAlert size={16} />
                    ) : (
                      <CheckCircle2 size={16} />
                    )}
                  </span>
                  <span>
                    {modelsLoading
                      ? '正在自动获取模型...'
                      : modelsError
                        ? modelsError
                        : modelsMessage}
                  </span>
                </div>
              </div>
            ) : null}

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
                    <p>左侧是 Claude CLI 看到的模型名，右侧是供应商真实模型。</p>
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
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
