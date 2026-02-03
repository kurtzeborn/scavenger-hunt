// Video Scavenger Hunt - Azure Infrastructure
// Deploys: Azure Static Web App, Azure Functions, Storage Account (Blob + Table), Lifecycle Policy

targetScope = 'resourceGroup'

// ============================================================================
// Parameters
// ============================================================================

@description('Environment name (e.g., prod, dev)')
@allowed(['prod', 'dev'])
param environment string = 'prod'

@description('Azure region for storage resources')
param location string = resourceGroup().location

@description('Azure region for Static Web App (SWA availability varies by region)')
param swaLocation string = 'eastus2'

@description('Custom domain for the Static Web App (e.g., vsh.k61.dev)')
param customDomain string = ''

@description('Reset data by recreating tables and reseeding. Only set to true when you want to clear all data!')
param resetData bool = false

@description('Tags to apply to all resources')
param tags object = {
  project: 'video-scavenger-hunt'
  environment: environment
}

// ============================================================================
// Variables
// ============================================================================

var resourceSuffix = environment == 'prod' ? '-prod' : '-${environment}'
var staticSiteName = 'swa-vsh${resourceSuffix}'
var functionAppName = 'func-vsh${resourceSuffix}'
var appServicePlanName = 'asp-vsh${resourceSuffix}'
var storageAccountName = 'stvsh${uniqueString(resourceGroup().id)}${environment}'

// ============================================================================
// Storage Account with Blob Lifecycle Policy
// ============================================================================

module storageAccount 'br/public:avm/res/storage/storage-account:0.19.0' = {
  name: 'storageAccountDeployment'
  params: {
    name: storageAccountName
    location: location
    tags: tags
    skuName: 'Standard_LRS'
    kind: 'StorageV2'
    allowBlobPublicAccess: false
    allowSharedKeyAccess: true  // Required for Azure Functions
    publicNetworkAccess: 'Enabled'  // Required for SWA managed functions
    networkAcls: {
      defaultAction: 'Allow'  // SWA managed functions need network access
    }
    
    // Blob services with containers and lifecycle policy
    blobServices: {
      containers: [
        {
          name: 'media'
          publicAccess: 'None'
        }
      ]
      // CORS for direct browser uploads - include both SWA hostname and custom domain
      corsRules: concat([
        {
          allowedOrigins: ['https://*.azurestaticapps.net']
          allowedMethods: ['GET', 'HEAD', 'PUT', 'POST', 'OPTIONS', 'DELETE']
          allowedHeaders: ['*']
          exposedHeaders: ['*']
          maxAgeInSeconds: 3600
        }
      ], customDomain != '' ? [
        {
          allowedOrigins: ['https://${customDomain}']
          allowedMethods: ['GET', 'HEAD', 'PUT', 'POST', 'OPTIONS', 'DELETE']
          allowedHeaders: ['*']
          exposedHeaders: ['*']
          maxAgeInSeconds: 3600
        }
      ] : [])
    }
    
    // Table services for game data
    // Only include tables when resetData=true to avoid wiping data on every deployment
    // Tables are created automatically by Azure Functions on first access if they don't exist
    tableServices: resetData ? {
      tables: [
        { name: 'Games' }
        { name: 'Teams' }
        { name: 'Scenarios' }
        { name: 'GameKeepers' }
        { name: 'MediaSubmissions' }
      ]
    } : {}
    
    // Lifecycle policy: Delete blobs after 7 days
    managementPolicyRules: [
      {
        name: 'DeleteOldMedia'
        enabled: true
        type: 'Lifecycle'
        definition: {
          filters: {
            blobTypes: ['blockBlob']
            prefixMatch: ['media/']
          }
          actions: {
            baseBlob: {
              delete: {
                daysAfterCreationGreaterThan: 7
              }
            }
          }
        }
      }
    ]
  }
}

// ============================================================================
// Azure Static Web App
// ============================================================================

module staticSite 'br/public:avm/res/web/static-site:0.7.0' = {
  name: 'staticSiteDeployment'
  params: {
    name: staticSiteName
    location: swaLocation
    tags: tags
    sku: 'Free'
    
    // Note: No api_location - we use a separate Function App
    // App settings for auth are configured via GitHub Actions
    
    // Custom domain (optional - requires DNS validation first)
    customDomains: customDomain != '' ? [customDomain] : []
  }
}

// ============================================================================
// Azure Functions (Consumption Plan)
// ============================================================================

module appServicePlan 'br/public:avm/res/web/serverfarm:0.4.1' = {
  name: 'appServicePlanDeployment'
  params: {
    name: appServicePlanName
    location: location
    tags: tags
    kind: 'linux'
    reserved: true  // Required for Linux
    skuName: 'Y1'   // Consumption plan
    skuCapacity: 0  // Consumption plan
    zoneRedundant: false
  }
}

module functionApp 'br/public:avm/res/web/site:0.15.1' = {
  name: 'functionAppDeployment'
  params: {
    name: functionAppName
    location: location
    tags: tags
    kind: 'functionapp,linux'
    serverFarmResourceId: appServicePlan.outputs.resourceId
    httpsOnly: true
    
    // System-assigned managed identity for secure storage access
    managedIdentities: {
      systemAssigned: true
    }
    
    // Site config for Node.js 20 on Linux
    siteConfig: {
      linuxFxVersion: 'NODE|20'
      ftpsState: 'Disabled'
      minTlsVersion: '1.2'
      cors: {
        allowedOrigins: concat(
          [
            'https://${staticSite.outputs.defaultHostname}'
            'https://localhost:5173'
          ],
          customDomain != '' ? ['https://${customDomain}'] : []
        )
        supportCredentials: true
      }
    }
    
    // Storage account for Function App
    storageAccountResourceId: storageAccount.outputs.resourceId
    storageAccountUseIdentityAuthentication: false  // Use connection string for now
    
    // Function app settings
    appSettingsKeyValuePairs: {
      FUNCTIONS_EXTENSION_VERSION: '~4'
      FUNCTIONS_WORKER_RUNTIME: 'node'
      WEBSITE_NODE_DEFAULT_VERSION: '~20'
      WEBSITE_RUN_FROM_PACKAGE: '1'
    }
  }
}

// Note: Entra ID configuration and storage connection string are set
// via GitHub Actions workflow after deployment

// ============================================================================
// Outputs
// ============================================================================

@description('Static Web App default hostname')
output staticSiteDefaultHostname string = staticSite.outputs.defaultHostname

@description('Static Web App resource ID')
output staticSiteResourceId string = staticSite.outputs.resourceId

@description('Function App name')
output functionAppName string = functionApp.outputs.name

@description('Function App default hostname')
output functionAppHostname string = functionApp.outputs.defaultHostname

@description('Function App resource ID')
output functionAppResourceId string = functionApp.outputs.resourceId

@description('Storage Account name')
output storageAccountName string = storageAccount.outputs.name

@description('Storage Account resource ID')
output storageAccountResourceId string = storageAccount.outputs.resourceId

@description('Storage Account primary blob endpoint')
output storageBlobEndpoint string = storageAccount.outputs.primaryBlobEndpoint

@description('Deployment token (retrieve via Azure CLI after deployment)')
output deploymentTokenNote string = 'Run: az staticwebapp secrets list --name ${staticSiteName} --query "properties.apiKey" -o tsv'
