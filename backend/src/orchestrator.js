import { generateContentWithHistory } from './gemini.js';
import { logger } from './logger.js';
import { newPage } from './browser.js';
import { executeTool, parseToolCalls, extractText } from './tools/executor.js';
import { appendHistory } from './util/state.js';

// PROMPT O: Reliability - timeouts and retries
const TOOL_TIMEOUT_MS = parseInt(process.env.TOOL_TIMEOUT_MS || '25000');
const MAX_RETRIES = parseInt(process.env.MAX_RETRIES || '2');
const IDEMPOTENT_TOOLS = ['scroll', 'find_element', 'verify_element', 'take_screenshot'];

export class Orchestrator {
    constructor(sessionId, sessionState = {}) {
        this.sessionId = sessionId;
        // Preserve all sessionState fields including current_url and viewport_size
        this.sessionState = {
            ...sessionState,
            domain_whitelist: sessionState.domain_whitelist || [],
            safe_mode: sessionState.safe_mode ?? true,
            demo_mode: sessionState.demo_mode ?? true,
        };
        this.messages = [];
        this.maxTurns = parseInt(process.env.MAX_STEPS || '20');
        this.currentTurn = 0;
        this.page = null;
        this.screenshot = null; // Store screenshot for Gemini
    }

    // Execute tool with timeout and retries (PROMPT O)
    async executeWithRetry(toolCall, page) {
        let lastError = null;

        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
            try {
                // Execute with timeout
                const result = await Promise.race([
                    executeTool(toolCall, this.sessionId, page),
                    new Promise((_, reject) =>
                        setTimeout(() => reject(new Error('Tool execution timeout')), TOOL_TIMEOUT_MS)
                    )
                ]);

                // If successful, return immediately
                if (result.ok) {
                    return result;
                }

                // Categorize the error for smart recovery
                const errorCategory = this.categorizeError(result.error);
                logger.info({ tool: toolCall.name, errorCategory, attempt }, 'Tool failed, categorizing error');

                // Handle specific error types
                if (errorCategory === 'NOT_FOUND') {
                    // Element not found - try different approach
                    logger.info({ tool: toolCall.name }, 'Element not found, will try alternative');
                } else if (errorCategory === 'TIMEOUT') {
                    // Page slow - wait and retry
                    await this.page.waitForTimeout(2000);
                } else if (errorCategory === 'NAVIGATION') {
                    // Navigation error - might need to reload
                    logger.warn({ tool: toolCall.name }, 'Navigation issue');
                }

                // If idempotent tool and not last attempt, retry
                if (!IDEMPOTENT_TOOLS.includes(toolCall.name) || attempt >= MAX_RETRIES) {
                    return result;
                }

                // Small backoff before retry
                await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
                lastError = result;
            } catch (error) {
                logger.error({
                    tool: toolCall.name,
                    attempt: attempt + 1,
                    error: error.message
                }, 'Tool execution error');

                lastError = { ok: false, error: error.message };

                if (attempt < MAX_RETRIES) {
                    await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
                }
            }
        }

