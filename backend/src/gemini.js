/**
 * Gemini integration for UI Navigator
 * Uses Gemini 2.0 Flash for multimodal vision and action planning
 */

import { VertexAI } from '@google-cloud/vertexai';
import { config } from './config.js';
import { logger } from './logger.js';

const vertexAI = new VertexAI({
    project: config.projectId,
    location: config.location,
});

const model = 'gemini-2.0-flash';

// System instruction for the model - outputs deterministic JSON
const systemInstruction = `You are an expert web automation agent that controls a browser to complete user tasks efficiently.

## OUTPUT FORMAT
You MUST output a JSON object with the following structure:

{
  "elements": [
    {
      "id": "element_identifier",
      "role": "button|input|link|text|...",
      "text": "visible text",
      "bbox": [x, y, width, height],
      "confidence": 0.0-1.0
    }
  ],
  "plan": [
    {"action": "click", "x": 1200, "y": 300},
    {"action": "wait", "ms": 300},
    {"action": "type_text", "text": "hello"}
  ],
  "meta": {
    "reason": "Brief explanation of what you're doing",
    "confidence": 0.0-1.0
  }
}

## YOUR MISSION
Complete the user's task with the MINIMUM number of actions needed.

## TOOLS
1. open_url(url): Navigate to a URL
2. click(x, y): Click at pixel coordinates (e.g., x: 1200, y: 300)
3. type_text(text): Type text
4. scroll(dx, dy): Scroll in pixels
5. wait(ms): Wait milliseconds
6. key_press(key): Press keyboard key
7. finish_with_report: Call when task is complete or blocked

## COORDINATES
Use pixel coordinates based on typical viewport 1920x1080. (0,0) is top-left.

## IMPORTANT
- Output ONLY valid JSON, nothing else
- Include elements found on the page
- Provide confidence scores
- Explain your reasoning in meta.reason`;

export const functionDeclarations = [
    {
        name: 'find_element',
        description: 'Find elements matching a CSS query. Returns pixel coordinates for each element found.',
        parameters: {
            type: 'object',
            properties: {
                query: { type: 'string', description: 'CSS selector query' },
                hints: { type: 'string', description: 'Optional hints about the element' },
                top_k: { type: 'number', description: 'Maximum number of elements to return (default: 5)' },
            },
            required: ['query'],
        },
    },
    {
        name: 'click',
        description: 'Click at pixel coordinates',
        parameters: {
            type: 'object',
            properties: {
                x: { type: 'number', description: 'Pixel X coordinate' },
                y: { type: 'number', description: 'Pixel Y coordinate' },
            },
            required: ['x', 'y'],
        },
    },
    {
        name: 'double_click',
        description: 'Double-click at pixel coordinates',
        parameters: {
            type: 'object',
            properties: {
                x: { type: 'number', description: 'Pixel X coordinate' },
                y: { type: 'number', description: 'Pixel Y coordinate' },
            },
            required: ['x', 'y'],
        },
    },
    {
        name: 'type_text',
        description: 'Type text into an element or at current cursor position',
        parameters: {
            type: 'object',
            properties: {
                text: { type: 'string', description: 'Text to type' },
                submit: { type: 'boolean', description: 'Whether to press Enter after typing' },
            },
            required: ['text'],
        },
    },
    {
        name: 'key_press',
        description: 'Press a keyboard key',
        parameters: {
            type: 'object',
            properties: {
                keys: { type: 'string', description: 'Key to press (e.g., "Enter", "Escape", "Tab", "ArrowDown")' },
            },
            required: ['keys'],
        },
    },
    {
        name: 'open_url',
        description: 'Navigate directly to a URL',
        parameters: {
            type: 'object',
            properties: {
                url: { type: 'string', description: 'Full URL to navigate to' },
            },
            required: ['url'],
        },
    },
    {
        name: 'scroll',
        description: 'Scroll the page',
        parameters: {
            type: 'object',
            properties: {
                dx: { type: 'number', description: 'Horizontal scroll in pixels' },
                dy: { type: 'number', description: 'Vertical scroll in pixels' },
            },
            required: ['dy'],
        },
    },
    {
        name: 'wait',
        description: 'Wait for a specified time',
        parameters: {
            type: 'object',
            properties: {
                ms: { type: 'number', description: 'Milliseconds to wait (max 10000)' },
            },
            required: ['ms'],
        },
    },
    {
        name: 'finish_with_report',
        description: 'Finish the task and report results',
        parameters: {
            type: 'object',
            properties: {
                status: { type: 'string', description: 'Status: "success", "blocked", or "error"' },
                summary: { type: 'string', description: 'Summary of what was accomplished' },
            },
            required: ['status', 'summary'],
        },
    },
    {
        name: 'take_screenshot',
        description: 'Take a screenshot of the current page',
        parameters: {
            type: 'object',
            properties: {},
        },
    },
    {
        name: 'verify_element',
        description: 'Verify an element exists or meets criteria',
        parameters: {
            type: 'object',
            properties: {
                description: { type: 'string', description: 'Description of what to verify' },
            },
            required: ['description'],
        },
    },
];

/**
 * Generate content with Gemini, maintaining conversation history
 */
export async function generateContentWithHistory(messages, screenshot = null) {
    try {
        const generativeModel = vertexAI.preview.getGenerativeModel({
            model: model,
            systemInstruction: {
                role: 'system',
                parts: [{ text: systemInstruction }],
            },
            generationConfig: {
                temperature: 0.1, // Low temperature for deterministic output
                topP: 0.8,
                topK: 40,
                maxOutputTokens: 2048,
            },
        });

        // Build contents from messages
        const contents = [];
        
        for (const msg of messages) {
            if (msg.role === 'user' && msg.screenshot) {
                // User message with screenshot
                contents.push({
                    role: 'user',
                    parts: [
                        { text: msg.content },
                        {
                            inlineData: {
                                mimeType: 'image/jpeg',
                                data: msg.screenshot,
                            },
                        },
                    ],
                });
            } else {
                contents.push({
                    role: msg.role,
                    parts: [{ text: msg.content }],
                });
            }
        }

        // Make the request with function calling
        const result = await generativeModel.generateContent({
            contents,
            tools: [
                {
                    functionDeclarations,
                },
            ],
        });

        const response = result.response;
        return response;
    } catch (error) {
        logger.error({ error: error.message }, 'Gemini generateContent error');
        throw error;
    }
}

/**
 * Simple generate content without history
 */
export async function generateContent(prompt, screenshot = null) {
    try {
        const generativeModel = vertexAI.preview.getGenerativeModel({
            model: model,
            systemInstruction: {
                role: 'system',
                parts: [{ text: systemInstruction }],
            },
            generationConfig: {
                temperature: 0.1,
                topP: 0.8,
                topK: 40,
                maxOutputTokens: 2048,
            },
        });

        const parts = [{ text: prompt }];
        
        if (screenshot) {
            parts.push({
                inlineData: {
                    mimeType: 'image/jpeg',
                    data: screenshot,
                },
            });
        }

        const result = await generativeModel.generateContent({
            contents: [{
                role: 'user',
                parts,
            }],
            tools: [
                {
                    functionDeclarations,
                },
            ],
        });

        return result.response;
    } catch (error) {
        logger.error({ error: error.message }, 'Gemini generateContent error');
        throw error;
    }
}

export default {
    generateContentWithHistory,
    generateContent,
    functionDeclarations,
};
