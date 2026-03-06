# Google Cloud Credentials Setup Guide

## Step 1: Install Google Cloud CLI (gcloud)

### Windows (using PowerShell):

```powershell
# Download the installation bundle
Invoke-WebRequest -Uri https://dl.google.com/dl/cloudsdk/channels/rapid/GoogleCloudSDKInstaller.exe -OutFile GoogleCloudSDKInstaller.exe

# Run the installer
.\GoogleCloudSDKInstaller.exe
```

Or using winget:

```powershell
winget install GoogleCloudSDK
```

### After installation, restart your terminal and run:

```powershell
gcloud --version
```

---

## Step 2: Initialize gcloud and authenticate

```powershell
gcloud init
```

This will:

1. Open a browser for authentication
2. Allow access to your Google account
3. Let you create/select a project

---

## Step 3: Create a new project (if needed)

```powershell
# Create a new project
gcloud projects create my-universal-workflow-agent --name="Universal Workflow Agent"

# Set the project as default
gcloud config set project my-universal-workflow-agent
```

---

## Step 4: Enable required APIs

```powershell
# Enable Vertex AI API
gcloud services enable aiplatform.googleapis.com

# Enable Cloud Run API
gcloud services enable run.googleapis.com

# Enable Firestore API
gcloud services enable firestore.googleapis.com

# Enable Cloud Storage API
gcloud services enable storage.googleapis.com

# Enable Artifact Registry (for Docker images)
gcloud services enable artifactregistry.googleapis.com
```

---

## Step 5: Create a .env file

Create a `.env` file in the `backend/` folder:

```env
GOOGLE_CLOUD_PROJECT=my-universal-workflow-agent
GCP_LOCATION=us-central1
GCS_BUCKET=my-unique-bucket-name
FIRESTORE_COLLECTION=uia_sessions
PORT=8080
ALLOWED_ORIGIN=*
NODE_ENV=development
LOG_LEVEL=debug
```

---

## Step 6: Create GCS Bucket

```powershell
# Create a unique bucket name
gsutil mb -l us-central1 gs://my-unique-bucket-name/
```

---

## Step 7: Authenticate locally

```powershell
# Use your Google account for authentication
gcloud auth application-default login
```

This creates credentials in `%APPDATA%\gcloud\application_default_credentials.json`

---

## Step 8: Start the server

```powershell
cd backend
npm install
npm start
```

---

## Quick Commands Summary

```powershell
# Install gcloud
winget install GoogleCloudSDK

# Initialize
gcloud init

# Create project
gcloud projects create YOUR_PROJECT_ID

# Enable APIs
gcloud services enable aiplatform.googleapis.com run.googleapis.com firestore.googleapis.com storage.googleapis.com

# Create bucket
gsutil mb -l us-central1 gs://YOUR_BUCKET_NAME

# Authenticate
gcloud auth application-default login

# Set project
gcloud config set project YOUR_PROJECT_ID
```
