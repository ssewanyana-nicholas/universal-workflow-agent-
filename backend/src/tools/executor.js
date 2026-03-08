import { tools, getPage } from '../browser.js';
import { logger } from '../logger.js';
import { saveBase64Image } from '../util/storage.js';
import { appendHistory } from '../util/state.js';
import { locateElements, verifyTarget } from '../vision.js';

// File mapping storage (in-memory for demo)
const fileMappings = new Map();

export async function executeTool(toolCall, sessionId, page = null) {
  const name = toolCall.name;
  const args = toolCall.args || {};

  logger.info({ tool: name, args, sessionId }, 'Executing tool');

  try {
    // Handle vision-based tools specially
    if (name === 'find_element') {
      const p = page || await getPage();
      const screenshotBuffer = await p.screenshot({ type: 'png' });
      const screenshotBase64 = screenshotBuffer.toString('base64');

      // Debug log
      logger.info({ screenshotLength: screenshotBase64?.length }, 'find_element screenshot');

      if (!screenshotBase64 || screenshotBase64.length === 0) {
        return { ok: false, error: 'Failed to capture screenshot' };
      }

      const elements = await locateElements({
        screenshotBase64,
        query: args.query,
        hints: args.hints,
        top_k: args.top_k || 5,
      });

      // Format for frontend overlay (PROMPT M)
      const candidates = elements.map(el => ({
        x: el.normalized_bbox?.x || 0,
        y: el.normalized_bbox?.y || 0,
        width: el.normalized_bbox?.width || 0.1,
        height: el.normalized_bbox?.height || 0.1,
        score: el.score || 0.5,
        label: el.text || el.element_type || 'element',
      }));

      const result = { ok: true, candidates, count: candidates.length };

      // Save to history
      if (sessionId) {
        await appendHistory(sessionId, {
          tool: name,
          args,
          result,
          timestamp: new Date().toISOString(),
        }).catch(() => { });
      }

      return result;
    }

    if (name === 'verify_element') {
      const p = page || await getPage();
      const screenshotBuffer = await p.screenshot({ type: 'png' });
      const screenshotBase64 = screenshotBuffer.toString('base64');

      // Debug log
      logger.info({ screenshotLength: screenshotBase64?.length }, 'verify_element screenshot');

      if (!screenshotBase64 || screenshotBase64.length === 0) {
        return { ok: false, error: 'Failed to capture screenshot' };
      }

      // Handle both 'query' and 'description' argument names
      const query = args.query || args.description || args.text || '';
      
      const verification = await verifyTarget({
        screenshotBase64,
        query: query,
        must_include_text: args.must_include_text,
        region: args.region,
      });

      // Save screenshot for evidence
      let screenshot_filename = null;
      if (verification.screenshot) {
        const saved = await saveBase64Image(verification.screenshot);
        screenshot_filename = saved.filename;
      }

      // Format for frontend overlay (PROMPT M)
      // Always return ok: true - the verification ran successfully, found/not found is a valid result
      const result = {
        ok: true, // Always success - verification completed
        found: verification.exists,
        description: verification.description,
        evidence: {
          screenshot_filename,
          region: verification.region,
          textMatched: verification.exists,
          reason: verification.description,
        },
      };

      // Save to history
      if (sessionId) {
        await appendHistory(sessionId, {
          tool: name,
          args,
          result,
          timestamp: new Date().toISOString(),
        }).catch(() => { });
      }

      return result;
    }

    // Handle wait tool
    if (name === 'wait') {
      const ms = args.ms || 1000;
      await new Promise(resolve => setTimeout(resolve, ms));
      logger.info({ ms }, 'Wait completed');
      return { ok: true, action: 'wait', ms };
    }

    // Handle file upload (PROMPT L)
    if (name === 'upload_file') {
      const p = page || await getPage();
      const { file_label } = args;

      // Look up the mapped filename
      const filename = fileMappings.get(file_label);
      if (!filename) {
        return { ok: false, error: `No file mapped for label: ${file_label}` };
      }

      // Download the file and set it to the active input
      // For now, we'll use a placeholder - in production, download from GCS
      const result = {
        ok: true,
        label: file_label,
        filename: filename,
        message: `Would upload file: ${filename}`,
      };

      return result;
    }

    const toolFn = tools[name];
    if (!toolFn) {
      return { ok: false, error: `Unknown tool: ${name}` };
    }

    // Get the page
    const p = page || await getPage();
    const result = await toolFn(p, args);

    // Handle screenshot - save to GCS and return filename
    if (name === 'take_screenshot' && result.screenshot) {
      const { filename } = await saveBase64Image(result.screenshot);
      result.screenshot_filename = filename;
      delete result.screenshot;
    }

    // Save to history
    if (sessionId) {
      await appendHistory(sessionId, {
        tool: name,
        args,
        result,
        timestamp: new Date().toISOString(),
      }).catch(() => { }); // Ignore Firestore errors
    }

    return result;
  } catch (error) {
    logger.error({ tool: name, error: error.message, sessionId }, 'Tool execution failed');
    return { ok: false, error: error.message };
  }
}

