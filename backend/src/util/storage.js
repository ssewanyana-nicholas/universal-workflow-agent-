import { Storage } from '@google-cloud/storage';
import { config } from '../config.js';
import { logger } from '../logger.js';

const storage = new Storage();
const bucket = storage.bucket(config.bucket);

export async function saveBase64Image(base64, prefix = 'screens', ext = 'png') {
    const buf = Buffer.from(base64, 'base64');
    const filename = `${prefix}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const file = bucket.file(filename);
    await file.save(buf, { contentType: `image/${ext}`, resumable: false, public: false });
    logger.info({ filename }, 'Saved image to GCS');
    return { gcsPath: `gs://${config.bucket}/${filename}`, filename };
}

export async function saveBuffer(buffer, prefix = 'screens', ext = 'png') {
    const filename = `${prefix}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const file = bucket.file(filename);
    await file.save(buffer, { contentType: `image/${ext}`, resumable: false, public: false });
    logger.info({ filename }, 'Saved buffer image to GCS');
    return { gcsPath: `gs://${config.bucket}/${filename}`, filename };
}

export async function getSignedUrl(filename, expirySeconds = 3600) {
    const file = bucket.file(filename);
    const [url] = await file.getSignedUrl({
        action: 'read',
        expires: Date.now() + expirySeconds * 1000
    });
    return url;
}
