# UI Navigator 🤖

**Visual UI Understanding & Interaction Agent**

A powerful AI agent that becomes your hands on screen. It observes the browser display using Gemini multimodal vision, interprets visual elements without relying on DOM access, and performs actions based on user intent.

---

## ✅ Requirements Compliance

### Mandatory Tech Requirements

| Requirement | Status | Implementation |
|-------------|--------|----------------|
| **Gemini Model** | ✅ | Uses `gemini-2.0-flash` via Google GenAI SDK (`@google-cloud/vertexai`) |
| **Google GenAI SDK** | ✅ | `import { VertexAI } from '@google-cloud/vertexai'` in [`backend/src/gemini.js`](backend/src/gemini.js) |
| **Multimodal Vision** | ✅ | Screenshots analyzed with Gemini 2.0 Flash for visual UI understanding |
| **Executable Actions** | ✅ | Agent outputs executable tool calls (click, type, find_element, etc.) |
| **ADK Agent** | ✅ | ADK-style agent implementation in [`backend/src/adk_agent.js`](backend/src/adk_agent.js) |

### Google Cloud Services

| Service | Status | Implementation |
|---------|--------|----------------|
| **Vertex AI** | ✅ | Gemini 2.0 Flash for vision and reasoning |
| **Cloud Run** | ✅ | Deployable to Cloud Run (Dockerfile included) |
| **Cloud Logging** | ✅ | Pino logger with structured logging |
| **Firestore** | ✅ | Session history storage ([`backend/src/util/state.js`](backend/src/util/state.js)) |
| **Cloud Storage** | ✅ | Screenshot storage ([`backend/src/util/storage.js`](backend/src/util/storage.js)) |

### Agent Features

| Feature | Status |
|---------|--------|
| Visual UI Understanding | ✅ |
| Screenshot Interpretation | ✅ |
| Element Detection | ✅ |
| Action Execution | ✅ |
| Multi-step Workflows | ✅ |
| Analysis-Only Mode | ✅ |
| CDP Browser Control | ✅ |
| Headed Browser (visible) | ✅ |
| ADK-style Tool Execution | ✅ |

---

## 🚀 How to Use UI Navigator

### Step 1: Configure Environment

Copy the sample environment file and configure:
```bash
cp backend/.env.sample backend/.env
# Edit backend/.env with your Google Cloud project settings
```

### Step 2: Start the Backend

```bash
cd backend
npm install  # Only needed once
npm start
```

The backend runs on **http://localhost:8080**

### Step 3: Start the Frontend

```bash
cd frontend
npm install  # Only needed once
npm run dev
```

The frontend runs on **http://localhost:3000**

### Step 3: Configure Your Session

In the frontend at http://localhost:3000:

1. **URL**: Enter the website you want the agent to work with (e.g., `https://www.google.com`)
2. **Task**: Describe what you want done (e.g., "Search for weather in Nairobi")
3. **Viewport** (optional): Set browser size - default is 1280x720
4. **Browser**: Choose "headless" or " CDP" (see CDP section below)

### Step 4: Run the Agent

Click **"Start Agent"** to begin. The agent will:

1. Open the browser and navigate to the URL
2. Take a screenshot and send it to Gemini
3. Gemini "sees" the screenshot and decides what action to take
4. The agent executes the action (click, type, scroll, etc.)
5. Repeat until the task is complete

### Understanding the Display

| Panel | What it shows |
|-------|---------------|
| **Backend Browser** | Shows what the agent sees (screenshot after each action) |
| **Action History** | Log of all actions taken (clicks, typing, navigation) |
| **Current State** | Current URL, viewport, and session info |

### Mode: Analysis Only

Toggle **"Analysis Only"** to have the agent analyze the page without taking any actions. Useful for:
- Understanding what the agent sees
- Debugging
- Just getting information from a page

### Mode: CDP (Control Your Browser)

For actions on sites where you're already logged in:

```bash
# 1. Close all Chrome windows

# 2. Start Chrome with remote debugging
"C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222

# 3. In backend/.env, add:
USE_CDP=true
CDP_URL=http://localhost:9222

# 4. Restart the backend
```

Then select "CDP" as the browser type in the frontend.

---

## Quick Start

### Prerequisites
- Node.js 20+
- Google Cloud Project with Vertex AI enabled

### Installation

```bash
# Install dependencies
cd backend && npm install
cd ../frontend && npm install
```

### Configuration

