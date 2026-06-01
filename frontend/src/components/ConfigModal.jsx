import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import classNames from 'classnames';
import { X, Save, FolderOpen, Loader2, Search } from 'lucide-react';
import './ConfigModal.css';

const BACKEND_BASE = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
const API_URL = `${BACKEND_BASE}/api/config`;
const BROWSE_URL = `${BACKEND_BASE}/api/browse`;

const ConfigModal = ({ isOpen, onClose }) => {
    const [config, setConfig] = useState({
        tachiePath: '',
        generatedImagesPath: '',
        agentName: 'AI_Yome_Chat',
        sendKeyBinding: 'Enter',
        accentColor: '#a855f7',
        glassIntensity: 20,
        fontSize: 16,
        showTimestamp: true,
        ttsEnabled: false,
        ttsProvider: 'irodori',
        ttsSettings: {
            irodori: {
                url: 'http://localhost:8088',
                voice: 'sample',
                seed: 42
            },
            voicevox: {
                url: 'http://localhost:50021',
                speakerId: 1
            }
        }
    });
    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [browsing, setBrowsing] = useState(null); // どのフィールドをブラウズ中か
    const [saveStatus, setSaveStatus] = useState(null); // 'success' | 'error' | null

    useEffect(() => {
        if (isOpen) {
            fetchConfig();
            setSaveStatus(null);
        }
    }, [isOpen]);

    const fetchConfig = async () => {
        setIsLoading(true);
        try {
            const res = await fetch(API_URL);
            const data = await res.json();
            setConfig(data);
        } catch (err) {
            console.error('Failed to fetch config:', err);
        } finally {
            setIsLoading(false);
        }
    };

    const handleChange = (e) => {
        const target = e.target;
        let value = target.type === 'checkbox' ? target.checked : target.value;
        const name = target.name;

        // 特定の数値入力項目は数値型としてパースするお！
        if (target.type === 'number' || name.endsWith('.seed') || name.endsWith('.speakerId')) {
            const parsed = parseInt(value, 10);
            value = isNaN(parsed) ? value : parsed;
        }

        if (name.includes('.')) {
            const parts = name.split('.');
            setConfig(prev => {
                const newConfig = { ...prev };
                let current = newConfig;
                for (let i = 0; i < parts.length - 1; i++) {
                    current[parts[i]] = { ...current[parts[i]] };
                    current = current[parts[i]];
                }
                current[parts[parts.length - 1]] = value;
                return newConfig;
            });
        } else {
            setConfig(prev => ({ ...prev, [name]: value }));
        }
        setSaveStatus(null);
    };


    const handleSave = async () => {
        setIsSaving(true);
        setSaveStatus(null);
        try {
            const res = await fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(config)
            });
            if (res.ok) {
                setSaveStatus('success');
                setTimeout(() => {
                    onClose();
                }, 1000); // 成功表示を少し見せてから閉じる
            } else {
                setSaveStatus('error');
            }
        } catch (err) {
            console.error('Failed to save config:', err);
            setSaveStatus('error');
        } finally {
            setIsSaving(false);
        }
    };

    const handleBrowse = async (fieldName, type) => {
        setBrowsing(fieldName);
        try {
            const res = await fetch(`${BROWSE_URL}?type=${type}`);
            const data = await res.json();
            if (data.success && data.path) {
                setConfig(prev => ({ ...prev, [fieldName]: data.path }));
                setSaveStatus(null);
            }
        } catch (err) {
            console.error('Browse failed:', err);
        } finally {
            setBrowsing(null);
        }
    };

    if (!isOpen) return null;

    return createPortal(
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <div className="modal-title">
                        <FolderOpen className="title-icon" size={20} />
                        <h3>Agent Configuration</h3>
                    </div>
                    <button className="close-btn" onClick={onClose}>
                        <X size={20} />
                    </button>
                </div>

                <div className="modal-body">
                    {isLoading ? (
                        <div className="loading-state">
                            <Loader2 className="spinner" size={32} />
                            <p>Loading configuration...</p>
                        </div>
                    ) : (
                        <div className="config-form">
                            <div className="config-section">
                                <h4 className="section-title">Directory Settings</h4>


                                <div className="form-group">
                                    <label>Tachie (Portrait) Directory</label>
                                    <div className="input-with-browse">
                                        <input
                                            type="text"
                                            name="tachiePath"
                                            value={config.tachiePath}
                                            onChange={handleChange}
                                            placeholder="./data/tachie"
                                            className="config-input"
                                        />
                                        <button
                                            className="browse-btn"
                                            onClick={() => handleBrowse('tachiePath', 'folder')}
                                            disabled={browsing !== null}
                                            title="フォルダを選択"
                                        >
                                            {browsing === 'tachiePath' ? <Loader2 className="spinner" size={16} /> : <FolderOpen size={16} />}
                                        </button>
                                    </div>
                                    <span className="field-hint">
                                        AI嫁の立ち絵画像が格納されているフォルダパス<br />
                                        <span style={{ color: '#ff9800' }}>※変更は次回エージェント起動時から有効になります</span>
                                    </span>
                                </div>

                                <div className="form-group">
                                    <label>Generated Images Directory</label>
                                    <div className="input-with-browse">
                                        <input
                                            type="text"
                                            name="generatedImagesPath"
                                            value={config.generatedImagesPath}
                                            onChange={handleChange}
                                            placeholder="./data/images"
                                            className="config-input"
                                        />
                                        <button
                                            className="browse-btn"
                                            onClick={() => handleBrowse('generatedImagesPath', 'folder')}
                                            disabled={browsing !== null}
                                            title="フォルダを選択"
                                        >
                                            {browsing === 'generatedImagesPath' ? <Loader2 className="spinner" size={16} /> : <FolderOpen size={16} />}
                                        </button>
                                    </div>
                                    <span className="field-hint">ComfyUI等で生成された背景画像などの保存先パス</span>
                                </div>
                            </div>

                            <div className="config-section">
                                <h4 className="section-title">Persona & Interaction</h4>
                                <div className="form-group">
                                    <label>Agent Name</label>
                                    <input
                                        type="text"
                                        name="agentName"
                                        value={config.agentName}
                                        onChange={handleChange}
                                        className="config-input"
                                    />
                                    <span className="field-hint">UI上に表示されるAIエージェントの名前</span>
                                </div>

                                <div className="form-group">
                                    <label>Send Shortcut Key</label>
                                    <select
                                        name="sendKeyBinding"
                                        value={config.sendKeyBinding}
                                        onChange={handleChange}
                                        className="config-input config-select"
                                    >
                                        <option value="Enter">Enter</option>
                                        <option value="Alt+Enter">Alt + Enter</option>
                                        <option value="Ctrl+Enter">Ctrl + Enter</option>
                                    </select>
                                    <span className="field-hint">チャットを送信するショートカット（未設定のEnterは改行になります）</span>
                                </div>
                            </div>

                            <div className="config-section">
                                <h4 className="section-title">Text to Speech (音声合成)</h4>
                                
                                <div className="form-group checkbox-col" style={{ marginBottom: '16px' }}>
                                    <label className="checkbox-label">
                                        <input
                                            type="checkbox"
                                            name="ttsEnabled"
                                            checked={config.ttsEnabled || false}
                                            onChange={handleChange}
                                        />
                                        <span className="checkbox-text" style={{ fontWeight: 'bold' }}>音声合成 (TTS) を有効にする</span>
                                    </label>
                                    <span className="field-hint">有効にすると、AI嫁の返答時に自動で音声を合成しブラウザで再生します。</span>
                                </div>

                                {config.ttsEnabled && (
                                    <>
                                        <div className="form-group" style={{ marginBottom: '16px' }}>
                                            <label>TTS Provider (プロバイダー)</label>
                                            <select
                                                name="ttsProvider"
                                                value={config.ttsProvider || 'irodori'}
                                                onChange={handleChange}
                                                className="config-input config-select"
                                            >
                                                <option value="irodori">Irodori-TTS (ローカルAPI)</option>
                                                <option value="voicevox" disabled>VOICEVOX (未実装・将来用)</option>
                                            </select>
                                        </div>

                                        {/* 動的フォーム：Irodori-TTS の設定項目 */}
                                        {config.ttsProvider === 'irodori' && (
                                            <div className="provider-settings-box" style={{ padding: '12px', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)', marginBottom: '12px' }}>
                                                <div className="form-group">
                                                    <label>API Host URL</label>
                                                    <input
                                                        type="text"
                                                        name="ttsSettings.irodori.url"
                                                        value={config.ttsSettings?.irodori?.url ?? 'http://localhost:8088'}
                                                        onChange={handleChange}
                                                        className="config-input"
                                                        placeholder="http://localhost:8088"
                                                    />
                                                    <span className="field-hint">Irodori-TTS Serverの稼働先URL (ポート含む)</span>
                                                </div>

                                                <div className="form-group">
                                                    <label>Reference Voice (リファレンス音声名)</label>
                                                    <input
                                                        type="text"
                                                        name="ttsSettings.irodori.voice"
                                                        value={config.ttsSettings?.irodori?.voice ?? 'sample'}
                                                        onChange={handleChange}
                                                        className="config-input"
                                                        placeholder="sample"
                                                    />
                                                    <span className="field-hint">voices/内にあるWAVファイル名 (拡張子なし)</span>
                                                </div>

                                                <div className="form-group">
                                                    <label>Voice Generation Seed (シード値)</label>
                                                    <input
                                                        type="number"
                                                        name="ttsSettings.irodori.seed"
                                                        value={config.ttsSettings?.irodori?.seed ?? 42}
                                                        onChange={handleChange}
                                                        className="config-input"
                                                        placeholder="42"
                                                    />
                                                    <span className="field-hint">声質を固定するシード（-1でランダム）</span>
                                                </div>
                                            </div>
                                        )}

                                        {/* 動的フォーム：VOICEVOXの設定項目 */}
                                        {config.ttsProvider === 'voicevox' && (
                                            <div className="provider-settings-box" style={{ padding: '12px', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)', marginBottom: '12px' }}>
                                                <div className="form-group">
                                                    <label>VOICEVOX API URL</label>
                                                    <input
                                                        type="text"
                                                        name="ttsSettings.voicevox.url"
                                                        value={config.ttsSettings?.voicevox?.url ?? 'http://localhost:50021'}
                                                        onChange={handleChange}
                                                        className="config-input"
                                                        placeholder="http://localhost:50021"
                                                    />
                                                    <span className="field-hint">VOICEVOXのAPIサーバー稼働先URL</span>
                                                </div>

                                                <div className="form-group">
                                                    <label>Speaker ID (話者ID / キャラクター番号)</label>
                                                    <input
                                                        type="number"
                                                        name="ttsSettings.voicevox.speakerId"
                                                        value={config.ttsSettings?.voicevox?.speakerId ?? 1}
                                                        onChange={handleChange}
                                                        className="config-input"
                                                        placeholder="1"
                                                    />
                                                    <span className="field-hint">ずんだもん(3)、四国めたん(2)などの話者ID</span>
                                                </div>
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>

                            <div className="config-section">
                                <h4 className="section-title">Visuals & Styling</h4>

                                <div className="form-group config-row">
                                    <div className="config-col">
                                        <label>Accent Color</label>
                                        <div className="color-picker-wrapper">
                                            <input
                                                type="color"
                                                name="accentColor"
                                                value={config.accentColor}
                                                onChange={handleChange}
                                                className="color-picker"
                                            />
                                            <span className="color-value">{config.accentColor}</span>
                                        </div>
                                    </div>
                                    <div className="config-col checkbox-col">
                                        <label className="checkbox-label">
                                            <input
                                                type="checkbox"
                                                name="showTimestamp"
                                                checked={config.showTimestamp}
                                                onChange={handleChange}
                                            />
                                            <span className="checkbox-text">時間表示</span>
                                        </label>
                                    </div>
                                </div>

                                <div className="form-group">
                                    <label>
                                        Glass Intensity
                                        <span className="slider-value">{config.glassIntensity}%</span>
                                    </label>
                                    <input
                                        type="range"
                                        name="glassIntensity"
                                        min="0"
                                        max="100"
                                        value={config.glassIntensity}
                                        onChange={handleChange}
                                        className="config-slider"
                                    />
                                    <span className="field-hint">背景のボカシ（Frost）の強さ</span>
                                </div>

                                <div className="form-group">
                                    <label>
                                        Font Size
                                        <span className="slider-value">{config.fontSize}px</span>
                                    </label>
                                    <input
                                        type="range"
                                        name="fontSize"
                                        min="12"
                                        max="24"
                                        value={config.fontSize}
                                        onChange={handleChange}
                                        className="config-slider"
                                    />
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                <div className="modal-footer">
                    {saveStatus === 'error' && (
                        <span className="status-message error">保存に失敗しました</span>
                    )}
                    {saveStatus === 'success' && (
                        <span className="status-message success">保存しました！</span>
                    )}
                    <button className="cancel-btn" onClick={onClose} disabled={isSaving}>
                        キャンセル
                    </button>
                    <button className="save-btn" onClick={handleSave} disabled={isSaving || isLoading}>
                        {isSaving ? <Loader2 className="spinner" size={18} /> : <Save size={18} />}
                        <span>保存する</span>
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
};

export default ConfigModal;
