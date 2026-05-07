import 'dotenv/config'
import express from 'express'
import { createClient } from '@sanity/client'
import crypto from 'crypto'

const app = express()

app.use(express.json({ limit: '10mb' }))

const sanityClient = createClient({
  projectId: process.env.SANITY_PROJECT_ID,
  dataset: process.env.SANITY_DATASET,
  apiVersion: '2025-01-21',
  token: process.env.SANITY_API_TOKEN,
  useCdn: false,
})

const WEBHOOK_SECRET = process.env.SALESFORCE_WEBHOOK_SECRET

function verifySignature(req: express.Request) {
  if (!WEBHOOK_SECRET) return true

  const signature = req.headers['x-salesforce-signature'] as string | undefined
  if (!signature) return false

  const payload = JSON.stringify(req.body)
  const expectedSignature = crypto
    .createHmac('sha256', WEBHOOK_SECRET)
    .update(payload)
    .digest('base64')

  return signature === expectedSignature
}

function mapSalesforceToSanity(sfAccount: Record<string, any>) {
  let firstName = sfAccount.FirstName
  let lastName = sfAccount.LastName

  if (!firstName && !lastName && sfAccount.Name) {
    const nameParts = sfAccount.Name.trim().split(/\s+/)
    if (nameParts.length === 1) {
      lastName = nameParts[0]
    } else {
      lastName = nameParts.pop()
      firstName = nameParts.join(' ')
    }
  }

  return {
    _type: 'salesforceAccount',
    Id: sfAccount.Id,
    Name: sfAccount.Name || `${firstName || ''} ${lastName || ''}`.trim(),
    RecordTypeId: sfAccount.RecordTypeId || null,
    OwnerId: sfAccount.OwnerId,
    ParentId: sfAccount.ParentId || null,
    FirstName: firstName || null,
    LastName: lastName || null,
    Salutation: sfAccount.Salutation || null,
    IsPersonAccount: sfAccount.IsPersonAccount || false,
    Phone: sfAccount.Phone || null,
    Fax: sfAccount.Fax || null,
    Website: sfAccount.Website || null,
    PhotoUrl: sfAccount.PhotoUrl || null,
    BillingStreet: sfAccount.BillingStreet || null,
    BillingCity: sfAccount.BillingCity || null,
    BillingState: sfAccount.BillingState || null,
    BillingPostalCode: sfAccount.BillingPostalCode || null,
    BillingCountry: sfAccount.BillingCountry || null,
    BillingAddress: sfAccount.BillingAddress || null,
    Type: sfAccount.Type || null,
    Industry: sfAccount.Industry || null,
    AnnualRevenue: sfAccount.AnnualRevenue || null,
    NumberOfEmployees: sfAccount.NumberOfEmployees || null,
    Description: sfAccount.Description || null,
    Rating: sfAccount.Rating || null,
    AccountSource: sfAccount.AccountSource || null,
    CurrencyIsoCode: sfAccount.CurrencyIsoCode || 'USD',
    CreatedDate: sfAccount.CreatedDate || new Date().toISOString(),
    LastModifiedDate: sfAccount.LastModifiedDate || new Date().toISOString(),
    LastActivityDate: sfAccount.LastActivityDate || null,
    LastViewedDate: sfAccount.LastViewedDate || null,
    Account_Type__c: sfAccount.Account_Type__c || null,
    Industry__c: sfAccount.Industry__c || null,
    Customer_Status__c: sfAccount.Customer_Status__c || null,
    Status__c: sfAccount.Status__c || null,
    Notes__c: sfAccount.Notes__c || null,
    Telephone_1__c: sfAccount.Telephone_1__c || null,
    Telephone_2__c: sfAccount.Telephone_2__c || null,
  }
}

function getSanityDocId(salesforceId: string) {
  return `salesforce-account-${salesforceId}`
}

async function updateParentReference(parentSalesforceId: string | null) {
  if (!parentSalesforceId) return null

  const parentSanityId = getSanityDocId(parentSalesforceId)
  const parentExists = await sanityClient.fetch(`*[_id == $id][0]`, { id: parentSanityId })

  if (parentExists) {
    return {
      _type: 'reference',
      _ref: parentSanityId,
    }
  }

  return null
}

