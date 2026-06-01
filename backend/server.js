const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const chokidar = require('chokidar');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const fsPromises = fs.promises;
const { execSync } = require('child_process');
const ttsManager = require('./tts_providers');


// コマンドライン引数からコンフィグパスを取得（デフォルト: data/default_config.json）
const args = process.argv.slice(2);
const configArgIndex = args.indexOf('--config');
// デフォルトのコンフィグ場所をルートの data フォルダに変更
const CONFIG_FILE = configArgIndex !== -1 && args[configArgIndex + 1]
    ? path.resolve(args[configArgIndex + 1])
    : path.resolve(__dirname, '..', 'data', 'default_config.json');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const PID_FILE = path.resolve(path.dirname(CONFIG_FILE), 'server.pid');

const isSafePath = (targetPath) => {
    const absolutePath = path.resolve(path.dirname(CONFIG_FILE), targetPath);
    const absoluteRoot = path.resolve(PROJECT_ROOT);
    return absolutePath.startsWith(absoluteRoot);
};

const safeWriteJsonSync = (filePath, data) => {
    const tempPath = filePath + '.tmp';
    try {
        fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf8');
        fs.renameSync(tempPath, filePath);
    } catch (err) {
        console.error(`Failed to write atomically to ${filePath}:`, err);
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    }
};

const safeWriteJson = async (filePath, data) => {
    const tempPath = filePath + '.tmp';
    try {
        const jsonStr = JSON.stringify(data, null, 2);
        await fsPromises.writeFile(tempPath, jsonStr, 'utf8');
        
        let attempts = 0;
        while (attempts < 5) {
            try {
                await fsPromises.rename(tempPath, filePath);
                break;
            } catch (renameErr) {
                attempts++;
                if (attempts >= 5) throw renameErr;
                // Windowsのファイルロック競合に備え50ms待機してリトライ
                await new Promise(resolve => setTimeout(resolve, 50));
            }
        }
    } catch (err) {
        console.error(`Failed to write atomically to ${filePath}:`, err);
        try {
            await fsPromises.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
        } catch (fallbackErr) {
            console.error(`Critical error: Fallback write failed for ${filePath}:`, fallbackErr);
        }
    }
};


// コンフィグの初期値
const DEFAULT_CONFIG = {
    tachiePath: "./expressions",
    generatedImagesPath: "./gallery",
    agentName: "AI_Yome_Chat",
    sendKeyBinding: "Enter", // "Enter", "Alt+Enter", "Ctrl+Enter"
    accentColor: "#a855f7",
    glassIntensity: 20,
    fontSize: 16,
    showTimestamp: true,
    ttsEnabled: false,
    ttsProvider: "irodori",
    ttsSettings: {
        irodori: {
            url: "http://localhost:8088",
            voice: "sample",
            seed: 42
        }
    }
};


const app = express();
app.use(cors());
app.use(express.json());

// 将来の画像配信などを見据えてpublicフォルダを静的ファイルとしてホスト
app.use('/public', express.static(path.join(__dirname, 'public')));

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3001;

// コンフィグ用とデータ用のディレクトリを確保
const configDir = path.dirname(CONFIG_FILE);
if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
}

// コンフィグファイルが存在しない場合はデフォルトで作成
if (!fs.existsSync(CONFIG_FILE)) {
    safeWriteJsonSync(CONFIG_FILE, DEFAULT_CONFIG);
}

// コンフィグのロードとパスの解決関数
const loadConfig = () => {
    try {
        const raw = fs.readFileSync(CONFIG_FILE, 'utf8');
        const parsed = JSON.parse(raw);
        return {
            ...DEFAULT_CONFIG,
            ...parsed,
            ttsSettings: {
                ...DEFAULT_CONFIG.ttsSettings,
                ...(parsed.ttsSettings || {})
            }
        };
    } catch (err) {
        console.error('Error reading config file:', err);
        return DEFAULT_CONFIG;
    }
};

const getMessagesJsonPath = () => {
    // コンフィグファイルと同じ階層の messages.json を使用する
    return path.resolve(path.dirname(CONFIG_FILE), 'messages.json');
};

