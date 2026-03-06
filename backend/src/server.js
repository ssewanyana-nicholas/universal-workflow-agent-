import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import { logger } from './logger.js';
import { Orchestrator } from './orchestrator.js';
import { ADKAgent } from './adk_agent.js';
import { closeBrowser } from './browser.js';
import { getSession } from './util/state.js';
import { Storage } from '@google-cloud/storage';

const app = express();

// Demo token for authentication (PROMPT Q)
const DEMO_TOKEN = process.env.DEMO_TOKEN;

// Bearer token auth middleware (PROMPT Q)
function requireAuth(req, res, next) {
    if (!DEMO_TOKEN) {
        // No token configured, allow all
        return next();
    }

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Authorization required' });
    }

    const token = authHeader.substring(7);
    if (token !== DEMO_TOKEN) {
        return res.status(403).json({ error: 'Invalid token' });
    }

    next();
}

// Metrics
const metrics = {
    uptime: Date.now(),
    requests: 0,
    latencies: [],
};

// File mapping for uploads (in-memory for demo)
const fileMappings = new Map();

// Cloud Storage client
const storage = new Storage({ projectId: config.projectId });
const bucket = storage.bucket(config.bucket);

// Middleware
app.use(cors({
    origin: config.allowedOrigin,
}));
app.use(express.json({ limit: '10mb' }));

// Request logging
app.use((req, res, next) => {
    const start = Date.now();
    metrics.requests++;

    res.on('finish', () => {
        const latency = Date.now() - start;
        metrics.latencies.push(latency);
        if (metrics.latencies.length > 1000) {
            metrics.latencies = metrics.latencies.slice(-1000);
        }

        logger.info({
            method: req.method,
            path: req.path,
            status: res.statusCode,
            latency_ms: latency,
        }, 'Incoming request');
    });

    next();
});

// Health check
app.get('/health', (req, res) => {
    res.json({
        ok: true,
        timestamp: new Date().toISOString(),
        service: 'workflow-agent-backend'
    });
});

// Metrics endpoint
app.get('/metrics', (req, res) => {
    const avgLatency = metrics.latencies.length > 0
        ? Math.round(metrics.latencies.reduce((a, b) => a + b, 0) / metrics.latencies.length)
        : 0;

    res.json({
        uptime_seconds: Math.floor((Date.now() - metrics.uptime) / 1000),
        request_count: metrics.requests,
        avg_latency_ms: avgLatency,
    });
});

// GCP proof endpoint
app.get('/proof/gcp', (req, res) => {
    res.json({
        project_id: config.projectId,
        location: config.location,
        service_url: process.env.CLOUD_RUN_URL || null,
        gcs_bucket: config.bucket,
        firestore_collection: config.firestoreCollection,
    });
});

// Requirements proof endpoint - competition compliance
app.get('/proof/requirements', (req, res) => {
    res.json({
        gemini_model: 'gemini-2.0-flash',
        sdk: '@google-cloud/vertexai',
        multimodal_vision: true,
        gcp_services_used: [
            'Vertex AI',
            'Cloud Run',
            'Cloud Storage',
            'Firestore',
            'Cloud Logging'
        ],
        tools: [
            { name: 'open_url', description: 'Navigate to a URL' },
            { name: 'click', description: 'Click at normalized coordinates' },
            { name: 'type_text', description: 'Type text into elements' },
            { name: 'scroll', description: 'Scroll the page' },
            { name: 'wait', description: 'Wait for milliseconds' },
            { name: 'press_key', description: 'Press keyboard key' },
            { name: 'get_url', description: 'Get current URL and title' },
            { name: 'take_screenshot', description: 'Capture current page screenshot' }
        ],
        agent_type: 'ADK-style with Gemini multimodal',
        competition_ready: true
    });
});

