# DigitalOcean Deployment Troubleshooting Guide

## Issues Fixed

### 1. Backend Container Exit (Non-Zero Exit Code)

**Problem**: The FastAPI backend container builds successfully but exits immediately on deployment.

**Root Causes**:
- Missing or incorrect `DATABASE_URL` environment variable
- Missing API keys (`OPENAI_API_KEY`, `PINECONE_API_KEY`)
- Database connection failure at startup
- Health check timing out too quickly

**Fixes Applied**:
1. Added error logging to `backend/app/main.py` for database connection issues
2. Increased health check timeouts in `.do/app.yaml`:
   - `initial_delay_seconds: 30` (was 10)
   - `timeout_seconds: 10` (was implicit 3)
   - `failure_threshold: 5` (was implicit 3)
3. Added `--log-level info` to uvicorn command for better debugging
4. Added `TAVILY_API_KEY` to environment variables

### 2. Next.js Server Action Errors

**Problem**: "Failed to find Server Action" errors occur after deployment.

**Root Cause**: Client-side JavaScript is cached but server has new Server Actions with different IDs.

**Fixes Applied**:
1. Added stable `generateBuildId` using git commit hash
2. Added `Cache-Control: no-store` headers for app routes with Server Actions
3. This ensures browser always fetches fresh page data after deployments

## Required Environment Variables

### For API Service (backend)

Set these in DigitalOcean App Platform > Settings > Environment Variables:

```bash
# Database (PostgreSQL connection string)
DATABASE_URL=postgresql://user:password@host:5432/dbname?sslmode=require

# OpenAI API
OPENAI_API_KEY=sk-...

# Pinecone Vector DB
PINECONE_API_KEY=...

# JWT Secret (must match frontend)
JWT_SECRET=your-secret-key-here

# CORS (auto-set by DO)
ALLOWED_ORIGINS=${APP_URL}

# Optional: Tavily Web Search
TAVILY_API_KEY=tvly-...
```

### For Web Service (frontend)

```bash
# Database (same as backend or separate)
DATABASE_URL=postgresql://user:password@host:5432/dbname?sslmode=require

# NextAuth
NEXTAUTH_SECRET=...
NEXTAUTH_URL=https://your-app.ondigitalocean.app

# Email
GMAIL_USER=...
GMAIL_APP_PASSWORD=...

# Backend connection (auto-set by DO)
BACKEND_URL=${api.PRIVATE_URL}

# DO Spaces (file storage)
FILE_STORAGE_BACKEND=do-spaces
DO_SPACES_ENDPOINT=...
DO_SPACES_KEY=...
DO_SPACES_SECRET=...
DO_SPACES_BUCKET=...
DO_SPACES_REGION=blr1
```

## Deployment Checklist

1. **Check Environment Variables**
   - All required variables are set in DO App Platform
   - Secrets are marked as "SECRET" type
   - No hardcoded credentials in code

2. **Check Database**
   - PostgreSQL database is created
   - Connection string is correct
   - Database is accessible from DO App Platform

3. **Check API Keys**
   - OpenAI API key is valid and has credits
   - Pinecone API key is valid
   - All keys have proper permissions

4. **Check Logs**
   ```bash
   # In DO App Platform Console:
   # - Go to your app
   # - Click on "Runtime Logs" for api service
   # - Look for database connection errors
   # - Check for missing environment variable warnings
   ```

5. **Test Health Endpoints**
   ```bash
   # API backend
   curl https://your-app-api.ondigitalocean.app/health

   # Frontend
   curl https://your-app.ondigitalocean.app/api/auth/session
   ```

## Common Issues and Solutions

### Issue: "Failed to connect to database"
**Solution**:
- Verify DATABASE_URL is set correctly
- Check PostgreSQL is running and accessible
- Verify SSL mode if required: `?sslmode=require`

### Issue: "OpenAI API key not found"
**Solution**:
- Set OPENAI_API_KEY in environment variables
- Mark it as SECRET type
- Redeploy the api service

### Issue: Health check failing
**Solution**:
- Check if `/health` endpoint responds locally
- Increase `initial_delay_seconds` in app.yaml
- Check container logs for startup errors

### Issue: Server Action errors persist
**Solution**:
- Hard refresh browser (Ctrl+Shift+R)
- Clear browser cache
- Check if multiple versions are deployed
- Verify `generateBuildId` is working (check build logs)

## Testing Locally

Before deploying, test the full stack locally:

```bash
# Terminal 1: Start backend
cd backend
python -m venv venv
source venv/bin/activate  # or `venv\Scripts\activate` on Windows
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8080

# Terminal 2: Start frontend
npm install
npx prisma generate
npx prisma db push
npm run dev

# Test health endpoints
curl http://localhost:8080/health
curl http://localhost:3000/api/auth/session
```

## Rollback Procedure

If deployment fails:

1. Go to DO App Platform Console
2. Click on your app
3. Go to "Deployments" tab
4. Find last successful deployment
5. Click "Redeploy" on that version

## Getting Help

If issues persist:

1. Check DO App Platform Runtime Logs
2. Check Build Logs for both services
3. Verify all environment variables are set
4. Test database connection separately
5. Contact DigitalOcean support with specific error messages