const getGeneratedImagesPath = (config) => {
    return path.resolve(path.dirname(CONFIG_FILE), config.generatedImagesPath);
};

const getTachiePath = (config) => {
    return path.resolve(path.dirname(CONFIG_FILE), config.tachiePath);
};

// 初期パスを決定
let currentConfig = loadConfig();
let currentMessagesFile = getMessagesJsonPath();
let currentImagesDir = getGeneratedImagesPath(currentConfig);
let currentTachieDir = getTachiePath(currentConfig);

// TTS音声ファイル保存用ディレクトリの初期化
const AUDIO_DIR = path.join(__dirname, 'public', 'audio');
if (!fs.existsSync(AUDIO_DIR)) {
    fs.mkdirSync(AUDIO_DIR, { recursive: true });
}

// 古い音声ファイルを自動削除してクリーンにするお！
const cleanupOldAudioFiles = () => {
    try {
        if (!fs.existsSync(AUDIO_DIR)) return;
        const files = fs.readdirSync(AUDIO_DIR)
            .filter(f => f.endsWith('.wav'))
            .map(f => {
                const filePath = path.join(AUDIO_DIR, f);
                const stat = fs.statSync(filePath);
                return { name: f, path: filePath, mtime: stat.mtimeMs };
            });
        files.sort((a, b) => a.mtime - b.mtime);
        if (files.length > 30) {
            const toDelete = files.slice(0, files.length - 30);
            for (const file of toDelete) {
                fs.unlinkSync(file.path);
                console.log(`[TTS-Cleanup] Deleted old audio file: ${file.name}`);
            }
        }
    } catch (err) {
        console.error('[TTS-Cleanup] Failed to clean up old audio files:', err);
    }
};

// 非同期で音声合成を実行して、WebSocketで全クライアントに配信するお！
const synthesizeAndBroadcast = async (text, messageId) => {
    try {
        if (!text || !text.trim()) return;

        console.log(`[TTS] Requesting synthesis for: "${text.substring(0, 30)}..."`);
        const { buffer } = await ttsManager.synthesizeSpeech(
            text,
            currentConfig.ttsProvider,
            currentConfig.ttsSettings
        );

        const audioFile = path.join(AUDIO_DIR, `${messageId}.wav`);
        await fsPromises.writeFile(audioFile, buffer);
        console.log(`[TTS] Successfully synthesized message ${messageId} to ${audioFile}`);

        // ディスク容量保護のための自動お掃除
        cleanupOldAudioFiles();

        // クライアント側に「再生しろお！」と通知するお
        const audioUrl = `/public/audio/${messageId}.wav`;
        wss.clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({
                    type: 'play-audio',
                    payload: {
                        messageId: messageId,
                        audioUrl: audioUrl
                    }
                }));
            }
        });
    } catch (err) {
        console.error(`[TTS] Failed to synthesize speech for message ${messageId}:`, err);
    }
};


// 画像配信用の動的ルートを設定
const setupImageServing = (imagesDir) => {
    // ディレクトリが存在しない場合は作成
    if (!fs.existsSync(imagesDir)) {
        fs.mkdirSync(imagesDir, { recursive: true });
    }
};

setupImageServing(currentImagesDir);

// 画像配信用の動的ルート（コンフィグ更新時に動的に切り替わる）
app.use('/generated-images', (req, res, next) => {
    express.static(currentImagesDir)(req, res, next);
});

// 立ち絵配信用の動的ルート
const setupTachieServing = (tachieDir) => {
    if (!fs.existsSync(tachieDir)) {
        fs.mkdirSync(tachieDir, { recursive: true });
    }
};
setupTachieServing(currentTachieDir);

app.use('/tachie', (req, res, next) => {
    express.static(currentTachieDir)(req, res, next);
});

// 初期化時にメッセージ用のディレクトリとファイルが存在しない場合は作成
const initMessagesFile = (jsonFile) => {
    const dataDir = path.dirname(jsonFile);
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
    }
    if (!fs.existsSync(jsonFile)) {
        safeWriteJsonSync(jsonFile, []);
    }
};