// Run workflow - single step (PROMPT K)
app.post('/agent/step', requireAuth, async (req, res) => {
    try {
        const { sessionId, userGoal, sessionState, screenshotBase64 } = req.body;

        if (!userGoal) {
            return res.status(400).json({ error: 'userGoal is required' });
        }

        const id = sessionId || `session_${Date.now()}`;
        const orchestrator = new Orchestrator(id, sessionState);
        await orchestrator.initialize(screenshotBase64);

        try {
            const step = await orchestrator.runStep(userGoal, screenshotBase64);
            res.json(step);
        } finally {
            await orchestrator.cleanup();
        }
    } catch (error) {
        logger.error({ error: error.message }, 'Step failed');
        res.status(500).json({ error: error.message });
    }
});

// Analysis-only mode - just analyze screenshot without executing tools
app.post('/agent/analyze', requireAuth, async (req, res) => {
    try {
        const { sessionId, userGoal, screenshotBase64 } = req.body;

        if (!userGoal || !screenshotBase64) {
            return res.status(400).json({ error: 'userGoal and screenshotBase64 are required' });
        }

        logger.info({ sessionId, userGoal }, 'Analysis mode - analyzing screenshot');

        // Import the analyze function
        const { analyzeScreenshot } = await import('./gemini.js');
        
        const analysis = await analyzeScreenshot(userGoal, screenshotBase64);
        
        res.json({
            analysis,
            mode: 'analysis-only'
        });
    } catch (error) {
        logger.error({ error: error.message }, 'Analysis failed');
        res.status(500).json({ error: error.message });
    }
});

// Run workflow - full loop (PROMPT K)
app.post('/agent/run', requireAuth, async (req, res) => {
    try {
        const { sessionId, userGoal, sessionState, screenshotBase64 } = req.body;

        if (!userGoal) {
            return res.status(400).json({ error: 'userGoal is required' });
        }

        const MAX_STEPS = parseInt(process.env.MAX_STEPS || '20');
        const MAX_MS = parseInt(process.env.MAX_MS || '120000');
        const id = sessionId || `session_${Date.now()}`;
        const startTime = Date.now();

        logger.info({ sessionId: id, userGoal, sessionState }, 'Starting agent run');

        const orchestrator = new Orchestrator(id, sessionState);
        await orchestrator.initialize(screenshotBase64);

        const steps = [];
        let status = 'partial';
        let final = null;

        try {
            for (let stepCount = 0; stepCount < MAX_STEPS; stepCount++) {
                // Check wall time
                if (Date.now() - startTime > MAX_MS) {
                    logger.warn({ stepCount, elapsed: Date.now() - startTime }, 'Max time exceeded');
                    break;
                }

                const step = await orchestrator.runStep(userGoal);
                steps.push(step);

                // Check if final
                if (step.tool === 'finish_with_report') {
                    final = step.result;
                    status = 'success';
                    break;
                }

                // If error, stop
                if (!step.ok) {
                    status = 'failed';
                    break;
                }
            }
        } finally {
            await orchestrator.cleanup();
        }

        logger.info({
            sessionId: id,
            steps: steps.length,
            hasScreenshots: steps.filter(s => s.backendScreenshot).length,
            totalTime: Date.now() - startTime,
            status
        }, 'Agent run complete');

        res.json({
            status,
            steps,
            final,
            metadata: {
                sessionId: id,
                totalSteps: steps.length,
                totalTimeMs: Date.now() - startTime,
            }
        });
    } catch (error) {
        logger.error({ error: error.message }, 'Agent run failed');
        res.status(500).json({ error: error.message });
    }
});

// ADK Agent endpoint - uses Gemini with tool execution
app.post('/agent/adk', requireAuth, async (req, res) => {
    try {
        const { sessionId, userGoal, sessionState, screenshotBase64 } = req.body;

        if (!userGoal) {
            return res.status(400).json({ error: 'userGoal is required' });
        }

        const id = sessionId || `adk_${Date.now()}`;
        const startTime = Date.now();

        logger.info({ sessionId: id, userGoal, sessionState }, 'Starting ADK agent run');

        const adkAgent = new ADKAgent(id, sessionState);
        
        try {
            const result = await adkAgent.run(userGoal, screenshotBase64);
            
            logger.info({ 
                sessionId: id, 
                duration: Date.now() - startTime,
                steps: result.steps?.length 
            }, 'ADK agent run complete');

            res.json({
                status: result.ok ? 'success' : 'error',
                steps: result.steps,
                screenshot: result.screenshot,
                metadata: {
                    sessionId: id,
                    totalSteps: result.steps?.length || 0,
                    totalTimeMs: result.duration || (Date.now() - startTime),
                    agentType: 'ADK_GEMINI'
                }
            });
        } finally {
            await adkAgent.cleanup();
        }
    } catch (error) {
        logger.error({ error: error.message }, 'ADK agent run failed');
        res.status(500).json({ error: error.message });
    }
});

