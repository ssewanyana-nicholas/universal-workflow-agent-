/**
 * UI Navigator Agent using ADK-like Pattern
 * 
 * This module implements an agent using Gemini for multimodal understanding
 * with tool execution, following the ADK pattern.
 * 
 * Features:
 * - Gemini 2.0 Flash for vision and reasoning
 * - Tool-based action execution (click, type, scroll, etc.)
 * - Multi-step workflow execution
 * - Google Cloud integration
 */

import { VertexAI } from '@google-cloud/vertexai';
import { config } from './config.js';
import { logger } from './logger.js';
import { newPage, launchBrowser } from './browser.js';

// Initialize Vertex AI
const vertex_ai = new VertexAI({ 
    project: config.GOOGLE_CLOUD_PROJECT, 
    location: config.GCP_LOCATION 
});
const model = 'gemini-2.0-flash';

/**
 * Browser tools definition following ADK tool pattern
 */
const BROWSER_TOOLS = [
    {
        name: 'open_url',
        description: 'Navigate to a specific URL in the browser',
        parameters: {
            type: 'object',
            properties: {
                url: { type: 'string', description: 'The URL to navigate to' }
            },
            required: ['url']
        }
    },
    {
        name: 'click',
        description: 'Click at specific normalized coordinates (0-1) on the page',
        parameters: {
            type: 'object',
            properties: {
                x: { type: 'number', description: 'X coordinate (0-1)' },
                y: { type: 'number', description: 'Y coordinate (0-1)' }
            },
            required: ['x', 'y']
        }
    },
    {
        name: 'type_text',
        description: 'Type text into an element or at current cursor position',
        parameters: {
            type: 'object',
            properties: {
                text: { type: 'string', description: 'Text to type' },
                x: { type: 'number', description: 'Optional X coordinate (0-1)' },
                y: { type: 'number', description: 'Optional Y coordinate (0-1)' }
            },
            required: ['text']
        }
    },
    {
        name: 'scroll',
        description: 'Scroll the page by normalized amounts',
        parameters: {
            type: 'object',
            properties: {
                dx: { type: 'number', description: 'Horizontal scroll (0-1)' },
                dy: { type: 'number', description: 'Vertical scroll (0-1)' }
            },
            required: ['dy']
        }
    },
    {
        name: 'wait',
        description: 'Wait for a specified number of milliseconds',
        parameters: {
            type: 'object',
            properties: {
                ms: { type: 'number', description: 'Milliseconds to wait (max 10000)' }
            },
            required: ['ms']
        }
    },
    {
        name: 'press_key',
        description: 'Press a keyboard key',
        parameters: {
            type: 'object',
            properties: {
                key: { type: 'string', description: 'Key to press (Enter, Escape, Tab, etc.)' }
            },
            required: ['key']
        }
    },
    {
        name: 'get_url',
        description: 'Get the current page URL and title',
        parameters: {
            type: 'object',
            properties: {},
            required: []
        }
    }
];

/**
 * System prompt for the ADK agent
 */
const SYSTEM_PROMPT = `You are UI Navigator, an expert web automation agent powered by Gemini Vision.

CORE CAPABILITIES:
- Analyze screenshots to understand page state
- Detect UI elements (buttons, forms, menus, etc.)
- Execute actions to complete user goals

AVAILABLE TOOLS:
${BROWSER_TOOLS.map(t => `- ${t.name}: ${t.description}`).join('\n')}

COORDINATE SYSTEM:
- All coordinates are NORMALIZED (0-1 range)
- (0, 0) = top-left corner
- (1, 1) = bottom-right corner  
- (0.5, 0.5) = center of page

WORKFLOW:
1. Analyze the provided screenshot
2. Identify the element to interact with
3. Execute the appropriate tool
4. Wait for page to update
5. Analyze new screenshot
6. Repeat until goal is complete

IMPORTANT:
- Always provide normalized coordinates (0-1)
- After each action, explain what you're doing
- If stuck, try scrolling or waiting for page to load
- When goal is complete, summarize what was accomplished`;

/**
 * ADK-style Agent class
 */
export class ADKAgent {
    constructor(sessionId, sessionState = {}) {
        this.sessionId = sessionId;
        this.sessionState = sessionState;
        this.page = null;
        this.viewport = sessionState.viewport_size || { width: 1280, height: 720 };
        this.maxSteps = parseInt(process.env.MAX_STEPS) || 20;
        this.maxTime = parseInt(process.env.MAX_MS) || 120000;
    }

