const irodori = require('./irodori');

// 将来的にVOICEVOXやOpenAIなどの他プロバイダーを追加する場合は、ここにインポートして追加するだけだお！
const providers = {
    [irodori.id]: irodori
};

/**
 * 有効なプロバイダーを使用してテキストを音声に合成する共通関数だお！
 * 
 * @param {string} text 喋らせるセリフ
 * @param {string} providerId 使用するプロバイダーID
 * @param {object} ttsSettings 全プロバイダーの設定データ階層
 * @returns {Promise<{ buffer: Buffer, format: string }>} 音声Bufferとフォーマット
 */
async function synthesizeSpeech(text, providerId, ttsSettings) {
    const provider = providers[providerId];
    if (!provider) {
        throw new Error(`TTS Provider "${providerId}" is not supported or not implemented yet.`);
    }

    const settings = ttsSettings && ttsSettings[providerId] ? ttsSettings[providerId] : {};
    const buffer = await provider.synthesize(text, settings);
    
    return {
        buffer,
        format: 'wav' // Irodoriは標準でwav出力だお
    };
}

module.exports = {
    providers,
    synthesizeSpeech
};