initMessagesFile(currentMessagesFile);

// WebSocketでのクライアント接続処理
wss.on('connection', (ws) => {
    console.log('Client connected to WebSocket.');

    // 接続直後に現在のメッセージ履歴を送信
    try {
        if (fs.existsSync(currentMessagesFile)) {
            const data = fs.readFileSync(currentMessagesFile, 'utf8');
            ws.send(JSON.stringify({ type: 'init', payload: JSON.parse(data) }));
        }
    } catch (err) {
        console.error('Error reading JSON on connect:', err);
    }

    ws.on('close', () => console.log('Client disconnected from WebSocket.'));
});

// JSONファイルの監視用変数
let watcher = null;

const setupWatcher = async (jsonFile) => {
    if (watcher) {
        try {
            await watcher.close();
        } catch (err) {
            console.error('Failed to close old watcher:', err);
        }
    }
    initMessagesFile(jsonFile);

    watcher = chokidar.watch(jsonFile, { awaitWriteFinish: true });
    watcher.on('change', async (filePath) => {
        console.log(`Detected change in ${filePath}`);
        try {
            const data = await fsPromises.readFile(jsonFile, 'utf8');
            const parsedData = JSON.parse(data);

            // 全ての接続クライアントに更新内容をブロードキャスト
            wss.clients.forEach((client) => {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify({ type: 'update', payload: parsedData }));
                }
            });

            // もしTTSが有効で、最後のメッセージが嫁だったら、自動音声合成をキックするお！
            if (currentConfig.ttsEnabled && parsedData.length > 0) {
                const lastMsg = parsedData[parsedData.length - 1];
                if (lastMsg.role === 'yome' && lastMsg.text && lastMsg.id) {
                    const audioFile = path.join(AUDIO_DIR, `${lastMsg.id}.wav`);
                    // 重複合成を防ぐためにファイル存在チェックをかけるお！
                    if (!fs.existsSync(audioFile)) {
                        synthesizeAndBroadcast(lastMsg.text, lastMsg.id);
                    }
                }
            }
        } catch (err) {
            console.error('Error reading/parsing JSON after change:', err);
        }
    });
};

let imageWatcher = null;
const setupImageWatcher = async (imagesDir) => {
    if (imageWatcher) {
        try {
            await imageWatcher.close();
        } catch (err) {
            console.error('Failed to close old image watcher:', err);
        }
    }
    if (!fs.existsSync(imagesDir)) {
        fs.mkdirSync(imagesDir, { recursive: true });
    }

    const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp'];

    imageWatcher = chokidar.watch(imagesDir, {
        awaitWriteFinish: {
            stabilityThreshold: 1000,
            pollInterval: 100
        },
        ignoreInitial: true
    });

    imageWatcher.on('add', async (filePath) => {
        const ext = path.extname(filePath).toLowerCase();
        if (IMAGE_EXTENSIONS.includes(ext)) {
            const filename = path.basename(filePath);
            console.log(`Detected new image: ${filename}`);
            try {
                const stats = await fsPromises.stat(filePath);
                const msg = JSON.stringify({
                    type: 'latest-image',
                    payload: {
                        filename: filename,
                        timestamp: stats.mtimeMs,
                        url: `/generated-images/${encodeURIComponent(filename)}`
                    }
                });

                wss.clients.forEach((client) => {
                    if (client.readyState === WebSocket.OPEN) {
                        client.send(msg);
                    }
                });
            } catch (err) {
                console.error('Error handling new image watch event:', err);
            }
        }
    });
};

// 最初の監視スタート
setupWatcher(currentMessagesFile);
setupImageWatcher(currentImagesDir);

