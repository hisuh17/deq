# DumEQ public website

Static GitHub Pages website: https://hisuh17.github.io/deq/

## Current data flow (consent v3)

- The 19-question experience runs in browser memory. No account, name, email, demographics, free text, answer cookies or local storage.
- The **Agree & Begin Assessment** button confirms adult/past-effects eligibility and the compact saving-consent statement **before** question 1. A full privacy notice is linked directly below it. Saving consent can be withdrawn through **Privacy & choices** before completion; the same local result remains available. No checkbox or second start button is used.
- Nothing is sent until all 19 questions are answered and the visitor presses **Save & see results**. The browser sends one complete response set to `submit_dumeq_response`.
- `private.dumeq_responses` retains the 19 answers together, questionnaire/consent versions, explicit consent, a calendar date, expiry date, random record ID and SHA-256 deletion-code hash. No exact submission timestamp, IP address or user-agent column is stored.
- A cryptographically random 256-bit deletion code is generated per response. The visitor can copy/download it and delete the response through Privacy & data. The raw code is not stored in the response table, cookies or local storage.
- Retries reuse the same immutable payload and code, preventing duplicates. Network failures are described as uncertain delivery, not as proof that nothing was stored.
- Deletion removes the answer row. `private.dumeq_withdrawals` keeps only a code hash and expiry date to stop a delayed retry from restoring deleted answers. Submission/deletion are serialised per hash.
- Both response sets and withdrawal markers expire after 12 months. The database job `dumeq-response-retention` runs daily at 00:05 UTC. Provider logs/backups have separate retention.
- The anonymous browser role has no table access. Only narrowly scoped submit/delete functions are exposed; privileged helpers and tables are in the unexposed `private` schema. RLS remains deny-by-default with no public policies.

Direct identifiers are not requested by the questionnaire, but answer patterns and hosting logs may permit identification. The site does **not** promise complete anonymity. Supabase's primary database is in London (`eu-west-2`); GitHub/Supabase logs, backups, support and subprocessors may involve other countries. This implementation does not by itself establish legal compliance or university ethics approval.

The current consent covers entertainment and website improvement only, **not academic research, papers, marketing or AI training**. A new purpose needs separate review and consent. The privacy contact is h.suh@exeter.ac.uk. Keep that address and the notice current.

## Database setup

1. Apply `supabase/schema.sql` for the original aggregate-only API.
2. Apply `supabase/response-storage.sql` for the current response-set API and retention job.
3. Use only the publishable key in `config.js`; never publish a secret/service-role key.
4. Verify `private` is not an exposed API schema, anonymous direct reads are blocked, current consent is required, retries produce one row, deletion removes it, and the retention job is active.
5. Run Supabase security/performance advisors. RLS-with-no-policy notices here are intentional deny-by-default access; the expiry indexes are for daily cleanup even before enough records exist for them to be useful.

Consent version `2026-09-17-v3` identifies the explicit start-button flow. Version `2026-09-17-v2` remains accepted for already-open checkbox-flow pages; existing rows retain their original consent version.

Legacy `deq_answer_counts` / `deq_totals` and the v1 `submit_deq_response` endpoint remain aggregate-only for already-open old pages. No historical individual response sets are reconstructed, and the new API does not increment legacy totals.

## Local preview and tests

```sh
python3 -m http.server 4173 --directory website
```

Open http://localhost:4173/. Automated DOM checks live at `tests/consent.test.cjs` and use `jsdom@26.1.0` in an isolated test environment. They cover opt-out, withdrawal, completeness, payloads, retries, deletion, reset and absence of answer storage. No extra runtime package is used by the website.

## Publishing

Publish this directory's HTML, JavaScript, CSS, favicon, WebP assets and documentation at the repository root. Paths are relative to support the `/deq/` project site. PNG source artwork is kept locally; source photos and response data are never committed.

## Content status

This is a playful entertainment site, not a validated questionnaire or a clinical instrument. The six sections and 0–95 incident index have no validated thresholds, norms or diagnostic interpretation.
