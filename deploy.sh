#!/bin/bash
set -e

# ============================================
# Universal Workflow Agent - Google Cloud Deployment
# Uses gcloud source-based deployment (no Docker required locally)
# ============================================

# Configuration
PROJECT_ID=${GOOGLE_CLOUD_PROJECT:-$(gcloud config get-value project)}
REGION=${REGION:-us-central1}
BACKEND_SERVICE="workflow-agent-backend"
FRONTEND_BUCKET="my-universal-workflow-agent-frontend"

echo "=========================================="
echo "Universal Workflow Agent - Cloud Deployment"
echo "=========================================="
echo "Project: ${PROJECT_ID}"
echo "Region: ${REGION}"
echo ""

# Check if gcloud is installed
if ! command -v gcloud &> /dev/null; then
    echo "Error: gcloud CLI not found. Install Google Cloud SDK."
    exit 1
fi

# ============================================
# Deploy Backend to Cloud Run (Source-based)
# ============================================
echo "=========================================="
echo "Deploying backend to Cloud Run..."
echo "=========================================="

gcloud run deploy "${BACKEND_SERVICE}" \
  --source ./backend \
  --platform managed \
  --region "${REGION}" \
  --allow-unauthenticated \
  --set-env-vars "GOOGLE_CLOUD_PROJECT=${PROJECT_ID}" \
  --set-env-vars "GCP_LOCATION=${REGION}" \
  --set-env-vars "GCS_BUCKET=my-universal-workflow-agent-screenshots" \
  --set-env-vars "FIRESTORE_COLLECTION=uia_sessions" \
  --set-env-vars "NODE_ENV=production" \
  --set-env-vars "MAX_STEPS=20" \
  --set-env-vars "MAX_MS=120000" \
  --set-env-vars "HEADLESS=true" \
  --memory 2Gi \
  --cpu 2 \
  --timeout 600 \
  --min-instances 1 \
  --max-instances 10 \
  --concurrency 10

# Get backend URL
BACKEND_URL=$(gcloud run services describe ${BACKEND_SERVICE} --region ${REGION} --format='value(status.url)')
echo "Backend URL: ${BACKEND_URL}"

# ============================================
# Deploy Frontend to Cloud Storage
# ============================================
echo ""
echo "=========================================="
echo "Building and deploying frontend..."
echo "=========================================="

# Build frontend
cd frontend
npm install
npm run build

# Create bucket if it doesn't exist (ignore error if exists)
gsutil mb -l ${REGION} gs://${FRONTEND_BUCKET} 2>/dev/null || true

# Configure bucket for static website hosting
gsutil web set -m index.html gs://${FRONTEND_BUCKET}

# Make bucket publicly readable
gsutil iam ch allUsers:objectViewer gs://${FRONTEND_BUCKET}

# Sync frontend files to bucket
gsutil -m rsync -R dist gs://${FRONTEND_BUCKET}

cd ..

# ============================================
# Get Final URLs
# ============================================
FRONTEND_URL="https://storage.googleapis.com/${FRONTEND_BUCKET}/index.html"

echo ""
echo "=========================================="
echo "Deployment Complete!"
echo "=========================================="
echo "Frontend URL: ${FRONTEND_URL}"
echo "Backend API: ${BACKEND_URL}"
echo "Health Check: ${BACKEND_URL}/health"
echo "GCP Proof: ${BACKEND_URL}/proof/gcp"
echo ""
echo "Open your browser to: ${FRONTEND_URL}"
echo ""

# Update local .env file
echo "VITE_BACKEND_URL=${BACKEND_URL}" > frontend/.env.local

echo "Done!"
