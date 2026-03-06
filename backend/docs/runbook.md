# UI Navigator - Judge Runbook

This runbook provides step-by-step instructions for reproducing the golden path scenarios for judges.

## Prerequisites

1. **Google Cloud Project** with the following APIs enabled:
   - Cloud Run
   - Vertex AI
   - Firestore
   - Cloud Storage

2. **Deployed Backend**: Run `./deploy.sh` to deploy to Cloud Run

3. **Browser Access**: Open the following in your browser before starting:
   - stripe.com (logged in to a test account)
   - docs.google.com/spreadsheets (with a blank sheet open)
   - mail.google.com (logged in)

## Demo Scenarios

### Scenario 1: Stripe Export

**Goal String:**

```
Go to stripe.com, log in if needed, navigate to the invoices section, and export the latest invoice as CSV
```

**Steps:**

1. Open stripe.com in a browser and ensure you're logged in to the dashboard
2. Open the UI Navigator frontend
3. Enter the goal string in the input box
4. Click "Start Run"
5. Watch the agent navigate through Stripe
6. The agent should:
   - Open stripe.com
   - Navigate to Invoices/Billing
   - Find and click Export/Download
   - Verify the download

**Expected Verification:**

- Agent completes without errors
- Final status shows "success"

---

### Scenario 2: Google Sheets Update

**Goal String:**

```
Go to docs.google.com/spreadsheets, open the most recent sheet, and paste these totals: Q1: 1500, Q2: 2300, Q3: 1800, Q4: 3200
```

**Steps:**

1. Open docs.google.com/spreadsheets in a browser
2. Create a new blank spreadsheet
3. Open the UI Navigator frontend
4. Enter the goal string in the input box
5. Click "Start Run"
6. Watch the agent navigate through Google Sheets

**Expected Verification:**

- Agent navigates to the spreadsheet
- Agent types the Q1-Q4 values into cells

---

### Scenario 3: Gmail Send with Attachment

**Goal String:**

```
Go to mail.google.com, compose a new email to test@example.com with subject "Invoice" and body "Please find attached", then attach the latest invoice file
```

**Steps:**

1. Open mail.google.com in a browser (logged in)
2. Open the UI Navigator frontend
3. Enter the goal string in the input box
4. Click "Start Run"
5. Watch the agent compose the email

**Expected Verification:**

- Agent opens Gmail compose
- Agent fills in recipient, subject, body
- Agent clicks attach and selects a file

---

## Troubleshooting

### Whitelist Domain Issues

If the agent can't navigate to a domain, check that it's in the whitelist:

- Default: `stripe.com`, `docs.google.com`, `mail.google.com`
- Can be toggled in the frontend UI

### Viewport Issues

If elements aren't being found, the viewport size matters. The agent uses normalized coordinates (0-1) for a 1920x1080 viewport.

### Timeout Issues

If the agent takes too long, increase `MAX_STEPS` (default 20) or `MAX_MS` (default 120000) in the environment.

### Network Issues

Ensure the Cloud Run service has internet access and can reach the target websites.

## Metrics to Observe

- **Uptime**: Check `/metrics` for server uptime
- **Request Count**: Number of API requests handled
- **Average Latency**: Response time in milliseconds

## Video Recording Tips

1. Use the proof.sh script to capture deployment info
2. Record the frontend as it runs
3. Capture the timeline step-by-step
4. Show the final screenshot evidence
