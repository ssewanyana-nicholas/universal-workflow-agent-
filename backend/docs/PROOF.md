# Google Cloud Proof - UI Navigator Agent

## ✅ Mandatory Requirements Checklist

### 1. Leverages a Gemini Model ✅
**File:** `backend/src/gemini.js`
```javascript
import { VertexAI } from '@google-cloud/vertexai';

const vertexAI = new VertexAI({
    project: config.projectId,
    location: config.location,
});

const model = 'gemini-2.0-flash';
const generativeModel = vertexAI.preview.getGenerativeModel({
    model,
    ...
});
```

**File:** `backend/src/vision.js`
```javascript
const model = 'gemini-2.0-flash';
const generativeModel = vertexAI.preview.getGenerativeModel({
    model,
    systemInstruction: systemPrompt,
    tools: [{ functionDeclarations }],
});
```

### 2. Uses Google GenAI SDK ✅
**Backend Dependencies (backend/package.json):**
```json
{
  "@google-cloud/vertexai": "^1.8.0",
  "@google-cloud/storage": "^7.14.0",
  "@google-cloud/firestore": "^4.17.0"
}
```

### 3. Uses Google Cloud Services ✅

#### a) Vertex AI (for Gemini multimodal) ✅
- **Files:** `backend/src/gemini.js`, `backend/src/vision.js`
- **Usage:** Processes screenshots with Gemini 2.0 Flash for visual understanding
- **Endpoint:** `us-central1-aiplatform.googleapis.com` (via VertexAI SDK)

#### b) Cloud Storage ✅
- **File:** `backend/src/util/storage.js`
```javascript
import { Storage } from '@google-cloud/storage';
const storage = new Storage();
const bucket = storage.bucket(config.bucket);
```
- **Usage:** Stores screenshots and uploaded files

#### c) Firestore ✅
- **File:** `backend/src/util/state.js`
```javascript
import { Firestore } from '@google-cloud/firestore';
const db = new Firestore();
```
- **Usage:** Stores session state and workflow history

#### d) Cloud Run ✅
- **File:** `backend/deploy.sh`
```bash
gcloud run deploy workflow-agent-backend \
  --source . \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated
```
- **Usage:** Hosts the backend API

---

## Architecture Overview

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Frontend      │────▶│   Cloud Run      │────▶│   Vertex AI     │
│   (Vite+React)  │     │   (Backend)      │     │   Gemini 2.0   │
│   localhost:3000│     │   :8080          │     │   (Multimodal)  │
└─────────────────┘     └────────┬─────────┘     └─────────────────┘
                                 │
                    ┌────────────┼────────────┐
                    ▼            ▼            ▼
              ┌──────────┐ ┌──────────┐ ┌──────────┐
              │Cloud     │ │Firestore │ │ Playwright│
              │Storage   │ │(Sessions)│ │(Browser) │
              └──────────┘ └──────────┘ └──────────┘
```

---

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `POST /agent/run` | Run full workflow with Gemini |
| `POST /agent/step` | Single step execution |
| `GET /health` | Health check |
| `GET /metrics` | Server metrics |
| `GET /proof/gcp` | GCP configuration proof |
| `GET /signed-url` | GCS signed URL for uploads |

---

## Deployment

The backend is deployed to Cloud Run:
- **Service:** workflow-agent-backend
- **Region:** us-central1
- **URL:** https://workflow-agent-backend-xxxx.run.app

To deploy:
```bash
cd backend
gcloud run deploy workflow-agent-backend --source . --region us-central1
```