// File mapping for uploads (PROMPT L)
app.post('/files/map', requireAuth, (req, res) => {
    try {
        const { label, filename } = req.body;
        if (!label || !filename) {
            return res.status(400).json({ error: 'label and filename are required' });
        }
        fileMappings.set(label, filename);
        logger.info({ label, filename }, 'File mapped');
        res.json({ ok: true, label, filename });
    } catch (error) {
        logger.error({ error: error.message }, 'File map failed');
        res.status(500).json({ error: error.message });
    }
});

// Signed URL endpoint (PROMPT L)
app.get('/signed-url', async (req, res) => {
    try {
        const { filename } = req.query;
        if (!filename) {
            return res.status(400).json({ error: 'filename is required' });
        }

        const fname = Array.isArray(filename) ? filename[0] : filename;

        // Check if it's a mapped label first
        const actualFilename = fileMappings.get(fname) || fname;

        const file = bucket.file(actualFilename);
        const [signedUrl] = await file.getSignedUrl({
            version: 'v4',
            action: 'read',
            expires: Date.now() + 15 * 60 * 1000, // 15 minutes
        });

        res.json({ signed_url: signedUrl });
    } catch (error) {
        logger.error({ error: error.message }, 'Signed URL failed');
        // Fallback to public URL if signed URL fails
        try {
            const fname = Array.isArray(req.query.filename) ? req.query.filename[0] : req.query.filename;
            const actualFilename = fileMappings.get(fname) || fname;
            const publicUrl = `https://storage.googleapis.com/${config.bucket}/${actualFilename}`;
            res.json({ signed_url: publicUrl });
        } catch (fallbackError) {
            res.status(500).json({ error: error.message });
        }
    }
});

// Run workflow
app.post('/api/workflow', async (req, res) => {
    try {
        const { sessionId, prompt } = req.body;

        if (!prompt) {
            return res.status(400).json({ error: 'Prompt is required' });
        }

        const id = sessionId || `session_${Date.now()}`;

        logger.info({ sessionId: id, prompt }, 'Starting workflow');

        const orchestrator = new Orchestrator(id);
        await orchestrator.initialize();

        try {
            const result = await orchestrator.run(prompt);
            res.json({ sessionId: id, result });
        } finally {
            await orchestrator.cleanup();
        }
    } catch (error) {
        logger.error({ error: error.message }, 'Workflow failed');
        res.status(500).json({ error: error.message });
    }
});

// Get session
app.get('/api/session/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const session = await getSession(id);

        if (!session) {
            return res.status(404).json({ error: 'Session not found' });
        }

        res.json({ sessionId: id, ...session });
    } catch (error) {
        logger.error({ error: error.message }, 'Failed to get session');
        res.status(500).json({ error: error.message });
    }
});

// Error handler
app.use((err, req, res, next) => {
    logger.error({ error: err.message, stack: err.stack }, 'Unhandled error');
    res.status(500).json({ error: 'Internal server error' });
});

// Graceful shutdown
process.on('SIGTERM', async () => {
    logger.info('SIGTERM received, shutting down...');
    await closeBrowser();
    process.exit(0);
});

process.on('SIGINT', async () => {
    logger.info('SIGINT received, shutting down...');
    await closeBrowser();
    process.exit(0);
});

// Start server
const port = config.port;
app.listen(port, () => {
    logger.info({ port }, 'Server started');
});
