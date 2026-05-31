const path = require('path');

/**
 * Irodori-TTS OpenAI互換APIを使用してテキストを音声に合成するプロバイダーだお！
 * 
 * @param {string} text 喋らせるセリフ
 * @param {object} settings プロバイダー用の設定項目 (url, voice, seed)
 * @returns {Promise<Buffer>} 生成された音声のバイナリデータ (Buffer)
 */
async function synthesize(text, settings) {
    const url = settings.url || 'http://localhost:8088';
    const cleanUrl = url.endsWith('/') ? url.slice(0, -1) : url;
    const endpoint = `${cleanUrl}/v1/audio/speech`;

    const requestBody = {
        model: 'irodori-tts',
        input: text,
        voice: settings.voice || 'sample',
        response_format: 'wav'
    };

    // シード値が設定されている場合のみリクエストに追加するお！
    if (typeof settings.seed === 'number' && settings.seed >= 0) {
        requestBody.seed = settings.seed;
    } else if (typeof settings.seed === 'string' && !isNaN(parseInt(settings.seed))) {
        const parsedSeed = parseInt(settings.seed);
        if (parsedSeed >= 0) {
            requestBody.seed = parsedSeed;
        }
    }

    console.log(`[TTS-Irodori] Calling API: ${endpoint} for text: "${text.substring(0, 30)}..."`);
    
    const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Irodori-TTS API failed with status ${response.status}: ${errorText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
}

module.exports = {
    id: 'irodori',
    name: 'Irodori-TTS',
    synthesize
};