        return lastError;
    }

    // Categorize errors for smart recovery
    categorizeError(errorMsg) {
        if (!errorMsg) return 'UNKNOWN';
        const msg = errorMsg.toLowerCase();

        if (msg.includes('not found') || msg.includes('no element') || msg.includes('null')) {
            return 'NOT_FOUND';
        }
        if (msg.includes('timeout') || msg.includes('timed out')) {
            return 'TIMEOUT';
        }
        if (msg.includes('navigation') || msg.includes('net::') || msg.includes('failed to load')) {
            return 'NAVIGATION';
        }
        if (msg.includes('permission') || msg.includes('denied') || msg.includes('unauthorized')) {
            return 'PERMISSION';
        }
        if (msg.includes('login') || msg.includes('auth') || msg.includes('credential')) {
            return 'AUTH';
        }

        return 'UNKNOWN';
    }

    // Try alternative approach when primary fails
    async tryAlternativeApproach(toolCall, originalResult) {
        logger.info({ tool: toolCall.name, args: toolCall.args }, 'Trying alternative approach');

        const errorCategory = this.categorizeError(originalResult?.error);

        if (toolCall.name === 'find_element' && errorCategory === 'NOT_FOUND') {
            // Try with broader search or scroll first
            if (toolCall.args?.query) {
                // Try scrolling down to reveal element
                await this.page.evaluate(() => window.scrollBy(0, 300));
                await this.page.waitForTimeout(500);

                // Retry with same query
                return await executeTool(toolCall, this.sessionId, this.page);
            }
        }

        // Return original result if no alternative available
        return originalResult;
    }

    async initialize(screenshotBase64 = null) {
        logger.info({ sessionId: this.sessionId, sessionState: this.sessionState }, 'Initializing orchestrator');

        // Get viewport from sessionState
        const viewport = this.sessionState.viewport_size || { width: 1280, height: 720 };
        this.page = await newPage(viewport);

        // Navigate to the URL from sessionState if provided
        if (this.sessionState.current_url) {
            logger.info({ url: this.sessionState.current_url }, 'Navigating to URL');
            await this.page.goto(this.sessionState.current_url, {
                waitUntil: 'networkidle',
                timeout: 30000
            });
            // Wait for page to stabilize
            await this.page.waitForTimeout(2000);
        } else {
            logger.warn({ sessionState: this.sessionState }, 'No current_url in sessionState - will start with blank page');
        }

        // PRIORITIZE: Use uploaded screenshot if provided, otherwise capture our own
        if (screenshotBase64) {
            // Use the user-provided screenshot
            this.screenshot = screenshotBase64;
            logger.info({ screenshotLength: this.screenshot?.length }, 'Using uploaded screenshot');
        } else {
            // Capture our own screenshot after navigation (JPEG for smaller size)
            try {
                // First check if page has any content
                const title = await this.page.title().catch(() => 'unknown');
                const url = await this.page.url().catch(() => 'unknown');
                logger.info({ url, title }, 'Page state before screenshot');

                const screenshotBuffer = await this.page.screenshot({
                    type: 'jpeg',
                    quality: 80,  // Higher quality for better readability
                    fullPage: false
                });
                this.screenshot = screenshotBuffer.toString('base64');
                logger.info({ screenshotLength: this.screenshot?.length }, 'Initial screenshot captured');

                // Verify screenshot has content
                if (this.screenshot && this.screenshot.length > 1000) {
                    logger.info('Screenshot has content');
                } else {
                    logger.warn({ length: this.screenshot?.length }, 'Screenshot might be empty or too small');
                }
            } catch (screenshotErr) {
                logger.error({ error: screenshotErr.message }, 'Failed to capture initial screenshot');
            }
        }
    }

    // Run a single step (PROMPT K)
    async runStep(userPrompt, screenshotBase64 = null) {
        const stepStartTime = Date.now();
        this.currentTurn++;

        // Add user prompt on first turn
        if (this.messages.length === 0) {
            this.messages.push({
                role: 'user',
                content: userPrompt,
            });
        }

        logger.info({ turn: this.currentTurn, sessionId: this.sessionId }, 'Processing step');

        // Generate content - only one tool per turn
        const response = await generateContentWithHistory(this.messages, this.screenshot);

        // Extract text response
        const text = extractText(response);
        if (text) {
            this.messages.push({ role: 'model', content: text });
        }

        // Parse and execute tool calls - take only the first one
        const toolCalls = parseToolCalls(response);

        // Include screenshot with result for next turn's context
        let screenshotForNextTurn = null;
        if (this.screenshot) {
            screenshotForNextTurn = this.screenshot;
        }

        if (toolCalls.length > 0) {
            // One tool per turn - take first one
            const toolCall = toolCalls[0];

            logger.info({ tool: toolCall.name, args: toolCall.args, sessionId: this.sessionId }, 'Executing tool');

            // PROMPT O: Use retry logic
            const result = await this.executeWithRetry(toolCall, this.page);

            // Take screenshot after tool execution to show in frontend
            let backendScreenshot = null;
            try {
                // Use JPEG with higher quality for better readability
                const screenshotBuffer = await this.page.screenshot({
                    type: 'jpeg',
                    quality: 80  // Higher quality
                });
                backendScreenshot = screenshotBuffer.toString('base64');
                logger.info({ screenshotLength: backendScreenshot?.length }, 'Screenshot captured');
            } catch (screenshotErr) {
                logger.warn({ error: screenshotErr.message }, 'Failed to take screenshot');
            }

            // Update this.screenshot for next turn's Gemini context
            if (backendScreenshot) {
                this.screenshot = backendScreenshot;
            }

            // Add tool result to messages - include full result for frontend overlay (PROMPT M)
            const toolResultStr = JSON.stringify(result);
            this.messages.push({
                role: 'user',
                content: `Result of ${toolCall.name}: ${toolResultStr}`,
            });

            // Build step response with metadata for frontend
            // Include initial screenshot if this is the first step and no tool screenshot available
            const stepScreenshot = backendScreenshot || (this.currentTurn === 1 ? this.screenshot : null);

            const step = {
                stepId: this.currentTurn,
                tool: toolCall.name,
                args: toolCall.args,
                ok: result.ok ?? true,
                latency_ms: Date.now() - stepStartTime,
                screenshot_filename: result.screenshot_filename || null,
                backendScreenshot: stepScreenshot, // Screenshot after tool execution
                screenshot: stepScreenshot, // Also include as 'screenshot' for easier access
                result: result, // Include full result for overlay metadata (PROMPT M)
            };

            // Debug: log screenshot in step
            logger.info({
                stepId: step.stepId,
                hasScreenshot: !!backendScreenshot,
                screenshotLength: backendScreenshot?.length
            }, 'Step with screenshot');

            // Save to history (optional - won't fail if Firestore not configured)
            try {
                await appendHistory(this.sessionId, step);
            } catch (historyErr) {
                logger.warn({ error: historyErr.message }, 'Failed to save history');
            }

            return step;
        } else {
            // No tool calls - return a placeholder step
            // Include screenshot for this case too
            const step = {
                stepId: this.currentTurn,
                tool: 'noop',
                args: { text: text?.substring(0, 100) },
                ok: false,
                latency_ms: Date.now() - stepStartTime,
                screenshot: this.screenshot, // Include current screenshot
                backendScreenshot: this.screenshot,
                result: { text, ok: false, error: 'No tool called' },
            };
            return step;
        }
    }

    async run(userPrompt) {
        logger.info({ sessionId: this.sessionId, prompt: userPrompt }, 'Starting orchestration');

        // Add user prompt
        this.messages.push({
            role: 'user',
            content: userPrompt,
        });

        while (this.currentTurn < this.maxTurns) {
            this.currentTurn++;
            logger.info({ turn: this.currentTurn, sessionId: this.sessionId }, 'Processing turn');

            // Generate content - only one tool per turn
            const response = await generateContentWithHistory(this.messages, this.screenshot);

            // Extract text response
            const text = extractText(response);
            if (text) {
                this.messages.push({ role: 'model', content: text });
            }

            // Parse and execute tool calls - take only the first one
            const toolCalls = parseToolCalls(response);

            if (toolCalls.length > 0) {
                // One tool per turn - take first one
                const toolCall = toolCalls[0];

                logger.info({ tool: toolCall.name, args: toolCall.args, sessionId: this.sessionId }, 'Executing tool');

                const result = await executeTool(toolCall, this.sessionId, this.page);

                // Add tool result to messages
                const toolResultStr = JSON.stringify(result);
                this.messages.push({
                    role: 'user',
                    content: `Result of ${toolCall.name}: ${toolResultStr}`,
                });

                // Check if task is complete
                if (toolCall.name === 'finish_with_report') {
                    logger.info({ sessionId: this.sessionId, status: result.status }, 'Task completed');
                    break;
                }
            } else {
                // No tool calls - check if task is complete via text
                if (text.includes('TASK_COMPLETE') || text.includes('finish_with_report')) {
                    logger.info({ sessionId: this.sessionId }, 'Task completed via text');
                    break;
                }

                // If no tools and no completion, continue the conversation
                logger.debug({ text: text.substring(0, 100) }, 'No tool calls in response');
            }
        }

        const finalResponse = this.messages[this.messages.length - 1].content;
        return finalResponse;
    }

    async cleanup() {
        logger.info({ sessionId: this.sessionId }, 'Cleaning up orchestrator');
        if (this.page) {
            await this.page.close();
        }
    }
}
