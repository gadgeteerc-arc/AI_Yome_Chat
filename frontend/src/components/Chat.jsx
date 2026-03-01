import React, { useState, useEffect, useRef } from 'react';
import classNames from 'classnames';
import { Send, User, Sparkles, SlidersHorizontal, Eye, EyeOff, FileJson, X, Image as ImageIcon } from 'lucide-react';
import ConfigModal from './ConfigModal';
import './Chat.css';

const WS_URL = 'ws://localhost:3001';
const API_URL = 'http://localhost:3001/api/chat';

const Chat = ({ config, onConfigChange, onExpressionChange, onOpenGallery }) => {
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [isConnected, setIsConnected] = useState(false);
    const [isConfigOpen, setIsConfigOpen] = useState(false);
    const [isPeekMode, setIsPeekMode] = useState(false);
    const [showJson, setShowJson] = useState(false);
    const messagesEndRef = useRef(null);
    const wsRef = useRef(null);

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
            if (wsRef.current) wsRef.current.close();
        };
    }, []);

    const connectWebSocket = () => {
        const ws = new WebSocket(WS_URL);
        wsRef.current = ws;

        ws.onopen = () => {
            console.log('Connected to WebSocket server');
            setIsConnected(true);
        };

        ws.onclose = () => {
            console.log('Disconnected, reconnecting in 3s...');
            setIsConnected(false);
            setTimeout(connectWebSocket, 3000);
        };

        ws.onmessage = (event) => {
            try {
                const { type, payload } = JSON.parse(event.data);
                if (type === 'init' || type === 'update') {
                    setMessages(payload);
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
        <div className={classNames('chat-container', { 'peek-mode': isPeekMode })}>
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
                {messages.map((msg, idx) => (
                    <div
                        key={idx}
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
