import React, { useState, useEffect } from 'react';
import { X, Image, Trash2, Check, RefreshCw } from 'lucide-react';
import './ImageGallery.css';

const BACKEND_BASE = 'http://localhost:3001';

const ImageGallery = ({ isOpen, onClose, onSelectImage }) => {
    const [images, setImages] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const fetchImages = async () => {
        setLoading(true);
        try {
            const response = await fetch(`${BACKEND_BASE}/api/images`);
            if (!response.ok) throw new Error('Failed to fetch images');
            const data = await response.json();
            setImages(data);
            setError(null);
        } catch (err) {
            console.error(err);
            setError('画像リストの取得に失敗したお。');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (isOpen) {
            fetchImages();
        }
    }, [isOpen]);

    const handleDelete = async (e, filename) => {
        e.stopPropagation();
        if (!window.confirm(`この画像を削除していいん？\n${filename}`)) return;

        try {
            const response = await fetch(`${BACKEND_BASE}/api/images/${filename}`, {
                method: 'DELETE',
            });
            if (!response.ok) throw new Error('Failed to delete');
            setImages(images.filter(img => img.name !== filename));
        } catch (err) {
            console.error(err);
            alert('削除に失敗したお。');
        }
    };

    if (!isOpen) return null;

    return (
        <div className="gallery-overlay">
            <div className="gallery-panel">
                <div className="gallery-header">
                    <div className="header-title">
                        <Image size={20} />
                        <span>思い出ギャラリー</span>
                    </div>
                    <div className="header-actions">
                        <button onClick={fetchImages} className="action-button" title="更新">
                            <RefreshCw size={18} className={loading ? 'spinning' : ''} />
                        </button>
                        <button onClick={onClose} className="action-button close-button">
                            <X size={20} />
                        </button>
                    </div>
                </div>

                <div className="gallery-content">
                    {loading && <div className="gallery-status">読み込み中だお...</div>}
                    {error && <div className="gallery-status error">{error}</div>}
                    {!loading && !error && images.length === 0 && (
                        <div className="gallery-status">まだ画像がないお。</div>
                    )}

                    <div className="image-grid">
                        {images.map((img) => (
                            <div
                                key={img.name}
                                className="image-card"
                                onClick={() => onSelectImage(img.url)}
                            >
                                <div className="image-container">
                                    <img src={`${BACKEND_BASE}${img.url}`} alt={img.name} loading="lazy" />
                                    <div className="image-overlay">
                                        <div className="image-actions">
                                            <button
                                                className="apply-btn"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onSelectImage(img.url);
                                                }}
                                                title="背景に設定"
                                            >
                                                <Check size={18} />
                                            </button>
                                            <button
                                                className="delete-btn"
                                                onClick={(e) => handleDelete(e, img.name)}
                                                title="削除"
                                            >
                                                <Trash2 size={18} />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                                <div className="image-info">
                                    <span className="image-date">
                                        {new Date(img.mtime).toLocaleDateString()}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ImageGallery;