// フロントからのメッセージを受け取るAPI
app.post('/api/chat', async (req, res) => {
    try {
        const { role, text, expression } = req.body;
        if (!role || !text) {
            return res.status(400).json({ error: 'Missing role or text' });
        }

        const data = await fsPromises.readFile(currentMessagesFile, 'utf8');
        const messages = JSON.parse(data);

        // idとtimestampの付与 (send_yome.pyと仕様を揃える)
        const newMsg = {
            id: require('crypto').randomUUID(),
            role,
            text,
            timestamp: new Date().toISOString()
        };
        if (expression) {
            newMsg.expression = expression;
        }
        messages.push(newMsg);

        // 黒窓（ターミナル）へJSONを垂れ流す（同志の要望）
        console.log('\n--- New Message Received ---');
        console.log(JSON.stringify(newMsg, null, 2));

        await safeWriteJson(currentMessagesFile, messages);
        res.json({ success: true });
    } catch (err) {
        console.error('Error saving message:', err);
        res.status(500).json({ error: 'Failed to save message' });
    }
});

// --- コンフィグ管理用API ---
app.get('/api/config', (req, res) => {
    res.json(loadConfig());
});

app.post('/api/config', async (req, res) => {
    try {
        const newConfig = req.body;
        // 必須キー（最低限ディレクトリ系）のチェック
        if (!newConfig.tachiePath || !newConfig.generatedImagesPath) {
            return res.status(400).json({ error: 'Invalid config format' });
        }

        // パストラバーサル脆弱性の防御 (Task-03)
        if (!isSafePath(newConfig.tachiePath) || !isSafePath(newConfig.generatedImagesPath)) {
            return res.status(400).json({ error: 'Invalid path: Traversal detected' });
        }


        // コンフィグ保存
        await safeWriteJson(CONFIG_FILE, newConfig);
        currentConfig = newConfig;

        // メッセージファイルの監視パスは固定だが、念のため再設定しない（固定化済み）
        // getMessagesJsonPath() は常に同じ値を返すため監視の再構築は不要

        // 画像フォルダの配信パスを更新
        const newImagesDir = getGeneratedImagesPath(currentConfig);
        if (currentImagesDir !== newImagesDir) {
            console.log(`Config updated. Switching images dir to: ${newImagesDir}`);
            currentImagesDir = newImagesDir;
            setupImageServing(currentImagesDir);
            await setupImageWatcher(currentImagesDir);
        }

        // 立ち絵フォルダの配信パスを更新
        const newTachieDir = getTachiePath(currentConfig);
        if (currentTachieDir !== newTachieDir) {
            console.log(`Config updated. Switching tachie dir to: ${newTachieDir}`);
            currentTachieDir = newTachieDir;
            setupTachieServing(currentTachieDir);
        }

        res.json({ success: true, message: 'Config updated successfully' });
    } catch (err) {
        console.error('Error updating config:', err);
        res.status(500).json({ error: 'Failed to update config' });
    }
});

// --- 画像ギャラリー用API ---

// 画像一覧取得
app.get('/api/images', (req, res) => {
    try {
        const dir = currentImagesDir;

        if (!fs.existsSync(dir)) {
            console.log('Generated images directory not found:', dir);
            return res.json([]);
        }

        const files = fs.readdirSync(dir);
        const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp'];
        const imageFiles = files.filter(file =>
            IMAGE_EXTENSIONS.includes(path.extname(file).toLowerCase())
        );

        const imageData = imageFiles.map(file => {
            const filePath = path.join(dir, file);
            const stats = fs.statSync(filePath);
            return {
                name: file,
                url: `/generated-images/${encodeURIComponent(file)}`, // static配信パスに合わせる
                size: stats.size,
                mtime: stats.mtime
            };
        });

        // 新しい順にソート
        imageData.sort((a, b) => b.mtime - a.mtime);

        res.json(imageData);
    } catch (err) {
        console.error('Error fetching image list:', err);
        res.status(500).json({ error: 'Failed to fetch image list' });
    }
});

// 画像削除
app.delete('/api/images/:filename', (req, res) => {
    try {
        const { filename } = req.params;
        const filePath = path.join(currentImagesDir, filename);

        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: 'File not found' });
        }

        // セキュリティチェック
        const absolutePath = path.resolve(filePath);
        const absoluteDirPath = currentImagesDir;
        if (!absolutePath.startsWith(absoluteDirPath)) {
            return res.status(403).json({ error: 'Forbidden' });
        }

        fs.unlinkSync(filePath);
        res.json({ success: true });
    } catch (err) {
        console.error('Error deleting image:', err);
        res.status(500).json({ error: 'Failed to delete image' });
    }
});


