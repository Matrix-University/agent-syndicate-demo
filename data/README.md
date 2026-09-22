# Email data

`emails.jsonl` is created automatically the first time someone subscribes. It is
**gitignored** — this is collected user PII and must never be committed.

Format: one JSON object per line —

```json
{ "email": "someone@example.com", "subscribedAt": "2026-09-21T18:04:12.000Z" }
```

To export for an email marketing tool (Mailchimp, etc.), convert to CSV, e.g.:

```bash
node -e "const fs=require('fs');const lines=fs.readFileSync('data/emails.jsonl','utf8').trim().split('\n').filter(Boolean).map(JSON.parse);console.log(['email','subscribedAt'].join(','));lines.forEach(r=>console.log([r.email,r.subscribedAt].join(',')))" > data/emails.csv
```
