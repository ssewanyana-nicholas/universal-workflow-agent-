import pino from 'pino';

const pretty =
    process.env.NODE_ENV === 'development'
        ? { transport: { target: 'pino-pretty', options: { colorize: true } } }
        : {};

// PII Redaction Helper (PROMPT Q)
export function redactPII(obj) {
    if (!obj) return obj;

    const str = JSON.stringify(obj);

    // Redact email addresses: user@example.com -> u***@example.com
    let redacted = str.replace(/\b([a-zA-Z0-9._%+-]{1,2})[a-zA-Z0-9._%+-]*@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g, (match, prefix, domain) => {
        return `${prefix}***@${domain}`;
    });

    // Redact long IDs: keep only last 4 chars
    // Pattern: alphanumeric strings > 20 chars
    redacted = redacted.replace(/\b([a-zA-Z0-9]{4})[a-zA-Z0-9]{16,}([a-zA-Z0-9]{4})\b/g, '$1****$2');

    return JSON.parse(redacted);
}

export const logger = pino({
    level: process.env.LOG_LEVEL || 'info',
    ...pretty,
    serializers: {
        ...pino.stdSerializers,
        // Redact sensitive fields before logging
        req: (req) => {
            const redacted = { ...req };
            if (redacted.query?.token) redacted.query.token = '***REDACTED***';
            if (redacted.headers?.authorization) redacted.headers.authorization = '***REDACTED***';
            return redacted;
        }
    }
});
