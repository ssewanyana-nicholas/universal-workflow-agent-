import { VertexAI } from '@google-cloud/vertexai';
import { config } from './config.js';
import { logger } from './logger.js';
import { saveBase64Image } from './util/storage.js';

const vertexAI = new VertexAI({
  project: config.projectId,
  location: config.location,
});

const model = 'gemini-2.0-flash';

/**
 * Locate elements in a screenshot using Gemini vision
 * This is the core of the visual UI understanding capability
 */
export async function locateElements({ screenshotBase64, query, hints, top_k = 5 }) {
  logger.info({ query, hints, top_k }, 'Locating elements with vision (multimodal)');

  // Debug: log screenshot length
  logger.info({ screenshotLength: screenshotBase64?.length }, 'Screenshot data');

  if (!screenshotBase64 || screenshotBase64.length === 0) {
    logger.error('No screenshot data provided to locateElements');
    return [];
  }

  const generativeModel = vertexAI.preview.getGenerativeModel({
    model,
  });

  // Enhanced prompt for visual UI understanding
  const prompt = `You are a visual UI understanding assistant. Analyze this screenshot and find UI elements matching "${query}".

${hints ? `Additional hints: ${hints}` : ''}

Look for:
- Buttons, links, icons
- Input fields, text areas
- Menus, navigation elements
- Images, videos
- Any interactive or visible elements

Return a JSON array with found elements. Use this exact schema:
[
  {
    "x": 0.0-1.0,  // normalized center X coordinate (0 = left edge, 1 = right edge)
    "y": 0.0-1.0,  // normalized center Y coordinate (0 = top edge, 1 = bottom edge)
    "width": 0.0-1.0,  // normalized width of the element
    "height": 0.0-1.0, // normalized height of the element
    "score": 0.0-1.0,  // confidence score
    "label": "description of what this element is"
  }
]

If no elements match, return an empty array [].`;

  const result = await generativeModel.generateContent([
    { text: prompt },
    {
      inlineData: {
        mimeType: 'image/png',
        data: screenshotBase64,
      },
    },
  ]);

  const response = result.response;
  const text = response.text();

  // Parse JSON from response
  try {
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const elements = JSON.parse(jsonMatch[0]);
      logger.info({ elementsFound: elements.length }, 'Vision found elements');
      return elements.slice(0, top_k);
    }
    logger.warn({ response: text }, 'No JSON array found in vision response');
    return [];
  } catch (error) {
    logger.error({ error: error.message, response: text }, 'Failed to parse vision response');
    return [];
  }
}

/**
 * Verify an element exists in the screenshot
 */
export async function verifyTarget({ screenshotBase64, query, must_include_text, region }) {
  logger.info({ query, must_include_text, region }, 'Verifying element with vision');

  const generativeModel = vertexAI.preview.getGenerativeModel({
    model,
  });

  const prompt = `Verify if a UI element matching "${query}" exists in this screenshot.

${must_include_text ? `The element must contain this text: "${must_include_text}"` : ''}

${region ? `Focus on this region: ${region}` : ''}

Return a JSON object with this schema:
{
  "exists": true or false,
  "description": "description of the element if found",
  "x": 0.0-1.0,
  "y": 0.0-1.0,
  "text_found": "any text content visible near or in the element"
}`;

  const result = await generativeModel.generateContent([
    { text: prompt },
    {
      inlineData: {
        mimeType: 'image/png',
        data: screenshotBase64,
      },
    },
  ]);

  const response = result.response;
  const text = response.text();

  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return { exists: false };
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to parse verification response');
    return { exists: false, error: error.message };
  }
}

/**
 * Take screenshot and locate elements in one call
 * This is used by the find_element tool
 */
export async function findElementWithScreenshot({ page, query, hints, top_k = 5 }) {
  // Take screenshot
  const screenshotBuffer = await page.screenshot({ type: 'png' });
  const screenshotBase64 = screenshotBuffer.toString('base64');

  return locateElements({
    screenshotBase64,
    query,
    hints,
    top_k,
  });
}

/**
 * Verify element with current screenshot
 */
export async function verifyElementWithScreenshot({ page, query, must_include_text, region }) {
  // Take screenshot
  const screenshotBuffer = await page.screenshot({ type: 'png' });
  const screenshotBase64 = screenshotBuffer.toString('base64');

  return verifyTarget({
    screenshotBase64,
    query,
    must_include_text,
    region,
  });
}

/**
 * Analyze the entire screenshot for context
 * Used to understand the overall page state
 */
export async function analyzeScreenshot(screenshotBase64) {
  const generativeModel = vertexAI.preview.getGenerativeModel({
    model,
  });

  const prompt = `You are a visual UI understanding assistant. Describe what you see in this screenshot in detail.

Include:
1. What application/website is this?
2. What is the main content or purpose?
3. What are the key interactive elements (buttons, forms, menus)?
4. What is visible on the screen (text, images, layout)?

Provide a detailed but concise description.`;

  const result = await generativeModel.generateContent([
    { text: prompt },
    {
      inlineData: {
        mimeType: 'image/png',
        data: screenshotBase64,
      },
    },
  ]);

  return result.response.text();
}
