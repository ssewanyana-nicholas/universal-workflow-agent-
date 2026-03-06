# Golden Path Demo Scenarios

These are reproducible end-to-end scenarios for demonstrating the UI Navigator agent.

## 1. Stripe Export Demo

**Goal**: "Open Stripe invoices and export latest CSV."

### Steps

1. `open_url('https://dashboard.stripe.com/login')`
2. Login to Stripe (if needed)
3. Navigate to Invoices
4. `find_element('Download CSV')`
5. `click(x, y)` on the download button
6. `verify_element('Download started chip')`

### What to Record

- Show the login process
- Navigate to Invoices section
- Click download button
- Show verification that download started

### Expected Verification

- `ok: true` with evidence of download confirmation

---

## 2. Google Sheets Update Demo

**Goal**: "Switch to 'Monthly Revenue - Google Sheets' and paste 'Q1 2026 Total: $128,440' in Totals column."

### Steps

1. `switch_tab(title_contains: 'Google Sheets')`
2. `find_element('Totals column')`
3. `click(x, y)` to select cell
4. `type_text('Q1 2026 Total: $128,440', submit: true)`
5. `verify_element('Q1 2026 Total: $128,440')`

### What to Record

- Show tab switching
- Show cell selection
- Show data entry
- Show verification of entered text

### Expected Verification

- `ok: true` with text matching

---

## 3. Gmail Send Demo

**Goal**: "Compose email to finance with subject + body and attach CSV."

### Steps

1. `switch_tab(title_contains: 'Gmail')`
2. `find_element('Compose')`
3. `click(x, y)` - opens compose dialog
4. `type_text('finance@example.com', submit: false)`
5. `key_press('Tab')` - move to subject
6. `type_text('Q1 Report')`
7. `key_press('Tab')` - move to body
8. `type_text('Please find attached Q1 report.')`
9. `find_element('Attach files')`
10. `click(x, y)` - opens file picker
11. `upload_file('/path/to/report.csv')`
12. `find_element('Send')`
13. `click(x, y)`
14. `verify_element('Message sent')`

### What to Record

- Show compose dialog opening
- Show email composition
- Show file attachment
- Show send confirmation

### Expected Verification

- `ok: true` with "Message sent" confirmation

---

## Recording Tips

### For Screen Recording

1. Use high resolution (1920x1080)
2. Show browser address bar
3. Include developer tools console briefly
4. Show the curl commands being executed

### Verification Checks to Highlight

1. Console output showing tool calls
2. Screenshot uploads to GCS
3. Firestore history entries
4. Latency metrics

### Demo Flow

1. **Hook** (30 sec): Explain the problem - automating web workflows
2. **Live Demo** (2 min): Run one of the golden paths
3. **Architecture** (30 sec): Show the diagram overlay
4. **Cloud Proof** (30 sec): Show GCP console with logs, Vertex AI usage, storage

---

## Quick Test Commands

```bash
# Test health
curl http://localhost:8080/health

# Test metrics
curl http://localhost:8080/metrics

# Test proof endpoint
curl http://localhost:8080/proof/gcp

# Run Stripe workflow
curl -X POST http://localhost:8080/api/workflow \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Go to stripe.com and take a screenshot"}'

# Get session
curl http://localhost:8080/api/session/session_123
```
