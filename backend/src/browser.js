import playwright from 'playwright';

let browser = null;
let context = null;
let page = null;

// Browser mode configuration
const isHeadless = process.env.HEADLESS !== 'false';  // Default to headless, set HEADLESS=false for headed mode

// CDP connection settings
export const cdpConfig = {
    cdpUrl: process.env.CDP_URL || null,  // e.g., 'http://localhost:9222'
    useCdp: process.env.USE_CDP === 'true',
};

export async function launchBrowser() {
    // If CDP is configured, don't launch our own browser
    if (cdpConfig.useCdp && cdpConfig.cdpUrl) {
        console.log('[CDP] Connecting to existing Chrome browser...');
        try {
            browser = await playwright.chromium.connectOverCDP(cdpConfig.cdpUrl);
            console.log('[CDP] Connected to Chrome browser successfully');
            return browser;
        } catch (err) {
            console.error('[CDP] Failed to connect:', err.message);
            console.log('[CDP] Falling back to local browser');
        }
    }
    
    if (!browser) {
        console.log(`[Browser] Launching Chromium in ${isHeadless ? 'headless' : 'headed'} mode`);
        
        // Build browser launch arguments
        const args = [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
        ];
        
        // Additional args for headed mode on Windows
        if (!isHeadless) {
            args.push('--start-maximized');
            args.push('--disable-blink-features=AutomationControlled');
        }
        
        browser = await playwright.chromium.launch({
            headless: isHeadless,
            args: args,
            devtools: !isHeadless,  // Open DevTools in headed mode
        });
        
        console.log(`[Browser] ${isHeadless ? 'Headless' : 'Headed'} browser launched successfully`);
    }
    return browser;
}

export async function getContext() {
    if (cdpConfig.useCdp && browser) {
        // With CDP, use default context
        const contexts = browser.contexts();
        if (contexts.length > 0) {
            return contexts[0];
        }
        // Create new context if none exists
        return await browser.newContext({
            viewport: { width: 1280, height: 720 },
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        });
    }
    
    if (!context) {
        const b = await launchBrowser();
        context = await b.newContext({
            viewport: { width: 1280, height: 720 },
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        });
    }
    return context;
}

export async function getPage() {
    if (!page) {
        const ctx = await getContext();
        page = await ctx.newPage();
    }
    return page;
}

export async function newPage(viewport = null) {
    const ctx = await getContext();
    const page = await ctx.newPage();
    
    // Set viewport if provided
    if (viewport) {
        await page.setViewportSize(viewport);
    }
    
    return page;
}

export async function closeBrowser() {
    if (page) {
        await page.close();
        page = null;
    }
    if (context) {
        await context.close();
        context = null;
    }
    if (browser) {
        await browser.close();
        browser = null;
    }
}

// Helper to normalize coordinates to [0, 1] range
function normalizeCoords(x, y, viewport) {
    return {
        x: Math.max(0, Math.min(1, x / viewport.width)),
        y: Math.max(0, Math.min(1, y / viewport.height)),
    };
}

// Helper to denormalize coordinates from [0, 1] to pixels
function denormalizeCoords(x, y, viewport) {
    return {
        x: Math.round(x * viewport.width),
        y: Math.round(y * viewport.height),
    };
}

