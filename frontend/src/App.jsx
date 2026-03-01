import React, { useState, useEffect, useRef } from 'react';
import Chat from './components/Chat';
import ImageGallery from './components/ImageGallery';
import './App.css';

const LATEST_IMAGE_URL = 'http://localhost:3001/api/latest-image';
const BACKEND_BASE = 'http://localhost:3001';
const POLL_INTERVAL = 5000; // 5秒ごとにポーリング

function App() {
  const [bgImageUrl, setBgImageUrl] = useState(null);
  const [isGalleryOpen, setIsGalleryOpen] = useState(false);
  const [customBgUrl, setCustomBgUrl] = useState(null);
  const [bgLoaded, setBgLoaded] = useState(false);
  const [tachieExpression, setTachieExpression] = useState(null);
  const [tachieLoaded, setTachieLoaded] = useState(false);
  const [tachieError, setTachieError] = useState(false);
  const [config, setConfig] = useState(null);
  const lastTimestampRef = useRef(0);

  const loadConfig = async () => {
    try {
      const res = await fetch(`${BACKEND_BASE}/api/config`);
      const data = await res.json();
      setConfig(data);
      applyGlobalStyles(data);
    } catch (err) {
      console.error('Failed to load global config:', err);
    }
  };

  const applyGlobalStyles = (cfg) => {
    if (!cfg) return;
    const root = document.documentElement;
    if (cfg.accentColor) {
      root.style.setProperty('--accent-primary', cfg.accentColor);
    }
    if (cfg.glassIntensity !== undefined) {
      // 0-100 to 0-40px blur range
      const blurValue = (cfg.glassIntensity / 100) * 40;
      root.style.setProperty('--glass-blur', `${blurValue}px`);
    }
    if (cfg.fontSize) {
      root.style.setProperty('--chat-font-size', `${cfg.fontSize}px`);
    }
  };

  useEffect(() => {
    loadConfig();
    const pollLatestImage = async () => {
      try {
        const res = await fetch(LATEST_IMAGE_URL);
        const data = await res.json();

        if (data.filename && data.timestamp !== lastTimestampRef.current) {
          lastTimestampRef.current = data.timestamp;
          const fullUrl = `${BACKEND_BASE}${data.url}?t=${data.timestamp}`;
          setBgLoaded(false);
          setBgImageUrl(fullUrl);
        }
      } catch (err) {
        // サーバー未起動時など、静かに無視する
      }
    };

    pollLatestImage();
    const intervalId = setInterval(pollLatestImage, POLL_INTERVAL);
    return () => clearInterval(intervalId);
  }, []);

  const handleExpressionChange = (expression) => {
    if (expression !== tachieExpression) {
      setTachieExpression(expression);
      setTachieLoaded(false);
      setTachieError(false);
    }
  };

  const handleSelectImage = (url) => {
    setCustomBgUrl(url);
    setBgLoaded(false);
    setBgImageUrl(`${BACKEND_BASE}${url}`);
  };

  const tachieUrl = tachieExpression
    ? `${BACKEND_BASE}/tachie/${encodeURIComponent(tachieExpression)}`
    : null;

  return (
    <div className="app-container">
      {bgImageUrl && (
        <img
          src={bgImageUrl}
          alt=""
          className={`app-bg-image ${bgLoaded ? 'loaded' : ''}`}
          onLoad={() => setBgLoaded(true)}
        />
      )}

      {/* 立ち絵表示エリア（チャットの左側） */}
      <div className="tachie-area">
        {tachieUrl && !tachieError && (
          <img
            src={tachieUrl}
            alt="tachie"
            className={`tachie-image ${tachieLoaded ? 'loaded' : ''}`}
            onLoad={() => setTachieLoaded(true)}
            onError={() => setTachieError(true)}
          />
        )}
        {tachieError && (
          <div className="tachie-error">
            <span>⚠️ {tachieExpression}</span>
          </div>
        )}
      </div>

      <main className="main-content">
        <Chat
          config={config}
          onConfigChange={loadConfig} // To refresh styles when config is saved
          onExpressionChange={handleExpressionChange}
          onOpenGallery={() => setIsGalleryOpen(true)}
        />
      </main>

      <ImageGallery
        isOpen={isGalleryOpen}
        onClose={() => setIsGalleryOpen(false)}
        onSelectImage={handleSelectImage}
      />
    </div>
  );
}

export default App;
