#!/bin/bash
set -e

# Configuration
PROJECT_ID=${GOOGLE_CLOUD_PROJECT:-$(gcloud config get-value project)}
SERVICE_NAME="workflow-agent-backend"
IMAGE_NAME="gcr.io/${PROJECT_ID}/${SERVICE_NAME}"
REGION=${REGION:-us-central1}

echo "=========================================="
echo "Deploying to Cloud Run..."
echo "=========================================="
echo "Project: ${PROJECT_ID}"
echo "Service: ${SERVICE_NAME}"
echo "Region: ${REGION}"
echo ""

# Build the Docker image
echo "Building Docker image..."
docker build -t "${IMAGE_NAME}" .

# Push to Google Container Registry
echo "Pushing to GCR..."
docker push "${IMAGE_NAME}"

# Deploy to Cloud Run
# PROMPT O: Reliability improvements - min instances, concurrency, cpu boost, timeout
gcloud run deploy "${SERVICE_NAME}" \
  --image "${IMAGE_NAME}" \
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
  --memory 2Gi \
  --cpu 2 \
  --timeout 300 \
  --min-instances 1 \
  --max-instances 10 \
  --concurrency 10 \
  --cpu-boost

# Get the service URL
echo ""
echo "=========================================="
echo "Deployment complete!"
echo "=========================================="
SERVICE_URL=$(gcloud run services describe ${SERVICE_NAME} --region ${REGION} --format='value(status.url)')
echo "Service URL: ${SERVICE_URL}"

echo ""
echo "⚠️  COST WARNING: With --min-instances=1, the service will run continuously."
echo "To scale to zero after demo, run:"
echo "  gcloud run deploy ${SERVICE_NAME} --region ${REGION} --min-instances=0"
echo ""

# Print IAM instructions
echo ""
echo "=========================================="
echo "IAM Configuration"
echo "=========================================="
echo "Ensure your service account has these roles:"
echo "  - roles/aiplatform.user (for Vertex AI)"
echo "  - roles/storage.objectAdmin (for GCS bucket)"
echo "  - roles/datastore.user (for Firestore)"
echo ""
echo "To add roles:"
echo "  gcloud projects add-iam-policy-binding ${PROJECT_ID} \\"
echo "    --member=serviceAccount:YOUR_SERVICE_ACCOUNT \\"
echo "    --role=roles/aiplatform.user"
echo ""
echo "=========================================="
echo "Proof of Deployment"
echo "=========================================="
echo "Project ID: ${PROJECT_ID}"
echo "Region: ${REGION}"
echo "Bucket: ${GCS_BUCKET:-my-universal-workflow-agent-screenshots}"
echo "Firestore Collection: ${FIRESTORE_COLLECTION:-uia_sessions}"
echo "Service URL: ${SERVICE_URL}"
