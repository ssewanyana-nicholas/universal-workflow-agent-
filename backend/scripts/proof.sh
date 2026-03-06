#!/bin/bash

# Proof Script - PROMPT R
# Generates all proof information for Google Cloud Deployment video recording

set -e

echo "============================================"
echo "UI Navigator - GCP Deployment Proof Script"
echo "============================================"
echo ""

# Check for required environment
if [ -z "$GCP_PROJECT" ]; then
  echo "⚠️  GCP_PROJECT not set, attempting to detect..."
  export GCP_PROJECT=$(gcloud config get-value project 2>/dev/null || echo "")
fi

if [ -z "$GCP_PROJECT" ] || [ "$GCP_PROJECT" = "(unset)" ]; then
  echo "❌ ERROR: GCP_PROJECT not set. Run: gcloud config set project YOUR_PROJECT"
  exit 1
fi

echo "✓ Project: $GCP_PROJECT"
echo ""

# Get Cloud Run URL
SERVICE_URL=$(gcloud run services describe ui-navigator --platform managed --region us-central1 --format 'value(status.url)' 2>/dev/null || echo "")

if [ -n "$SERVICE_URL" ]; then
  echo "✓ Cloud Run Service URL:"
  echo "  $SERVICE_URL"
else
  echo "⚠️  Cloud Run service not found. Deploy with: ./deploy.sh"
  SERVICE_URL="http://localhost:8080"
fi

echo ""
echo "============================================"
echo "Backend Health Check"
echo "============================================"
echo ""

curl -s "$SERVICE_URL/health" | jq '.' || echo "Failed to connect"

echo ""
echo "============================================"
echo "Backend Metrics"
echo "============================================"
echo ""

curl -s "$SERVICE_URL/metrics" | jq '.' || echo "Failed to connect"

echo ""
echo "============================================"
echo "GCP Proof Data"
echo "============================================"
echo ""

curl -s "$SERVICE_URL/proof/gcp" | jq '.' || echo "Failed to connect"

echo ""
echo "============================================"
echo "Recent Cloud Run Logs"
echo "============================================"
echo ""

gcloud logs read "resource.type=cloud_run_revision" "--limit=10" "--order=desc" 2>/dev/null | head -30 || echo "No logs available"

echo ""
echo "============================================"
echo "GCS Bucket Files"
echo "============================================"
echo ""

if [ -n "$GCS_BUCKET" ]; then
  echo "Bucket: gs://$GCS_BUCKET"
  gsutil ls -la "gs://$GCS_BUCKET/screens" 2>/dev/null | tail -10 || echo "No screenshots found"
else
  echo "⚠️  GCS_BUCKET not set, skipping bucket check"
fi

echo ""
echo "============================================"
echo "Firestore Collections"
echo "============================================"
echo ""

gcloud firestore collections list 2>/dev/null || echo "No Firestore collections or not configured"

echo ""
echo "============================================"
echo "Vertex AI Status"
echo "============================================"
echo ""

gcloud ai models list --region=us-central1 2>/dev/null | head -10 || echo "Vertex AI not available in this region"

echo ""
echo "============================================"
echo "✓ Proof generation complete"
echo "============================================"
