import 'dotenv/config';

export const config = {
  projectId: process.env.GOOGLE_CLOUD_PROJECT,
  location: process.env.GCP_LOCATION || 'us-central1',
  bucket: process.env.GCS_BUCKET,
  firestoreCollection: process.env.FIRESTORE_COLLECTION || 'uia_sessions',
  port: process.env.PORT || 8080,
  allowedOrigin: process.env.ALLOWED_ORIGIN || '*',
  nodeEnv: process.env.NODE_ENV || 'production'
};

for (const [k, v] of Object.entries({
  GOOGLE_CLOUD_PROJECT: config.projectId,
  GCP_LOCATION: config.location,
  GCS_BUCKET: config.bucket
})) {
  if (!v) console.warn(`[WARN] Missing env: ${k}`);
}
