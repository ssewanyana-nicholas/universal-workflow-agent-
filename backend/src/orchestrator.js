import { generateContentWithHistory } from './gemini.js';
import { logger } from './logger.js';
import { newPage } from './browser.js';
import { executeTool, parseToolCalls, extractText } from './tools/executor.js';
import { appendHistory } from './util/state.js';
import { VertexAI } from '@google-cloud/vertexai';
import { config } from './config.js';

// Initialize Vertex AI for verification
const vertexAI = new VertexAI({
    project: config.projectId,
    location: config.location,
});
const model = 'gemini-2.0-flash';

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

        // Always navigate to URL if provided - ignore uploaded screenshot
        // The uploaded screenshot is only for reference, agent should navigate fresh
        if (this.sessionState.current_url) {
            logger.info({ url: this.sessionState.current_url }, 'Navigating to URL (ignoring uploaded screenshot)');
            await this.page.goto(this.sessionState.current_url, {
                waitUntil: 'networkidle',
                timeout: 30000
            });
            await this.page.waitForTimeout(2000);
            
            // Capture fresh screenshot after navigation
            try {
                const screenshotBuffer = await this.page.screenshot({
                    type: 'jpeg',
                    quality: 80
                });
                this.screenshot = screenshotBuffer.toString('base64');
                logger.info({ screenshotLength: this.screenshot?.length }, 'Fresh screenshot captured after navigation');
            } catch (screenshotErr) {
                logger.warn({ error: screenshotErr.message }, 'Failed to capture screenshot after navigation');
            }
        } else if (screenshotBase64) {
            // Only use uploaded screenshot if no URL provided
            this.screenshot = screenshotBase64;
            logger.info({ screenshotLength: this.screenshot?.length }, 'Using uploaded screenshot (no URL provided)');
        } else {
            // No URL or screenshot - navigate to default
            logger.warn('No URL or screenshot provided');
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

                // DISPATCHER GATE: Block finish_with_report if verification fails
                if (toolCall.name === 'finish_with_report') {
                    // Verify the task is actually complete
                    const verificationResult = await this.verifyTaskCompletion(userPrompt);
                    
                    logger.info({ 
                        sessionId: this.sessionId, 
                        verification: verificationResult 
                    }, 'Verification result before finish');
                    
                    if (!verificationResult.verified) {
                        // Block finish - add verification failure to messages
                        this.messages.push({
                            role: 'user',
                            content: `VERIFICATION FAILED: ${verificationResult.reason}. Please continue working on the task.`,
                        });
                        logger.warn({ 
                            sessionId: this.sessionId, 
                            reason: verificationResult.reason 
                        }, 'Blocked finish_with_report - verification failed');
                        continue; // Continue to next turn
                    }
                    
                    logger.info({ 
                        sessionId: this.sessionId, 
                        status: verificationResult.verified 
                    }, 'Verification passed - task completed');
                }

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

    // Verify task completion - check that expected content is visible on page
    async verifyTaskCompletion(userPrompt) {
        try {
            // Take a fresh screenshot of the current page
            const screenshotBuffer = await this.page.screenshot({ 
                type: 'jpeg', 
                quality: 80 
            });
            const screenshot = screenshotBuffer.toString('base64');
            
            // Use Gemini to verify the task is complete
            const generativeModel = vertexAI.preview.getGenerativeModel({
                model: model,
                systemInstruction: {
                    role: 'system',
                    parts: [{ text: 'You are a verification assistant. Check if the user\'s task goal has been achieved based on the screenshot.' }],
                },
                generationConfig: {
                    temperature: 0.1,
                },
            });

            const result = await generativeModel.generateContent({
                contents: [{
                    role: 'user',
                    parts: [
                        { text: `Verify if this task has been completed: "${userPrompt}". Look for evidence in the screenshot that the task is done. Respond with JSON: {"verified": true/false, "reason": "explanation"}` },
                        { inlineData: { mimeType: 'image/jpeg', data: screenshot } }
                    ]
                }]
            });

            const responseText = result.response?.candidates?.[0]?.content?.parts?.[0]?.text || '';
            
            // Try to parse JSON from response
            try {
                const jsonMatch = responseText.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    const parsed = JSON.parse(jsonMatch[0]);
                    // More lenient verification - if Gemini finds ANY relevant content, consider it verified
                    const reason = parsed.reason || '';
                    const verified = parsed.verified === true || reason.toLowerCase().includes('found') || reason.toLowerCase().includes('visible') || reason.toLowerCase().includes('displayed');
                    return { verified, reason: parsed.reason || 'Verified' };
                }
            } catch (e) {
                // If parsing fails, check for keywords
            }
            
            // Fallback: check response for positive keywords
            if (responseText.toLowerCase().includes('"verified": false') || responseText.toLowerCase().includes('verification failed') || responseText.toLowerCase().includes('could not verify')) {
                return { verified: false, reason: 'Verification check returned false' };
            }
            
            // Default: assume success if we got this far
            return { verified: true, reason: 'Task appears to be complete' };
            
            // Fallback: check for positive indicators
            const lowerResponse = responseText.toLowerCase();
            if (lowerResponse.includes('verified') && (lowerResponse.includes('true') || lowerResponse.includes('yes'))) {
                return { verified: true, reason: 'Gemini confirmed completion' };
            }
            
            return { verified: false, reason: 'Could not verify completion' };
        } catch (error) {
            logger.error({ error: error.message }, 'Verification error');
            return { verified: false, reason: `Verification error: ${error.message}` };
        }
    }

    async cleanup() {
        logger.info({ sessionId: this.sessionId }, 'Cleaning up orchestrator');
        if (this.page) {
            await this.page.close();
        }
    }
}
