// Video Scavenger Hunt - Azure Infrastructure
// Deploys: Azure Static Web App, Storage Account (Blob + Table), Lifecycle Policy

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
param swaLocation string = 'centralus'

@description('Custom domain for the Static Web App (e.g., vsh.k61.dev)')
param customDomain string = ''

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
    location: swaLocation
    tags: tags
    sku: 'Free'
    
    // Note: App settings (including storage connection string) are set 
    // via GitHub Actions after deployment to avoid Bicep secure string limitations
    
    // Custom domain (optional - requires DNS validation first)
    customDomains: customDomain != '' ? [customDomain] : []
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

@description('Storage Account name')
output storageAccountName string = storageAccount.outputs.name

@description('Storage Account resource ID')
output storageAccountResourceId string = storageAccount.outputs.resourceId

@description('Storage Account primary blob endpoint')
output storageBlobEndpoint string = storageAccount.outputs.primaryBlobEndpoint

@description('Deployment token (retrieve via Azure CLI after deployment)')
output deploymentTokenNote string = 'Run: az staticwebapp secrets list --name ${staticSiteName} --query "properties.apiKey" -o tsv'
