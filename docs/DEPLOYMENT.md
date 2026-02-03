# Deployment Guide

This guide covers deploying the Video Scavenger Hunt app to Azure.

## Prerequisites

- Azure subscription
- Azure CLI installed (`az --version`)
- GitHub repository access
- Cloudflare account (for DNS)

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     Cloudflare DNS                       │
│                    vsh.k61.dev → Azure                   │
└──────────────────────────┬──────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────┐
│              Azure Static Web Apps                       │
│  ┌─────────────────────────────────────────────────┐    │
│  │  React SPA (vsh.k61.dev)                        │    │
│  │  + Linked Azure Functions (API)                 │    │
│  │  + Entra ID Authentication                      │    │
│  └─────────────────────────────────────────────────┘    │
│                           │                              │
│  ┌─────────────────────────────────────────────────┐    │
│  │  Azure Storage Account                          │    │
│  │  • Table Storage (Games, Teams, Scenarios...)   │    │
│  │  • Blob Storage (photos/videos, 7-day TTL)      │    │
│  └─────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────┘
```

---

## Step 1: Create Entra ID App Registration

This enables "Sign in with Microsoft" for game keepers.

### In Azure Portal

1. Go to **Microsoft Entra ID** → **App registrations** → **New registration**

2. Configure the app:
   - **Name**: `Video Scavenger Hunt`
   - **Supported account types**: `Accounts in any organizational directory and personal Microsoft accounts`
   - **Redirect URI**: Leave blank for now (we'll add it after deployment)

3. Click **Register**

4. On the app overview page, note these values:
   - **Application (client) ID** → You'll need this as `AZURE_CLIENT_ID`
   - **Directory (tenant) ID** → Note for reference

5. Go to **Certificates & secrets** → **Client secrets** → **New client secret**
   - **Description**: `SWA Auth`
   - **Expires**: 24 months (or your preference)
   - **Copy the secret value immediately** → This is your `AZURE_CLIENT_SECRET`

6. Go to **Authentication** → **Add a platform** → **Web**
   - **Redirect URI**: `https://vsh.k61.dev/.auth/login/aad/callback`
   - Also add: `https://<your-swa-subdomain>.azurestaticapps.net/.auth/login/aad/callback`
   - Check **ID tokens** under Implicit grant

7. Go to **API permissions**
   - Ensure `Microsoft Graph > User.Read` is present (should be default)

### Save Your Credentials

Store these securely - you'll need them for GitHub Secrets:
```
AZURE_CLIENT_ID=<from step 4>
AZURE_CLIENT_SECRET=<from step 5>
```

---

## Step 2: Deploy Azure Infrastructure

### Option A: Using Azure CLI

```bash
# Login to Azure
az login

# Create resource group
az group create --name rg-vsh-prod --location westus2

# Deploy infrastructure
az deployment group create \
  --resource-group rg-vsh-prod \
  --template-file infra/main.bicep \
  --parameters environment=prod

# Get the deployment token for GitHub Actions
az staticwebapp secrets list \
  --name swa-vsh \
  --resource-group rg-vsh-prod \
  --query "properties.apiKey" -o tsv
```

### Option B: Using GitHub Actions (Recommended)

The GitHub Actions workflow handles infrastructure deployment automatically.

1. Add these secrets to your GitHub repository (**Settings → Secrets → Actions**):

   | Secret Name | Description |
   |-------------|-------------|
   | `AZURE_CREDENTIALS` | Azure service principal JSON (see below) |
   | `AZURE_CLIENT_ID` | Entra ID app client ID |
   | `AZURE_CLIENT_SECRET` | Entra ID app client secret |

2. Create Azure service principal:
   ```bash
   az ad sp create-for-rbac \
     --name "github-vsh-deploy" \
     --role contributor \
     --scopes /subscriptions/<subscription-id>/resourceGroups/rg-vsh-prod \
     --sdk-auth
   ```
   Copy the entire JSON output as `AZURE_CREDENTIALS` secret.

