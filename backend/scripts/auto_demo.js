#!/usr/bin/env node

/**
 * Auto Demo Runner - PROMPT N
 * Runs the golden path scenarios automatically and logs results
 * 
 * Usage: node scripts/auto_demo.js --baseUrl=https://SERVICE.a.run.app
 */

const BASE_URL = process.argv.find(arg => arg.startsWith('--baseUrl='))?.split('=')[1] || 'http://localhost:8080';

const GOLDEN_PATHS = [
    {
        name: 'Stripe Export',
        goal: 'Go to stripe.com, log in if needed, navigate to the invoices section, and export the latest invoice as CSV',
        expectedDomain: 'stripe.com',
    },
    {
        name: 'Google Sheets Update',
        goal: 'Go to docs.google.com/spreadsheets, open the most recent sheet, and paste these totals: Q1: 1500, Q2: 2300, Q3: 1800, Q4: 3200',
        expectedDomain: 'docs.google.com',
    },
    {
        name: 'Gmail Send with Attachment',
        goal: 'Go to mail.google.com, compose a new email to test@example.com with subject "Invoice" and body "Please find attached", then attach the latest invoice file',
        expectedDomain: 'mail.google.com',
    },
];

const sessionState = {
    domain_whitelist: ['stripe.com', 'docs.google.com', 'mail.google.com'],
    safe_mode: true,
    demo_mode: true,
};

async function runAgent(sessionId, goal) {
    const response = await fetch(`${BASE_URL}/agent/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            sessionId,
            userGoal: goal,
            sessionState,
        }),
    });

    if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
}

async function downloadScreenshot(filename) {
    try {
        const response = await fetch(`${BASE_URL}/signed-url?filename=${encodeURIComponent(filename)}`);
        if (!response.ok) return null;
        const data = await response.json();
        return data.signed_url;
    } catch (err) {
        console.error('Failed to get signed URL:', err.message);
        return null;
    }
}

async function runDemo() {
    console.log('\n========================================');
    console.log('UI Navigator Auto Demo Runner');
    console.log('========================================\n');
    console.log(`Backend: ${BASE_URL}\n`);

    // Check backend health
    try {
        const healthRes = await fetch(`${BASE_URL}/health`);
        const health = await healthRes.json();
        console.log('✓ Backend health:', health);
    } catch (err) {
        console.error('✗ Backend not reachable:', err.message);
        process.exit(1);
    }

    const results = [];

    for (const scenario of GOLDEN_PATHS) {
        console.log(`\n----------------------------------------`);
        console.log(`Running: ${scenario.name}`);
        console.log(`Goal: ${scenario.goal}`);
        console.log(`------------------------------------------\n`);

        const sessionId = `auto-${scenario.name.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`;
        const startTime = Date.now();

        try {
            const result = await runAgent(sessionId, scenario.goal);
            const duration = Date.now() - startTime;

            console.log(`\nResult:`);
            console.log(`  Status: ${result.status}`);
            console.log(`  Steps: ${result.steps?.length || 0}`);
            console.log(`  Duration: ${duration}ms`);

            if (result.final) {
                console.log(`  Final Summary: ${result.final.summary}`);
            }

            // Log step details
            console.log(`\nStep Details:`);
            result.steps?.forEach((step, idx) => {
                console.log(`  ${idx + 1}. ${step.tool} - ${step.ok ? '✓' : '✗'} (${step.latency_ms}ms)`);
                if (step.screenshot_filename) {
                    console.log(`     📷 ${step.screenshot_filename}`);
                }
            });

            // Download evidence screenshot if available
            const lastStep = result.steps?.[result.steps.length - 1];
            if (lastStep?.screenshot_filename) {
                const url = await downloadScreenshot(lastStep.screenshot_filename);
                if (url) {
                    console.log(`\nLast screenshot: ${url}`);
                }
            }

            results.push({
                scenario: scenario.name,
                status: result.status,
                steps: result.steps?.length || 0,
                duration,
                ok: result.status === 'success',
            });
        } catch (err) {
            console.error(`Error running ${scenario.name}:`, err.message);
            results.push({
                scenario: scenario.name,
                status: 'error',
                error: err.message,
                ok: false,
            });
        }
    }

    // Summary
    console.log('\n========================================');
    console.log('DEMO SUMMARY');
    console.log('========================================\n');

    let passed = 0;
    for (const r of results) {
        const status = r.ok ? '✓ PASS' : '✗ FAIL';
        console.log(`${status} - ${r.scenario} (${r.steps} steps, ${r.duration}ms)`);
        if (r.ok) passed++;
    }

    console.log(`\n${passed}/${results.length} scenarios completed successfully`);

    if (passed < results.length) {
        console.log('\n⚠️  Some scenarios failed. Check logs above for details.');
        process.exit(1);
    }

    console.log('\n✓ All demos completed successfully!');
    process.exit(0);
}

runDemo().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