// Tool implementations - normalized coordinates [0, 1]
export const tools = {
    // Find element at coordinates
    find_element: async (p, { query, hints, top_k }) => {
        const page = await getPage();
        const viewport = page.viewportSize();
        const results = [];

        // Use query to find elements
        const elements = await page.locator(query).all();
        const count = Math.min(elements.length, top_k || 5);

        for (let i = 0; i < count; i++) {
            const box = await elements[i].boundingBox();
            if (box) {
                const centerX = box.x + box.width / 2;
                const centerY = box.y + box.height / 2;
                const normalized = normalizeCoords(centerX, centerY, viewport);
                results.push({
                    index: i,
                    x: normalized.x,
                    y: normalized.y,
                    text: await elements[i].textContent().catch(() => ''),
                    tag: await elements[i].evaluate(el => el.tagName),
                });
            }
        }

        return { ok: true, elements: results, count: elements.length };
    },

    // Click at normalized coordinates
    click: async (p, { x, y }) => {
        const page = await getPage();
        const viewport = page.viewportSize();
        const coords = denormalizeCoords(x, y, viewport);
        await page.mouse.click(coords.x, coords.y);
        return { ok: true, action: 'click', x, y };
    },

    // Double click at normalized coordinates
    double_click: async (p, { x, y }) => {
        const page = await getPage();
        const viewport = page.viewportSize();
        const coords = denormalizeCoords(x, y, viewport);
        await page.mouse.dblclick(coords.x, coords.y);
        return { ok: true, action: 'double_click', x, y };
    },

    // Right click at normalized coordinates
    right_click: async (p, { x, y }) => {
        const page = await getPage();
        const viewport = page.viewportSize();
        const coords = denormalizeCoords(x, y, viewport);
        await page.mouse.click(coords.x, coords.y, { button: 'right' });
        return { ok: true, action: 'right_click', x, y };
    },

    // Type text at current focus or coordinates
    type_text: async (p, { text, submit }) => {
        const page = await getPage();
        await page.keyboard.type(text);
        if (submit) {
            await page.keyboard.press('Enter');
        }
        return { ok: true, action: 'type_text', text, submit: submit || false };
    },

    // Press keys
    key_press: async (p, { keys }) => {
        const page = await getPage();
        await page.keyboard.press(keys);
        return { ok: true, action: 'key_press', keys };
    },

    // Scroll with optional delta
    scroll: async (p, { dx, dy }) => {
        const page = await getPage();
        if (dx !== undefined && dy !== undefined) {
            await page.mouse.wheel(dx * 500, dy * 500);
        } else {
            await page.evaluate(() => window.scrollBy(0, 500));
        }
        return { ok: true, action: 'scroll', dx: dx || 0, dy: dy || 0 };
    },

    // Hover at normalized coordinates
    hover: async (p, { x, y }) => {
        const page = await getPage();
        const viewport = page.viewportSize();
        const coords = denormalizeCoords(x, y, viewport);
        await page.mouse.move(coords.x, coords.y);
        return { ok: true, action: 'hover', x, y };
    },

    // Drag and drop
    drag_and_drop: async (p, { from_x, from_y, to_x, to_y }) => {
        const page = await getPage();
        const viewport = page.viewportSize();
        const from = denormalizeCoords(from_x, from_y, viewport);
        const to = denormalizeCoords(to_x, to_y, viewport);
        await page.mouse.move(from.x, from.y);
        await page.mouse.down();
        await page.mouse.move(to.x, to.y);
        await page.mouse.up();
        return { ok: true, action: 'drag_and_drop', from_x, from_y, to_x, to_y };
    },

    // Open URL - always use existing page
    open_url: async (p, { url, new_tab }) => {
        const page = await getPage();
        // Always use existing page, ignore new_tab parameter
        await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
        return { ok: true, action: 'open_url', url, new_tab: false };
    },

    // Switch tab
    switch_tab: async (p, { index, title_contains }) => {
        const ctx = await getContext();
        const pages = ctx.pages();

        if (index !== undefined) {
            if (index >= 0 && index < pages.length) {
                await pages[index].bringToFront();
                return { ok: true, action: 'switch_tab', index };
            }
            return { ok: false, error: `Tab index ${index} out of range` };
        }

        if (title_contains) {
            for (let i = 0; i < pages.length; i++) {
                const title = await pages[i].title();
                if (title.includes(title_contains)) {
                    await pages[i].bringToFront();
                    return { ok: true, action: 'switch_tab', title_contains, index: i };
                }
            }
            return { ok: false, error: `No tab found with title containing "${title_contains}"` };
        }

        return { ok: false, error: 'Either index or title_contains required' };
    },

    // Upload file
    upload_file: async (p, { file_label }) => {
        // This requires handling file input - typically via setInputFiles
        const page = await getPage();
        // Try to find file input by label
        const input = page.locator(`input[type="file"]`).first();
        const isVisible = await input.isVisible();
        if (isVisible) {
            // file_label would be the path to the file
            await input.setInputFiles(file_label);
            return { ok: true, action: 'upload_file', file_label };
        }
        return { ok: false, error: 'No file input found' };
    },

    // Take screenshot
    take_screenshot: async (p) => {
        const page = await getPage();
        const buf = await page.screenshot({ type: 'png' });
        return { ok: true, screenshot: buf.toString('base64') };
    },

    // Verify element exists
    verify_element: async (p, { query, must_include_text, region }) => {
        const page = await getPage();
        const locator = page.locator(query);
        const count = await locator.count();

        if (count === 0) {
            return { ok: false, error: `Element "${query}" not found` };
        }

        if (must_include_text) {
            const text = await locator.first().textContent();
            if (!text.includes(must_include_text)) {
                return { ok: false, error: `Element found but text "${text}" does not include "${must_include_text}"` };
            }
        }

        return { ok: true, action: 'verify_element', query, found: count };
    },

    // Finish with report
    finish_with_report: async (p, { status, summary, artifacts }) => {
        return {
            ok: true,
            action: 'finish_with_report',
            status: status || 'unknown',
            summary: summary || '',
            artifacts: artifacts || []
        };
    },
};