    /**
     * Initialize browser and page
     */
    async initialize() {
        logger.info({ sessionId: this.sessionId }, 'Initializing ADK agent');
        
        // Launch browser (headed mode for local, headless for cloud)
        await launchBrowser();
        
        // Create new page
        this.page = await newPage(this.viewport);
        
        // Navigate to URL if provided
        if (this.sessionState.current_url) {
            logger.info({ url: this.sessionState.current_url }, 'Navigating to URL');
            await this.page.goto(this.sessionState.current_url, { 
                waitUntil: 'networkidle',
                timeout: 30000
            });
            await this.page.waitForTimeout(2000);
        }
        
        logger.info({ sessionId: this.sessionId }, 'ADK agent initialized');
    }

    /**
     * Execute a tool action
     */
    async executeTool(toolName, params) {
        logger.info({ tool: toolName, params }, 'Executing tool');
        
        try {
            switch (toolName) {
                case 'open_url': {
                    await this.page.goto(params.url, { 
                        waitUntil: 'networkidle',
                        timeout: 30000 
                    });
                    await this.page.waitForTimeout(2000);
                    const title = await this.page.title();
                    return { ok: true, action: 'open_url', url: params.url, title };
                }
                
                case 'click': {
                    const x = params.x * this.viewport.width;
                    const y = params.y * this.viewport.height;
                    await this.page.mouse.click(x, y);
                    await this.page.waitForTimeout(500);
                    return { ok: true, action: 'click', x: params.x, y: params.y };
                }
                
                case 'type_text': {
                    if (params.x !== undefined && params.y !== undefined) {
                        const x = params.x * this.viewport.width;
                        const y = params.y * this.viewport.height;
                        await this.page.mouse.click(x, y);
                        await this.page.waitForTimeout(300);
                    }
                    await this.page.keyboard.type(params.text, { delay: 50 });
                    return { ok: true, action: 'type_text', text: params.text.substring(0, 50) };
                }
                
                case 'scroll': {
                    const dx = (params.dx || 0) * this.viewport.width;
                    const dy = params.dy * this.viewport.height;
                    await this.page.mouse.wheel(dx, dy);
                    await this.page.waitForTimeout(500);
                    return { ok: true, action: 'scroll', dx: params.dx, dy: params.dy };
                }
                
                case 'wait': {
                    const ms = Math.min(params.ms, 10000);
                    await this.page.waitForTimeout(ms);
                    return { ok: true, action: 'wait', ms };
                }
                
                case 'press_key': {
                    await this.page.keyboard.press(params.key);
                    await this.page.waitForTimeout(300);
                    return { ok: true, action: 'press_key', key: params.key };
                }
                
                case 'get_url': {
                    const url = await this.page.url();
                    const title = await this.page.title();
                    return { ok: true, action: 'get_url', url, title };
                }
                
                default:
                    return { ok: false, error: `Unknown tool: ${toolName}` };
            }
        } catch (error) {
            logger.error({ tool: toolName, error: error.message }, 'Tool execution error');
            return { ok: false, error: error.message };
        }
    }

    /**
     * Capture screenshot
     */
    async captureScreenshot() {
        try {
            const screenshotBuffer = await this.page.screenshot({ 
                type: 'jpeg', 
                quality: 80 
            });
            return screenshotBuffer.toString('base64');
        } catch (error) {
            logger.error({ error: error.message }, 'Screenshot capture error');
            return null;
        }
    }

    /**
     * Analyze screenshot with Gemini
     */
    async analyzeWithGemini(screenshot, userPrompt) {
        try {
            const generativeModel = vertex_ai.preview.getGenerativeModel({
                model: model,
                systemInstruction: {
                    role: 'system',
                    parts: [{ text: SYSTEM_PROMPT }]
                }
            });

            const result = await generativeModel.generateContent({
                contents: [{
                    role: 'user',
                    parts: [
                        { text: userPrompt },
                        {
                            inlineData: {
                                mimeType: 'image/jpeg',
                                data: screenshot
                            }
                        }
                    ]
                }],
                tools: [{
                    functionDeclarations: BROWSER_TOOLS.map(tool => ({
                        name: tool.name,
                        description: tool.description,
                        parameters: tool.parameters
                    }))
                }],
                toolConfig: {
                    functionCallingConfig: {
                        mode: 'ANY',
                        allowedFunctionNames: BROWSER_TOOLS.map(t => t.name)
                    }
                }
            });

            return result.response;
        } catch (error) {
            logger.error({ error: error.message }, 'Gemini analysis error');
            throw error;
        }
    }

