import React, { useState, useEffect, useRef } from 'react';
import classNames from 'classnames';
import { Send, User, Sparkles, SlidersHorizontal, Eye, EyeOff, FileJson, X, Image as ImageIcon } from 'lucide-react';
import ConfigModal from './ConfigModal';
import './Chat.css';

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:3001';
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api/chat';

const Chat = ({ config, onConfigChange, onExpressionChange, onOpenGallery, onLatestImageUpdate }) => {
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [isConnected, setIsConnected] = useState(false);
    const [isConfigOpen, setIsConfigOpen] = useState(false);
    const [isPeekMode, setIsPeekMode] = useState(false);
    const [showJson, setShowJson] = useState(false);
    const [isAudioUnlocked, setIsAudioUnlocked] = useState(false);
    const messagesEndRef = useRef(null);
    const wsRef = useRef(null);
    const reconnectDelayRef = useRef(1000);
    const reconnectTimerRef = useRef(null);

    const unlockAudio = () => {
        if (isAudioUnlocked) return;
        
        try {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            if (AudioContextClass) {
                const audioCtx = new AudioContextClass();
                if (audioCtx.state === 'suspended') {
                    audioCtx.resume();
                }
            }
            
            // ダミーの無音再生でブラウザの自動再生ガードを解除するお！
            const dummyAudio = new Audio('data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAAA');
            dummyAudio.play()
                .then(() => {
                    console.log('[Audio] Browser autoplay policy unlocked successfully!');
                    setIsAudioUnlocked(true);
                })
                .catch((err) => {
                    console.warn('[Audio] Autoplay unlock playback was ignored or blocked:', err);
                });
        } catch (e) {
            console.error('[Audio] Failed to initialize AudioContext for unlock:', e);
        }
    };

    const formatTime = (isoString) => {
        if (!isoString) return '';
        const d = new Date(isoString);
        let h = d.getHours().toString().padStart(2, '0');
        let m = d.getMinutes().toString().padStart(2, '0');
        return `${h}:${m}`;
    };

    useEffect(() => {
        connectWebSocket();
        return () => {
            if (wsRef.current) {
                wsRef.current.onclose = null; // Prevent trigger on manual close
                wsRef.current.close();
            }
            if (reconnectTimerRef.current) {
                clearTimeout(reconnectTimerRef.current);
            }
        };
    }, []);

    const connectWebSocket = () => {
        if (wsRef.current && wsRef.current.readyState === WebSocket.CONNECTING) {
            return;
        }

        const ws = new WebSocket(WS_URL);
        wsRef.current = ws;

        ws.onopen = () => {
            console.log('Connected to WebSocket server');
            setIsConnected(true);
            reconnectDelayRef.current = 1000; // Reset backoff on success
        };

        ws.onclose = () => {
            const delay = reconnectDelayRef.current;
            console.log(`Disconnected, reconnecting in ${delay / 1000}s...`);
            setIsConnected(false);

            if (reconnectTimerRef.current) {
                clearTimeout(reconnectTimerRef.current);
            }

            reconnectTimerRef.current = setTimeout(() => {
                connectWebSocket();
            }, delay);
            reconnectDelayRef.current = Math.min(delay * 2, 30000); // Exponential backoff up to 30s
        };

        ws.onmessage = (event) => {
            try {
                const { type, payload } = JSON.parse(event.data);
                if (type === 'init' || type === 'update') {
                    setMessages(payload);
                } else if (type === 'latest-image') {
                    if (onLatestImageUpdate) {
                        onLatestImageUpdate(payload);
                    }
                } else if (type === 'play-audio') {
                    console.log('[Audio] Received speech playback request:', payload);
                    
                    // config.ttsEnabled の同期ラグを回避するため、
                    // イベントが届いた＝バックエンドで合成が実行された＝再生すべき！として問答無用で再生するお！
                    const apiEndpoint = import.meta.env.VITE_API_URL || 'http://localhost:3001/api/chat';
                    const backendBaseUrl = apiEndpoint.replace('/api/chat', '');
                    const audioUrl = `${backendBaseUrl}${payload.audioUrl}`;
                    
                    console.log('[Audio] Playing speech wav (Direct URL):', audioUrl);
                    
                    const audio = new Audio(audioUrl);
                    audio.play().catch(err => {
                        console.warn('[Audio] Automatic playback was blocked or failed:', err);
                    });
                }
            } catch (err) {
                console.error('Failed to parse message:', err);
            }
        };
    };

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
        // 最新の yome メッセージの expression を親に通知
        if (onExpressionChange) {
            const lastYomeMsg = [...messages].reverse().find(m => m.role === 'yome' && m.expression);
            onExpressionChange(lastYomeMsg?.expression || null);
        }
    }, [messages]);

    const handleSend = async (e) => {
        if (e) e.preventDefault();
        if (!input.trim()) return;

        const userMsg = input.trim();
        setInput('');
        const textarea = document.querySelector('.chat-input');
        if (textarea) textarea.style.height = 'auto';

        try {
            await fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ role: 'user', text: userMsg })
            });
            // The backend updates messages.json, which triggers chokidar,
            // and WebSocket broadcasts the new state back to us automatically.
        } catch (err) {
            console.error('API call failed:', err);
        }
    };

    const handleSimulateYome = async () => {
        try {
            await fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    role: 'yome',
                    text: 'ちょｗｗｗそこダブルクリックするとかお前ハッカーかよｗｗｗ\nこれはUI描画テスト用のダミーメッセージだお！\nバグじゃないから勘違いするなよ常考ｗｗｗ'
                })
            });
        } catch (err) { }
    };

    return (
        <div className={classNames('chat-container', { 'peek-mode': isPeekMode })} onClick={unlockAudio}>
            <div className="chat-header">
                <div className="header-info">
                    <div className="avatar-wrapper">
                        <img src="/avatars/default_yome.png" alt="Agent Avatar" className="header-avatar" />
                    </div>
                    <div>
                        <h2
                            onDoubleClick={handleSimulateYome}
                            title="ダブルクリックすると……？"
                            style={{ cursor: 'pointer', userSelect: 'none' }}
                        >
                            {config?.agentName || 'AI_Yome_Chat'}
                        </h2>
                        <div className="status-indicator">
                            <span className={classNames('status-dot', { connected: isConnected })}></span>
                            <span className="status-text">{isConnected ? 'System Online' : 'Connecting...'}</span>
                        </div>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: '12px' }}>
                    <button
                        className="action-btn"
                        onClick={onOpenGallery}
                        title="思い出ギャラリー"
                    >
                        <ImageIcon size={20} />
                    </button>
                    <button
                        className={classNames('action-btn', { active: isPeekMode })}
                        onClick={() => setIsPeekMode(!isPeekMode)}
                        title="画像鑑賞モード"
                    >
                        {isPeekMode ? <EyeOff size={20} /> : <Eye size={20} />}
                    </button>
                    <button
                        className={classNames('action-btn', { active: showJson })}
                        onClick={() => setShowJson(!showJson)}
                        title="JSONデータ表示"
                    >
                        <FileJson size={20} />
                    </button>
                    <button className="action-btn" onClick={() => setIsConfigOpen(true)} title="設定">
                        <SlidersHorizontal size={20} />
                    </button>
                </div>
            </div>

            <div className="messages-area">
                {messages.length === 0 && (
                    <div className="empty-state">
                        <Sparkles size={48} className="empty-icon" />
                        <p>まだメッセージがないお！</p>
                    </div>
                )}
                {messages.slice(-100).map((msg) => (
                    <div
                        key={msg.id || `${msg.timestamp}-${msg.text}`}
                        className={classNames('message-wrapper', {
                            'is-user': msg.role === 'user',
                            'is-yome': msg.role !== 'user'
                        })}
                    >
                        <div className="msg-avatar">
                            {msg.role === 'user' ? (
                                <img src="/avatars/user.png" alt="User" className="msg-avatar-img" />
                            ) : (
                                <img src="/avatars/default_yome.png" alt="Agent" className="msg-avatar-img" />
                            )}
                        </div>
                        <div className="message-content">
                            <div className="message-bubble">
                                {msg.text.split('\n').map((line, i, arr) => (
                                    <React.Fragment key={i}>
                                        {line}
                                        {i !== arr.length - 1 && <br />}
                                    </React.Fragment>
                                ))}
                            </div>
                            {config?.showTimestamp !== false && msg.timestamp && (
                                <div className="message-timestamp">
                                    {formatTime(msg.timestamp)}
                                </div>
                            )}
                        </div>
                    </div>
                ))}

                {/* Typing Indicator (mockup for flair) */}
                {messages.length > 0 && messages[messages.length - 1].role === 'user' && (
                    <div className="message-wrapper is-yome">
                        <div className="msg-avatar">
                            <img src="/avatars/default_yome.png" alt="Agent" className="msg-avatar-img" />
                        </div>
                        <div className="typing-indicator">
                            <span className="typing-dot"></span>
                            <span className="typing-dot"></span>
                            <span className="typing-dot"></span>
                        </div>
                    </div>
                )}

                <div ref={messagesEndRef} />
            </div>

            <div className="input-area">
                <textarea
                    value={input}
                    onChange={(e) => {
                        setInput(e.target.value);
                        e.target.style.height = 'auto';
                        e.target.style.height = Math.min(e.target.scrollHeight, 200) + 'px';
                    }}
                    onKeyDown={(e) => {
                        const binding = config?.sendKeyBinding || 'Enter';

                        let shouldSend = false;
                        if (binding === 'Enter' && e.key === 'Enter' && !e.shiftKey && !e.altKey && !e.ctrlKey) {
                            shouldSend = true;
                        } else if (binding === 'Alt+Enter' && e.key === 'Enter' && e.altKey) {
                            shouldSend = true;
                        } else if (binding === 'Ctrl+Enter' && e.key === 'Enter' && e.ctrlKey) {
                            shouldSend = true;
                        }

                        if (shouldSend) {
                            e.preventDefault();
                            handleSend();
                        }
                    }}
                    placeholder={`ここに入力だお... (${config?.sendKeyBinding || 'Enter'}で送信)`}
                    className="chat-input"
                    rows={1}
                />
                <button type="button" onClick={handleSend} className="send-btn" disabled={!input.trim()}>
                    <Send size={20} />
                </button>
            </div>

            <ConfigModal
                isOpen={isConfigOpen}
                onClose={() => {
                    setIsConfigOpen(false);
                    if (onConfigChange) onConfigChange();
                }}
            />

            {/* JSON表示用スライドパネル */}
            <div className={classNames('json-panel', { open: showJson })}>
                <div className="json-panel-header">
                    <h3>Raw JSON Data</h3>
                    <button className="json-close-btn" onClick={() => setShowJson(false)} title="閉じる">
                        <X size={20} />
                    </button>
                </div>
                <div className="json-panel-content">
                    <pre>{JSON.stringify(messages, null, 2)}</pre>
                </div>
            </div>
        </div >
    );
};

export default Chat;
