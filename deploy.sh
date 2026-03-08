#!/bin/bash
set -e

# ============================================
# Universal Workflow Agent - Google Cloud Deployment
# ============================================

# Configuration
PROJECT_ID=${GOOGLE_CLOUD_PROJECT:-$(gcloud config get-value project)}
REGION=${REGION:-us-central1}
BACKEND_SERVICE="workflow-agent-backend"
FRONTEND_SERVICE="workflow-agent-frontend"
BACKEND_IMAGE="gcr.io/${PROJECT_ID}/${BACKEND_SERVICE}"
FRONTEND_IMAGE="gcr.io/${PROJECT_ID}/${FRONTEND_SERVICE}"

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
# Deploy Backend to Cloud Run
# ============================================
echo "=========================================="
echo "Building and deploying backend..."
echo "=========================================="

cd backend

# Build Docker image
echo "Building backend Docker image..."
docker build -t "${BACKEND_IMAGE}" .

# Push to GCR
echo "Pushing to GCR..."
docker push "${BACKEND_IMAGE}"

# Deploy to Cloud Run
echo "Deploying backend to Cloud Run..."
gcloud run deploy "${BACKEND_SERVICE}" \
  --image "${BACKEND_IMAGE}" \
  --platform managed \
  --region "${REGION}" \
  --allow-unauthenticated \
  --set-env-vars "GOOGLE_CLOUD_PROJECT=${PROJECT_ID}" \
  --set-env-vars "GCP_LOCATION=${REGION}" \
  --set-env-vars "NODE_ENV=production" \
  --set-env-vars "MAX_STEPS=20" \
  --set-env-vars "MAX_MS=120000" \
  --set-env-vars "HEADLESS=true" \
  --set-env-vars "USE_CDP=false" \
  --set-env-vars "ALLOWED_ORIGIN=*" \
  --memory 2Gi \
  --cpu 2 \
  --timeout 300 \
  --min-instances 0 \
  --max-instances 10 \
  --concurrency 1

# Get backend URL
BACKEND_URL=$(gcloud run services describe ${BACKEND_SERVICE} --region ${REGION} --format='value(status.url)')
echo "Backend URL: ${BACKEND_URL}"

cd ..

# ============================================
# Deploy Frontend to Cloud Run
# ============================================
echo ""
echo "=========================================="
echo "Building and deploying frontend..."
echo "=========================================="

cd frontend

# Build Docker image with backend URL
echo "Building frontend Docker image..."
docker build -t "${FRONTEND_IMAGE}" \
  --build-arg VITE_BACKEND_URL="${BACKEND_URL}" .

# Push to GCR
echo "Pushing to GCR..."
docker push "${FRONTEND_IMAGE}"

# Deploy to Cloud Run
echo "Deploying frontend to Cloud Run..."
gcloud run deploy "${FRONTEND_SERVICE}" \
  --image "${FRONTEND_IMAGE}" \
  --platform managed \
  --region "${REGION}" \
  --allow-unauthenticated \
  --memory 512Mi \
  --cpu 1 \
  --timeout 60 \
  --min-instances 0 \
  --max-instances 10 \
  --concurrency 80

cd ..

# ============================================
# Get Final URLs
# ============================================
FRONTEND_URL=$(gcloud run services describe ${FRONTEND_SERVICE} --region ${REGION} --format='value(status.url)')

echo ""
echo "=========================================="
echo "Deployment Complete!"
echo "=========================================="
echo "Frontend URL: ${FRONTEND_URL}"
echo "Backend API: ${BACKEND_URL}"
echo ""
echo "Open your browser to: ${FRONTEND_URL}"
echo ""

# Update .env files for local development
echo "Updating local .env files..."
echo "VITE_BACKEND_URL=${BACKEND_URL}" > frontend/.env.local
echo "BACKEND_URL=${BACKEND_URL}" > backend/.env.local

echo "Done!"
