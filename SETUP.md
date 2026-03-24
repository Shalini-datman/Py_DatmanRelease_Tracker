# Datman Release Tracker v2 — Setup Guide

## Architecture
- **Frontend**: React (Vercel static)
- **Backend**: Python serverless functions (Vercel `/api/`)  
- **Database**: Supabase (PostgreSQL)

## Step 1 — Create Supabase project (5 min)

1. Go to https://supabase.com → New Project
2. Name it `datman-release-tracker`
3. Copy your credentials:
   - **Project URL**: `https://xxxx.supabase.co`
   - **Service Role Key**: Settings → API → service_role (not anon!)
4. Go to SQL Editor → New Query → paste contents of `supabase_schema.sql` → Run

## Step 2 — Set Vercel environment variables

In Vercel → Project → Settings → Environment Variables, add:

| Name | Value |
|------|-------|
| `SUPABASE_URL` | `https://xxxx.supabase.co` |
| `SUPABASE_KEY` | your service role key |
| `JIRA_BASE_URL` | `https://datman.atlassian.net` |
| `JIRA_EMAIL` | your Jira email |
| `JIRA_API_TOKEN` | your Jira API token |

## Step 3 — Deploy

```bash
# Copy these files into your existing repo
cp -r api/          your-repo/api/
cp -r src/          your-repo/src/
cp vercel.json      your-repo/vercel.json
cp requirements.txt your-repo/requirements.txt

git add .
git commit -m "v2: Python backend + Supabase"
git push
```

## Step 4 — Import your data

1. Open the deployed app
2. Click ↑ CSV → upload your CSV file
3. All releases are saved to Supabase — shared across all team members

## File sizes (new vs old)

| File | Old | New |
|------|-----|-----|
| App.jsx | 3087 lines | ~150 lines |
| All components | (in App.jsx) | ~200 lines each |
| Python API | — | ~400 lines total |
| **Total frontend** | **3087 lines** | **~900 lines** |

## API endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/releases` | List all releases |
| POST | `/api/releases` | Create release |
| PUT | `/api/releases?id=X` | Update release |
| DELETE | `/api/releases?id=X` | Delete release |
| POST | `/api/import_csv` | Parse + return CSV rows |
| GET | `/api/analytics?from=&to=` | Pre-calculated metrics |
| GET/POST | `/api/jira/*` | Jira proxy |
