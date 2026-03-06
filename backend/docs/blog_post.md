# Building AI-Powered Browser Automation with Gemini and Cloud Run

## The Problem

Modern web automation is brittle. Traditional approaches rely on DOM selectors, XPath, or CSS selectors that break when websites change. Users want to describe what they want to accomplish—not how to do it.

What if an AI could "see" web pages the way humans do? What if it could understand UI elements visually, navigate flows naturally, and verify its own work?

## Our Approach: Vision-First Automation

We built **UI Navigator**, an AI-powered browser automation system that uses Google's Gemini 2.0 Flash to understand web pages through vision, not DOM parsing.

### Key Innovation: Normalized Coordinates

Traditional automation uses absolute pixel coordinates. This breaks across viewports. We solved this with **normalized [0,1] coordinates**:

- `click(0.5, 0.3)` means click at 50% width, 30% height
- Works identically on any screen size
- Makes automation viewport-independent

### How It Works

1. **Screenshot Capture**: Playwright captures the current page state
2. **Vision Analysis**: Gemini analyzes the screenshot to find elements matching the user's goal
3. **Element Location**: Returns bounding boxes in normalized coordinates
4. **Action Execution**: Playwright clicks/types at the specified coordinates
5. **Verification**: Another screenshot + Gemini verifies the action succeeded

## The Technology Stack

### Google Cloud Infrastructure

- **Vertex AI (Gemini 2.0 Flash)**: Multimodal understanding of screenshots
- **Cloud Run**: Serverless container deployment
- **Firestore**: Session state and history persistence
- **Cloud Storage**: Screenshot artifacts

### Key Tools

```javascript
// 15 function declarations for the agent
const tools = [
  "find_element", // Vision-based element search
  "verify_element", // Verify element exists/text matches
  "click", // Click at normalized coords
  "type_text", // Type with optional submit
  "scroll", // Scroll by delta
  "open_url", // Navigate to URL
  "take_screenshot", // Capture current state
  "finish_with_report", // Task completion
  // ... and more
];
```

## Verification & Safety

### Auto-Verification Loop

After every state-changing action, the agent:

1. Takes a screenshot
2. Calls `verify_element` to confirm the change
3. Retries if verification fails

### Demo Safety Features

- **Domain Whitelisting**: Only allowed domains can be navigated
- **Destructive Action Warnings**: Alerts for delete/charge operations
- **Demo Mode**: Sandboxed execution with limited permissions
- **PII Redaction**: Email addresses and IDs masked in logs

## Results

Our system successfully automates multi-step workflows:

- ✅ **Stripe Export**: Navigate to invoices → Export CSV
- ✅ **Google Sheets**: Open sheet → Paste data → Verify
- ✅ **Gmail**: Compose → Attach file → Send

## Performance

- Average latency: ~2s per step (including vision analysis)
- Success rate: >80% on standard workflows
- Scales automatically via Cloud Run

---

#GeminiLiveAgentChallenge #AI #BrowserAutomation #GoogleCloud