// Export for server.js to use (PROMPT L)
export function setFileMapping(label, filename) {
  fileMappings.set(label, filename);
}

export function getFileMapping(label) {
  return fileMappings.get(label);
}

export function parseToolCalls(response) {
  const toolCalls = [];

  // Check for function calls in the response
  const candidates = response.candidates;
  if (!candidates || candidates.length === 0) return toolCalls;

  const content = candidates[0].content;
  if (!content || !content.parts) return toolCalls;

  for (const part of content.parts) {
    if (part.functionCall) {
      toolCalls.push({
        name: part.functionCall.name,
        args: part.functionCall.args || {},
      });
    }
  }

  // Also parse text-based function calls (for models that don't use function calling)
  if (toolCalls.length === 0) {
    const text = content.parts.filter(p => p.text).map(p => p.text).join('');
    const parsed = parseTextToolCalls(text);
    toolCalls.push(...parsed);
  }

  return toolCalls;
}

function parseTextToolCalls(text) {
  const toolCalls = [];

  // First, try to parse as JSON
  try {
    // Look for JSON object in the text
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const json = JSON.parse(jsonMatch[0]);
      if (json.plan && Array.isArray(json.plan)) {
        // Format: {plan: [{action, x, y, text, ...}]}
        for (const action of json.plan) {
          if (action.action) {
            const toolName = action.action;
            const args = { ...action };
            delete args.action; // Remove action from args
            toolCalls.push({ name: toolName, args });
          }
        }
        return toolCalls;
      }
      if (json.action) {
        // Format: {action: "click", x: 100, y: 200}
        const toolName = json.action;
        const args = { ...json };
        delete args.action;
        toolCalls.push({ name: toolName, args });
        return toolCalls;
      }
    }
  } catch (e) {
    // Not valid JSON, continue with regex parsing
  }

  // Match function calls in text format
  // open_url('https://example.com')
  // click(0.5, 0.3)
  // type_text('hello', true)

  let match;

  // open_url
  match = text.match(/open_url\s*\(\s*['"]([^'"]+)['"]\s*(?:,\s*(\w+))?\s*\)/);
  if (match) {
    toolCalls.push({ name: 'open_url', args: { url: match[1], new_tab: match[2] === 'true' } });
  }

  // click
  match = text.match(/click\s*\(\s*([\d.]+)\s*,\s*([\d.]+)\s*\)/);
  if (match) {
    toolCalls.push({ name: 'click', args: { x: parseFloat(match[1]), y: parseFloat(match[2]) } });
  }

  // double_click
  match = text.match(/double_click\s*\(\s*([\d.]+)\s*,\s*([\d.]+)\s*\)/);
  if (match) {
    toolCalls.push({ name: 'double_click', args: { x: parseFloat(match[1]), y: parseFloat(match[2]) } });
  }

  // right_click
  match = text.match(/right_click\s*\(\s*([\d.]+)\s*,\s*([\d.]+)\s*\)/);
  if (match) {
    toolCalls.push({ name: 'right_click', args: { x: parseFloat(match[1]), y: parseFloat(match[2]) } });
  }

  // type_text
  match = text.match(/type_text\s*\(\s*['"]([^'"]+)['"]\s*(?:,\s*(\w+))?\s*\)/);
  if (match) {
    toolCalls.push({ name: 'type_text', args: { text: match[1], submit: match[2] === 'true' } });
  }

  // key_press
  match = text.match(/key_press\s*\(\s*['"]([^'"]+)['"]\s*\)/);
  if (match) {
    toolCalls.push({ name: 'key_press', args: { keys: match[1] } });
  }

  // scroll
  match = text.match(/scroll\s*\(\s*(?:([\d.-]+)\s*,\s*([\d.-]+))?\s*\)/);
  if (match) {
    toolCalls.push({ name: 'scroll', args: { dx: match[1] ? parseFloat(match[1]) : 0, dy: match[2] ? parseFloat(match[2]) : 0 } });
  }

  // hover
  match = text.match(/hover\s*\(\s*([\d.]+)\s*,\s*([\d.]+)\s*\)/);
  if (match) {
    toolCalls.push({ name: 'hover', args: { x: parseFloat(match[1]), y: parseFloat(match[2]) } });
  }

  // drag_and_drop
  match = text.match(/drag_and_drop\s*\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*\)/);
  if (match) {
    toolCalls.push({
      name: 'drag_and_drop', args: {
        from_x: parseFloat(match[1]),
        from_y: parseFloat(match[2]),
        to_x: parseFloat(match[3]),
        to_y: parseFloat(match[4])
      }
    });
  }

  // switch_tab
  match = text.match(/switch_tab\s*\(\s*(?:(\d+)|['"]([^'"]+)['"])\s*\)/);
  if (match) {
    toolCalls.push({
      name: 'switch_tab', args: {
        index: match[1] ? parseInt(match[1]) : undefined,
        title_contains: match[2] || undefined
      }
    });
  }

  // upload_file
  match = text.match(/upload_file\s*\(\s*['"]([^'"]+)['"]\s*\)/);
  if (match) {
    toolCalls.push({ name: 'upload_file', args: { file_label: match[1] } });
  }

  // take_screenshot
  if (text.includes('take_screenshot()')) {
    toolCalls.push({ name: 'take_screenshot', args: {} });
  }

  // verify_element
  match = text.match(/verify_element\s*\(\s*['"]([^'"]+)['"]\s*(?:,\s*['"]([^'"]*)['"])?\s*\)/);
  if (match) {
    toolCalls.push({
      name: 'verify_element', args: {
        query: match[1],
        must_include_text: match[2] || undefined
      }
    });
  }

  // finish_with_report
  match = text.match(/finish_with_report\s*\(\s*['"]([^'"]+)['"]\s*,\s*['"]([^'"]*)['"]/);
  if (match) {
    toolCalls.push({
      name: 'finish_with_report', args: {
        status: match[1],
        summary: match[2]
      }
    });
  }

  // find_element
  match = text.match(/find_element\s*\(\s*['"]([^'"]+)['"]/);
  if (match) {
    toolCalls.push({ name: 'find_element', args: { query: match[1] } });
  }

  return toolCalls;
}

export function extractText(response) {
  const candidates = response.candidates;
  if (!candidates || candidates.length === 0) return '';

  const content = candidates[0].content;
  if (!content || !content.parts) return '';

  return content.parts
    .filter(part => part.text)
    .map(part => part.text)
    .join('');
}