3. Push to `main` branch to trigger deployment.

---

## Step 3: Configure Cloudflare DNS

After the Static Web App is created, you need to configure DNS.

### Get Azure Validation Info

1. In Azure Portal, go to your Static Web App
2. Go to **Custom domains** → **Add**
3. Enter: `vsh.k61.dev`
4. Azure will show you the required DNS records

### In Cloudflare

1. Go to your domain's DNS settings in Cloudflare

2. Add the CNAME record:
   ```
   Type: CNAME
   Name: vsh
   Target: <your-swa>.azurestaticapps.net
   Proxy status: DNS only (gray cloud) ← Important!
   ```

3. If Azure requires a TXT record for validation:
   ```
   Type: TXT
   Name: _dnsauth.vsh
   Content: <validation-token-from-azure>
   ```

### Important: Disable Cloudflare Proxy

Azure Static Web Apps provides its own SSL certificate. You must set the CNAME to **DNS only** (gray cloud), not proxied (orange cloud).

If you use Cloudflare proxy:
- SSL will conflict
- Custom domain validation may fail

### Verify Domain

1. Return to Azure Portal → Static Web App → Custom domains
2. Click **Validate** (may take a few minutes for DNS propagation)
3. Once validated, Azure automatically provisions an SSL certificate

---

## Step 4: Configure App Settings

After deployment, set the Entra ID credentials:

```bash
az staticwebapp appsettings set \
  --name swa-vsh \
  --resource-group rg-vsh-prod \
  --setting-names \
    AZURE_CLIENT_ID=<your-client-id> \
    AZURE_CLIENT_SECRET=<your-client-secret>
```

Or via Azure Portal:
1. Go to Static Web App → **Configuration**
2. Add application settings for `AZURE_CLIENT_ID` and `AZURE_CLIENT_SECRET`

---

## Step 5: Seed Initial Data

After deployment, seed the scenario library and add the first game keeper:

```bash
# Seed scenarios
curl -X POST https://vsh.k61.dev/api/scenarios/seed

# Add first game keeper (replace with your email)
curl -X POST https://vsh.k61.dev/api/gamekeepers/seed
```

Or in the browser, navigate to:
- `https://vsh.k61.dev/api/scenarios/seed` (POST)
- `https://vsh.k61.dev/api/gamekeepers/seed` (POST)

---

## Troubleshooting

### Custom Domain Validation Fails

1. Ensure Cloudflare proxy is OFF (gray cloud)
2. Wait 5-10 minutes for DNS propagation
3. Verify with: `nslookup vsh.k61.dev`
4. Try removing and re-adding the custom domain in Azure

### Authentication Not Working

1. Verify redirect URIs in Entra ID app include both:
   - `https://vsh.k61.dev/.auth/login/aad/callback`
   - `https://<swa-subdomain>.azurestaticapps.net/.auth/login/aad/callback`

2. Check that `AZURE_CLIENT_ID` and `AZURE_CLIENT_SECRET` are set correctly

3. Check browser console for errors

### API Returns 401/403

1. Ensure the `staticwebapp.config.json` routes are correct
2. Check that Functions are linked properly
3. Verify storage connection string is set

### Blobs Not Auto-Deleting

The lifecycle policy runs once per day. Allow 24-48 hours for cleanup to occur.

---

## Cost Summary

| Resource | Monthly Cost |
|----------|--------------|
| Static Web Apps (Free tier) | $0 |
| Storage (Tables, ~1MB) | < $0.01 |
| Storage (Blobs, ~1-10GB) | $0.02-0.20 |
| **Total** | **< $0.25/month** |

---

## Security Checklist

- [x] Blob public access disabled
- [x] Storage uses shared key only for Functions (not exposed publicly)
- [x] Entra ID for game keeper authentication
- [x] HTTPS enforced via Azure SWA
- [x] CORS configured in staticwebapp.config.json
- [x] Rate limiting on game code attempts (in API)
