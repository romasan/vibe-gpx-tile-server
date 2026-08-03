const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
const fetch = require('node-fetch');
const { SocksProxyAgent } = require('socks-proxy-agent');
const {
    debugStravaSecret,
    proxy: { host },
} = require('./config.json');

class StravaUploader {
    constructor(accessToken, proxyUrl) {
        this.accessToken = accessToken;
        this.proxyUrl = proxyUrl;
        this.agent = new SocksProxyAgent(proxyUrl);
        this.baseURL = 'https://www.strava.com/api/v3';
    }

    async uploadGPX(gpxFilePath, options = {}) {
        const {
            name = 'Велотренировка',
            description = '',
            activityType = 'Ride',
            private = false,
            commute = false,
        } = options;

        if (!fs.existsSync(gpxFilePath)) {
            throw new Error(`Файл не найден: ${gpxFilePath}`);
        }

        const fileSize = fs.statSync(gpxFilePath).size;
        if (fileSize > 25 * 1024 * 1024) {
            throw new Error('Файл слишком большой (макс. 25 МБ)');
        }

        const form = new FormData();

        form.append('file', fs.createReadStream(gpxFilePath));
        form.append('activity_type', activityType.toLowerCase());
        form.append('name', name);
        form.append('private', private ? '1' : '0');
        form.append('commute', commute ? '1' : '0');

        if (description) {
            form.append('description', description);
        }

        const headers = {
            ...form.getHeaders(),
            'Authorization': `Bearer ${this.accessToken}`
        };

        console.log(`📤 Загрузка файла: ${path.basename(gpxFilePath)}`);
        console.log(`📊 Размер: ${(fileSize / 1024 / 1024).toFixed(2)} МБ`);
        console.log(`🚴 Тип активности: ${activityType}`);

        const response = await fetch(`${this.baseURL}/uploads`, {
            method: 'POST',
            headers,
            body: form,
            agent: this.agent,
            timeout: 60000
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(`Ошибка Strava API: ${data.message || response.statusText}`);
        }

        console.log(`✅ Загрузка инициирована. ID: ${data.id}`);
        return data;
    }

    async checkUploadStatus(uploadId, maxAttempts = 30, interval = 2000) {
        console.log(`⏳ Проверка статуса загрузки ${uploadId}...`);

        for (let i = 0; i < maxAttempts; i++) {
            const response = await fetch(`${this.baseURL}/uploads/${uploadId}`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`
                },
                agent: this.agent,
                timeout: 10000
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(`Ошибка проверки статуса: ${data.message}`);
            }

            console.log(`🔄 Попытка ${i + 1}/${maxAttempts}: статус = ${data.status}`);

            if (data.status === 'Your activity is ready.') {
                console.log(`✅ Активность создана! ID: ${data.activity_id}`);
                return { success: true, activityId: data.activity_id, data };
            }

            if (data.status === 'Your activity is being processed.') {
                await new Promise(resolve => setTimeout(resolve, interval));
                continue;
            }

            throw new Error(`Ошибка обработки: ${data.status}`);
        }

        throw new Error('Превышено время ожидания обработки');
    }

    async uploadAndTrack(gpxFilePath, options = {}) {
        const uploadResult = await this.uploadGPX(gpxFilePath, options);
        const statusResult = await this.checkUploadStatus(uploadResult.id);

        return statusResult;
    }
}

async function upload(filePath, secret = debugStravaSecret) {
    // const GPX_FILE = process.argv[2] || './ride.gpx';
    try {
        const uploader = new StravaUploader(secret, host); // socks5://127.0.0.1:1080

        const result = await uploader.uploadAndTrack(filePath, {
            name: 'Утренняя велопрогулка',
            description: 'Тестовая загрузка через прокси',
            activityType: 'Ride',
            private: false,
            commute: false
        });

        console.log('\n🎉 Завершено!');
        console.log(`🔗 Ссылка на активность: https://www.strava.com/activities/${result.activityId}`);

        return result;

    } catch (error) {
        console.error('❌ Ошибка:', error.message);
        process.exit(1);
    }
};

module.exports = {
    upload,
}
