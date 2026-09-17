# DumEQ public website

Static GitHub Pages site for the 19-item Dummies Experience Questionnaire parody.

Live site: https://hisuh17.github.io/deq/

## Data design

The assessment works locally in the browser. Results do not require submission. If a visitor explicitly opts in after seeing the result, the browser calls one Supabase RPC. The database increments 114 aggregate cells (19 questions × 6 answer values) and one total-submission counter in a transaction. It does not store a row containing the visitor's full response pattern.

GitHub and Supabase can still process IP address, user-agent and request metadata in security logs. The site therefore describes the application database as aggregate-only and does not promise absolute anonymity across infrastructure providers.

## Local preview

Serve this directory over HTTP:

```sh
python3 -m http.server 4173 --directory website
```

Open `http://localhost:4173/`.

## Supabase setup

1. Create a dedicated Supabase project in a UK or EU region.
2. Apply `supabase/schema.sql`.
3. Run Supabase security and performance advisors.
4. Put the project URL and active publishable key in `config.js`. A publishable key is intended for browser use; never put a secret or service-role key in this repository.
5. Test one submission and verify that all 19 corresponding aggregate cells and the submission counter increase once.
6. Confirm that `anon` cannot select, update, or delete either table and cannot call the private function through the exposed Data API.

## GitHub Pages

Publish the contents of this directory at `https://hisuh17.github.io/deq/`. All paths are relative so the project-site subdirectory works without a build step.

## Content status

This is an entertainment website, not a validated short form, research instrument, clinical tool, or measure of intelligence. The six sections and the 0–95 incident index are presentation devices; no thresholds, norms, diagnoses, or population comparisons are implemented.