app.post('/webhook/salesforce', async (req, res) => {
  try {
    if (!verifySignature(req)) {
      console.error('Invalid webhook signature')
      return res.status(401).json({ error: 'Unauthorized' })
    }

    const payload = req.body || {}
    const { operation, sobjectType, recordId } = payload as Record<string, any>

    console.log(`[Webhook] Received ${operation} for ${sobjectType} ID: ${recordId}`)

    if (sobjectType !== 'Account') {
      console.log(`[Webhook] Ignoring non-Account object: ${sobjectType}`)
      return res.status(200).json({
        message: `Ignored ${sobjectType} webhook`,
        handled: false,
      })
    }

    const docId = getSanityDocId(recordId)

    if (operation === 'delete') {
      console.log(`[Webhook] Deleting document: ${docId}`)
      const result = await sanityClient.delete(docId)
      console.log(`[Webhook] Deleted document: ${docId}`)
      return res.status(200).json({
        success: true,
        operation: 'delete',
        sanityId: docId,
        result,
      })
    }

    const recordData = payload.new || payload
    if (!recordData || !recordData.Id) {
      console.error('[Webhook] No record data found in payload')
      return res.status(400).json({ error: 'Missing record data' })
    }

    const sanityDoc = mapSalesforceToSanity(recordData)

    if (sanityDoc.ParentId) {
      const parentRef = await updateParentReference(sanityDoc.ParentId)
      if (parentRef) {
        sanityDoc.parent = parentRef
      }
    }

    const result = await sanityClient.createOrReplace({
      _id: docId,
      ...sanityDoc,
      _updatedAt: new Date().toISOString(),
      lastSyncedAt: new Date().toISOString(),
    })

    console.log(`[Webhook] ${operation} completed for ${docId}`)

    return res.status(200).json({
      success: true,
      operation: operation,
      sanityId: docId,
      result: {
        id: result._id,
        createdAt: result._createdAt,
        updatedAt: result._updatedAt,
      },
    })
  } catch (error: any) {
    console.error('[Webhook] Error processing webhook:', error)
    return res.status(500).json({
      success: false,
      error: error?.message || 'Unknown error',
      stack: process.env.NODE_ENV === 'development' ? error?.stack : undefined,
    })
  }
})

app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    sanity: {
      projectId: process.env.SANITY_PROJECT_ID,
      dataset: process.env.SANITY_DATASET,
      configured: !!(process.env.SANITY_PROJECT_ID && process.env.SANITY_API_TOKEN),
    },
  })
})

app.post('/webhook/salesforce/batch', async (req, res) => {
  try {
    const { records, operation } = req.body as { records: Record<string, any>[]; operation?: string }
    if (!Array.isArray(records)) {
      return res.status(400).json({ error: 'records must be an array' })
    }

    const results = []
    for (const record of records) {
      try {
        const docId = getSanityDocId(record.Id)
        const sanityDoc = mapSalesforceToSanity(record)
        const result = await sanityClient.createOrReplace({
          _id: docId,
          ...sanityDoc,
          _updatedAt: new Date().toISOString(),
          lastSyncedAt: new Date().toISOString(),
        })

        results.push({
          id: record.Id,
          success: true,
          sanityId: docId,
          createdAt: result?._createdAt,
          updatedAt: result?._updatedAt,
        })
      } catch (err: any) {
        results.push({
          id: record?.Id || null,
          success: false,
          error: err?.message || 'Unknown error',
        })
      }
    }

    return res.status(200).json({
      success: true,
      operation,
      total: records.length,
      results,
    })
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Unknown error' })
  }
})

app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('[Server] Error:', err)
  res.status(500).json({
    error: 'Internal server error',
    message: err?.message || 'Unknown error',
  })
})

const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
  console.log(`🚀 Salesforce webhook server running on port ${PORT}`)
  console.log(`📡 Webhook endpoint: http://localhost:${PORT}/webhook/salesforce`)
  console.log(`💚 Health check: http://localhost:${PORT}/health`)
})
