import { Firestore } from '@google-cloud/firestore';
import { config } from '../config.js';
import { logger } from '../logger.js';

// Initialize Firestore - will fail gracefully if not configured
let db = null;
try {
    db = new Firestore();
} catch (err) {
    logger.warn({ error: err.message }, 'Firestore not initialized');
}

export async function appendHistory(sessionId, entry) {
    // Skip if Firestore not configured
    if (!db || !config.firestoreCollection) {
        logger.debug('Firestore not configured, skipping history save');
        return;
    }
    
    try {
        const ref = db.collection(config.firestoreCollection).doc(sessionId);
        await db.runTransaction(async (tx) => {
            const snap = await tx.get(ref);
            const now = new Date().toISOString();
            if (!snap.exists) {
                tx.set(ref, { createdAt: now, updatedAt: now, history: [entry] });
            } else {
                const data = snap.data();
                tx.update(ref, {
                    updatedAt: now,
                    history: [...(data.history || []), entry]
                });
            }
        });
    } catch (err) {
        logger.warn({ error: err.message, sessionId }, 'Failed to save history');
    }
}

export async function getSession(sessionId) {
    // Skip if Firestore not configured
    if (!db || !config.firestoreCollection) {
        return null;
    }
    
    try {
        const ref = db.collection(config.firestoreCollection).doc(sessionId);
        const snap = await ref.get();
        return snap.exists ? snap.data() : null;
    } catch (err) {
        logger.warn({ error: err.message, sessionId }, 'Failed to get session');
        return null;
    }
}
