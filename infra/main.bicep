// Video Scavenger Hunt - Azure Infrastructure
// Deploys: Azure Static Web App, Storage Account (Blob + Table), Lifecycle Policy

targetScope = 'resourceGroup'

// ============================================================================
// Parameters
// ============================================================================

@description('Environment name (e.g., prod, dev)')
@allowed(['prod', 'dev'])
param environment string = 'prod'

@description('Azure region for resources')
param location string = resourceGroup().location

@description('Custom domain for the Static Web App (e.g., vsh.k61.dev)')
param customDomain string = ''

@description('Entra ID Client ID for authentication')
@secure()
param entraClientId string = ''

@description('Entra ID Client Secret for authentication')
@secure()
param entraClientSecret string = ''

@description('Tags to apply to all resources')
param tags object = {
  project: 'video-scavenger-hunt'
  environment: environment
}

// ============================================================================
// Variables
// ============================================================================

var resourceSuffix = environment == 'prod' ? '' : '-${environment}'
var staticSiteName = 'swa-vsh${resourceSuffix}'
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
    
    // Blob services with containers and lifecycle policy
    blobServices: {
      containers: [
        {
          name: 'media'
          publicAccess: 'None'
        }
      ]
    }
    
    // Table services for game data
    tableServices: {
      tables: [
        { name: 'Games' }
        { name: 'Teams' }
        { name: 'Scenarios' }
        { name: 'GameKeepers' }
        { name: 'MediaSubmissions' }
      ]
    }
    
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
    location: location
    tags: tags
    sku: 'Free'
    
    // App settings (available to linked Functions)
    appSettings: {
      // Storage connection string will be set by GitHub Actions
    }
    
    // Function app settings
    functionAppSettings: {
      AzureWebJobsStorage: storageAccount.outputs.primaryConnectionString
      AZURE_STORAGE_CONNECTION_STRING: storageAccount.outputs.primaryConnectionString
    }
    
    // Custom domain (optional - requires DNS validation first)
    customDomains: customDomain != '' ? [customDomain] : []
  }
}

// ============================================================================
// SWA Configuration for Entra ID Auth
// ============================================================================

// Note: Entra ID configuration is applied via staticwebapp.config.json
// The AZURE_CLIENT_ID and AZURE_CLIENT_SECRET are set as app settings
// via GitHub Actions after deployment

resource staticSiteSettings 'Microsoft.Web/staticSites/config@2022-03-01' = if (entraClientId != '' && entraClientSecret != '') {
  name: '${staticSiteName}/appsettings'
  dependsOn: [staticSite]
  properties: {
    AZURE_CLIENT_ID: entraClientId
    AZURE_CLIENT_SECRET: entraClientSecret
    AZURE_STORAGE_CONNECTION_STRING: storageAccount.outputs.primaryConnectionString
  }
}

// ============================================================================
// Outputs
// ============================================================================

@description('Static Web App default hostname')
output staticSiteDefaultHostname string = staticSite.outputs.defaultHostname

@description('Static Web App resource ID')
output staticSiteResourceId string = staticSite.outputs.resourceId

@description('Storage Account name')
output storageAccountName string = storageAccount.outputs.name

@description('Storage Account resource ID')
output storageAccountResourceId string = storageAccount.outputs.resourceId

@description('Storage Account primary blob endpoint')
output storageBlobEndpoint string = storageAccount.outputs.primaryBlobEndpoint

@description('Deployment token (retrieve via Azure CLI after deployment)')
output deploymentTokenNote string = 'Run: az staticwebapp secrets list --name ${staticSiteName} --query "properties.apiKey" -o tsv'
