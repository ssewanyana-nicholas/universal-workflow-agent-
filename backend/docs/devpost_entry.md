# Devpost Entry - UI Navigator

## Elevator Pitch (300 characters)

AI-powered browser automation that uses Gemini's vision capabilities to understand web UIs, execute multi-step workflows, and verify results in real-time.

## Category Fit

**Best Use of Google Cloud AI/Machine Learning**

- Uses Vertex AI with Gemini 2.0 Flash for multimodal understanding
- Vision-based element detection and verification
- Cloud Run for scalable, containerized deployment
- Firestore for session persistence
- Cloud Storage for screenshot artifacts

## Technical Implementation

### Architecture

- **Frontend**: Next.js 14 control panel with canvas overlays
- **Backend**: Express.js + Playwright on Cloud Run
- **AI**: Google Vertex AI (Gemini 2.0 Flash) with function declarations
- **Storage**: Firestore (session history), Cloud Storage (screenshots)

### Key Features

1. **Vision-Based Automation**: Gemini analyzes screenshots to locate elements using normalized [0,1] coordinates
2. **Function Calling**: 15+ tool definitions (click, type, scroll, find_element, verify_element, etc.)
3. **One-Tool-Per-Turn**: Enforces single action per LLM response for precise control
4. **Verification Loop**: Auto-screenshots after state changes with Gemini verification
5. **Recovery Policies**: Automatic retry with scroll/retry on failures

### Code Structure

```
backend/
├── src/
│   ├── server.js         # Express endpoints (/agent/run, /agent/step)
│   ├── orchestrator.js   # LLM loop with session state
│   ├── gemini.js         # Vertex AI client
│   ├── vision.js         # Gemini vision for find/verify
│   ├── browser.js        # Playwright controller
│   └── tools/executor.js # Tool execution with overlay metadata
├── Dockerfile            # Playwright base image
└── deploy.sh            # Cloud Run deployment
```

## Innovation & UX

### What Makes It Different

1. **Normalized Coordinates**: All interactions use [0,1] normalized coordinates, making automation viewport-independent
2. **Vision-First Approach**: Instead of DOM parsing, uses Gemini's multimodal to "see" the page
3. **Real-time Verification**: Each state change is verified with screenshot analysis
4. **Demo Safety**: Domain whitelisting, destructive action warnings, demo mode

### User Experience

- **Control Panel**: Visual timeline of steps with clickable screenshots
- **Overlay Rendering**: Canvas overlays show bounding boxes from find_element results
- **Step-by-Step Debugging**: Pause/resume execution, review each step

## Proof of Google Cloud Deployment

### Deployed Services

- **Cloud Run**: `ui-navigator.[region].run.app`
- **Vertex AI**: Gemini 2.0 Flash (us-central1)
- **Firestore Collection**: `sessions/`
- **Cloud Storage Bucket**: Screenshots and artifacts

### Verification

- `/health` - Service health check
- `/metrics` - Uptime, request count, latency
- `/proof/gcp` - Project ID, region, service URLs

## Learnings & Challenges

1. **Normalized Coordinates**: Had to convert absolute pixels to normalized [0,1] for viewport independence
2. **Tool Selection**: Gemini sometimes calls multiple tools; enforced single-tool-per-turn
3. **Vision Latency**: Balanced screenshot quality vs. API latency
4. **Session Persistence**: Used Firestore for history across requests
5. **Security**: Added demo token and PII redaction for public demos

## What's Next

1. **Mobile Support**: Extend to mobile app automation
2. **Multi-Tab**: Handle complex workflows across tabs
3. **Recording**: Save/playback macros
4. **AI Fine-tuning**: Train on successful automation patterns
5. **Plugin System**: Allow custom tools and integrations

---

_Demo Video: [docs/demo.mp4](demo.mp4)_
_Repository: [GitHub Link]_