    /**
     * Run the agent with a user goal
     */
    async run(goal, initialScreenshot = null) {
        const startTime = Date.now();
        const steps = [];
        
        try {
            // Initialize if not already done
            if (!this.page) {
                await this.initialize();
            }

            // Use provided screenshot or capture new one
            let currentScreenshot = initialScreenshot;
            if (!currentScreenshot) {
                currentScreenshot = await this.captureScreenshot();
            }

            logger.info({ sessionId: this.sessionId, goal }, 'Starting ADK agent run');

            // Main agent loop
            for (let step = 0; step < this.maxSteps; step++) {
                // Check timeout
                if (Date.now() - startTime > this.maxTime) {
                    logger.warn({ sessionId: this.sessionId }, 'Timeout reached');
                    break;
                }

                // Analyze with Gemini
                const prompt = `Goal: ${goal}

Current step: ${step + 1}/${this.maxSteps}

Analyze the screenshot and decide what action to take. Use a tool to interact with the page. If the goal is complete, say "DONE" and summarize what you accomplished.`;

                const response = await this.analyzeWithGemini(currentScreenshot, prompt);
                
                // Parse response for tool calls
                const responseText = response.candidates?.[0]?.content?.parts?.[0]?.text;
                const toolCalls = response.candidates?.[0]?.content?.parts?.[0]?.functionCall;
                
                if (!toolCalls && (!responseText || !responseText.includes('DONE'))) {
                    // No tool call and not done - just log the response
                    steps.push({
                        step: step + 1,
                        analysis: responseText || 'No response',
                        tool: null,
                        result: null
                    });
                    
                    // Try to continue with the response as guidance
                    if (responseText) {
                        logger.info({ step: step + 1, response: responseText.substring(0, 200) }, 'Agent response');
                    }
                }
                
                // Handle tool calls
                if (toolCalls) {
                    const toolName = toolCalls.name;
                    const toolParams = toolCalls.args || {};
                    
                    logger.info({ step: step + 1, tool: toolName, params: toolParams }, 'Executing tool');
                    
                    const result = await this.executeTool(toolName, toolParams);
                    
                    steps.push({
                        step: step + 1,
                        tool: toolName,
                        params: toolParams,
                        result: result
                    });

                    // Check if done
                    if (result.ok) {
                        // Capture new screenshot
                        currentScreenshot = await this.captureScreenshot();
                        
                        // Check if goal might be complete (check for completion indicators)
                        const completionCheck = await this.analyzeWithGemini(currentScreenshot, 
                            `Is the user's goal "${goal}" complete? Answer YES or NO with a brief explanation.`);
                        
                        const completionText = completionCheck?.candidates?.[0]?.content?.parts?.[0]?.text;
                        if (completionText && completionText.toUpperCase().includes('YES')) {
                            logger.info({ sessionId: this.sessionId }, 'Goal completed');
                            break;
                        }
                    }
                } else if (responseText && responseText.toUpperCase().includes('DONE')) {
                    // Agent says it's done
                    logger.info({ sessionId: this.sessionId, response: responseText }, 'Agent reported completion');
                    break;
                }
            }

            // Get final screenshot
            const finalScreenshot = await this.captureScreenshot();

            return {
                ok: true,
                goal: goal,
                steps: steps,
                screenshot: finalScreenshot,
                sessionId: this.sessionId,
                duration: Date.now() - startTime
            };

        } catch (error) {
            logger.error({ error: error.message }, 'ADK agent error');
            return {
                ok: false,
                error: error.message,
                steps: steps,
                sessionId: this.sessionId
            };
        }
    }

    /**
     * Clean up resources
     */
    async cleanup() {
        if (this.page) {
            try {
                await this.page.close();
            } catch (e) {
                // Ignore close errors
            }
            this.page = null;
        }
        logger.info({ sessionId: this.sessionId }, 'ADK agent cleaned up');
    }
}

export default ADKAgent;
