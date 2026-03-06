# UI Navigator Backend

Express.js server that provides the agent orchestration and browser control.

## API Endpoints

### POST /agent/run
Run the agent with a full workflow loop.

**Request:**
```json
{
  "sessionId": "session_123",
  "userGoal": "compose an email",
  "sessionState": {
    "current_url": "https://mail.google.com",
    "viewport_size": { "width": 1920, "height": 1080 },
    "domain_whitelist": ["google.com"],
    "safe_mode": true,
    "demo_mode": true
  },
  "screenshotBase64": "iVBORw0KGgo..."
}
```

**Response:**
```json
{
  "steps": [
    {
      "stepId": 1,
      "tool": "find_element",
      "args": { "query": "compose button" },
      "ok": true,
      "result": { "elements": [...] }
    }
  ],
  "final": {
    "status": "success",
    "summary": "Email composed successfully"
  }
}
```

### POST /agent/analyze
Analysis-only mode - understand screenshot without executing actions.

### POST /agent/step
Single step execution.

### GET /health
Health check endpoint.

### GET /proof/gcp
GCP configuration proof.

## Environment Variables

| Variable | Description |
|----------|-------------|
| `GOOGLE_CLOUD_PROJECT` | GCP Project ID |
| `GCP_LOCATION` | Vertex AI location |
| `GCS_BUCKET` | Cloud Storage bucket |
| `FIRESTORE_COLLECTION` | Firestore collection |
| `USE_CDP` | Use Chrome DevTools Protocol |
| `CDP_URL` | CDP endpoint |
| `MAX_STEPS` | Max workflow steps |
| `TOOL_TIMEOUT_MS` | Tool execution timeout |

## Browser Control

### Local Mode (Default)
Launches headless Chrome browser.

### CDP Mode
Connect to existing Chrome browser:
```bash
# Start Chrome with debugging
chrome --remote-debugging-port=9222

# Set env vars
USE_CDP=true
CDP_URL=http://localhost:9222
```

## Development

```bash
npm start        # Production mode
npm run dev      # With auto-reload (if available)
```

## Architecture

```
Request → Orchestrator → Gemini (vision) → Execute Tool → Browser
                                              ↓
                                    Take Screenshot → Gemini (next turn)
```