Create `backend/.env`:
```env
GOOGLE_CLOUD_PROJECT=your-project-id
GCP_LOCATION=us-central1
GCS_BUCKET=your-screenshots-bucket
FIRESTORE_COLLECTION=uia_sessions
PORT=8080
```

### Running

```bash
# Terminal 1 - Backend
cd backend && npm start

# Terminal 2 - Frontend  
cd frontend && npm run dev
```

Open http://localhost:3000

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Frontend (React)                          │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────┐     │
│  │ Screenshot  │  │  Session    │  │   Action     │     │
│  │ Upload      │  │  State      │  │   History    │     │
│  └─────────────┘  └──────────────┘  └───────────────┘     │
└────────────────────────┬────────────────────────────────────┘
                         │
                    POST /agent/run
                         │
┌────────────────────────▼────────────────────────────────────┐
│                  Backend (Express + Node.js)                 │
│                                                              │
│  ┌──────────────┐  ┌──────────────────┐  ┌─────────────┐  │
│  │ Orchestrator │──│ Gemini 2.0 Flash │──│   Vision   │  │
│  │   (Loop)    │  │  (Vertex AI)     │  │  Processing │  │
│  └──────────────┘  └──────────────────┘  └─────────────┘  │
│         │                                                  │
│  ┌──────▼──────────────────────────────────────────┐     │
│  │           Playwright Browser                      │     │
│  │  - Headless Chrome                               │     │
│  │  - CDP Support (control your browser)            │     │
│  └──────────────────────────────────────────────────┘     │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Google Cloud Services Used:                        │   │
│  │  - Vertex AI (Gemini 2.0 Flash)                    │   │
│  │  - Firestore (session history)                      │   │
│  │  - Cloud Storage (screenshots)                      │   │
│  │  - Cloud Run (deployment)                          │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/agent/run` | POST | Run full workflow automation |
| `/agent/analyze` | POST | Analysis-only mode |
| `/agent/step` | POST | Single step execution |
| `/health` | GET | Health check |
| `/proof/gcp` | GET | GCP configuration proof |

---

## Tools Available

The agent uses Gemini to understand screenshots and outputs these executable actions:

| Tool | Description |
|------|-------------|
| `find_element` | Find UI elements by visual description |
| `click` | Click at normalized coordinates |
| `type_text` | Type text into focused element |
| `scroll` | Scroll by normalized delta |
| `open_url` | Navigate to a URL |
| `take_screenshot` | Capture current view |
| `verify_element` | Verify element exists |
| `finish_with_report` | Complete with summary |

---

## CDP Mode (Control Your Browser)

For full browser control with your logged-in sessions:

```bash
# 1. Start Chrome with debugging
"C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222

# 2. Enable CDP in backend/.env
USE_CDP=true
CDP_URL=http://localhost:9222

# 3. Restart backend
```

---

## 💡 Example Tasks to Try

### Beginner Examples

| Task | What the agent does |
|------|---------------------|
| "Go to google.com and search for 'AI news'" | Opens Google → Types query → Shows results |
| "Go to wikipedia.org and find information about Kenya" | Opens Wikipedia → Navigates to Kenya page |
| "Go to github.com and click the sign in button" | Opens GitHub → Locates and clicks Sign In |

### Intermediate Examples

| Task | What the agent does |
|------|---------------------|
| "Go to gmail.com and check for unread emails" | Opens Gmail → Analyzes inbox → Reports count |
| "Go to youtube.com and search for a tutorial on React" | Opens YouTube → Types search → Shows results |
| "Go to amazon.com and find the cheapest headphones" | Opens Amazon → Searches → Sorts by price |

### Advanced Examples (CDP Mode)

| Task | What the agent does |
|------|---------------------|
| "Send an email in Gmail" | (Requires CDP with logged-in session) |
| "Post a tweet on Twitter" | (Requires CDP with logged-in session) |
| "Check your bank balance" | (Requires CDP with logged-in session) |

---

## 🔧 Troubleshooting

### "Agent not calling tools"
- Check that the backend is running
- Check the console for errors
- Try a simpler task first

### "Screenshot not loading"
- Ensure Playwright/Chrome is installed: `npx playwright install chromium`
- Check the browser console for errors

### "Gemini API errors"
- Verify your `GOOGLE_CLOUD_PROJECT` in `.env`
- Ensure Vertex AI is enabled in your GCP project
- Check the GCP proof endpoint: http://localhost:8080/proof/gcp

### "Browser not opening"
- For CDP mode, ensure Chrome is running with `--remote-debugging-port=9222`
- Check that `USE_CDP=true` is set in `.env`

---

## License

Apache 2.0