// --- ファイル/フォルダ選択ダイアログAPI（Windows専用） ---
app.get('/api/browse', (req, res) => {
    const type = req.query.type || 'folder'; // 'file' or 'folder'
    try {
        let psScript;
        if (type === 'file') {
            psScript = `
Add-Type -AssemblyName System.Windows.Forms
$form = New-Object System.Windows.Forms.Form
$form.TopMost = $true
$form.ShowInTaskbar = $false
$form.Opacity = 0
$form.Show()
$null = $form.Focus()
$dialog = New-Object System.Windows.Forms.OpenFileDialog
$dialog.Filter = 'JSON files (*.json)|*.json|All files (*.*)|*.*'
$dialog.Title = 'Select a file'
if ($dialog.ShowDialog($form) -eq 'OK') {
    Write-Output $dialog.FileName
}
$form.Dispose()`;
        } else {
            psScript = `
Add-Type -AssemblyName System.Windows.Forms
$form = New-Object System.Windows.Forms.Form
$form.TopMost = $true
$form.ShowInTaskbar = $false
$form.Opacity = 0
$form.Show()
$null = $form.Focus()
$dialog = New-Object System.Windows.Forms.FolderBrowserDialog
$dialog.Description = 'Select a folder'
if ($dialog.ShowDialog($form) -eq 'OK') {
    Write-Output $dialog.SelectedPath
}
$form.Dispose()`;
        }

        const result = execSync(
            `powershell -NoProfile -Command "${psScript.replace(/"/g, '\\"').replace(/\n/g, '; ')}"`,
            { encoding: 'utf8', timeout: 60000, windowsHide: true }
        ).trim();

        if (result) {
            res.json({ success: true, path: result });
        } else {
            res.json({ success: false, message: 'No selection made' });
        }
    } catch (err) {
        console.error('Browse dialog error:', err.message);
        res.json({ success: false, message: 'Dialog cancelled or error occurred' });
    }
});

// --- 最新画像API ---
const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp'];

app.get('/api/latest-image', (req, res) => {
    try {
        if (!fs.existsSync(currentImagesDir)) {
            return res.json({ filename: null });
        }

        const files = fs.readdirSync(currentImagesDir)
            .filter(f => IMAGE_EXTENSIONS.includes(path.extname(f).toLowerCase()));

        if (files.length === 0) {
            return res.json({ filename: null });
        }

        // タイムスタンプが最も新しいファイルを特定
        let latestFile = null;
        let latestTime = 0;
        for (const file of files) {
            const stat = fs.statSync(path.join(currentImagesDir, file));
            if (stat.mtimeMs > latestTime) {
                latestTime = stat.mtimeMs;
                latestFile = file;
            }
        }

        res.json({
            filename: latestFile,
            timestamp: latestTime,
            url: `/generated-images/${encodeURIComponent(latestFile)}`
        });
    } catch (err) {
        console.error('Error finding latest image:', err);
        res.status(500).json({ error: 'Failed to find latest image' });
    }
});

const cleanupPid = () => {
    try {
        if (fs.existsSync(PID_FILE)) {
            fs.unlinkSync(PID_FILE);
            console.log(`PID file removed: ${PID_FILE}`);
        }
    } catch (err) {
        console.error('Failed to remove PID file:', err);
    }
};

process.on('SIGINT', () => {
    cleanupPid();
    process.exit(0);
});

process.on('SIGTERM', () => {
    cleanupPid();
    process.exit(0);
});

process.on('exit', () => {
    cleanupPid();
});

server.listen(PORT, () => {
    console.log(`Backend server is running on http://localhost:${PORT}`);
    try {
        fs.writeFileSync(PID_FILE, process.pid.toString(), 'utf8');
        console.log(`PID written to ${PID_FILE}: ${process.pid}`);
    } catch (err) {
        console.error('Failed to write PID file:', err);
    }
});

