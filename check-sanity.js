import 'dotenv/config'
import { createClient } from '@sanity/client'

const client = createClient({
  projectId: process.env.SANITY_PROJECT_ID,
  dataset: process.env.SANITY_DATASET,
  apiVersion: '2025-01-21',
  token: process.env.SANITY_API_TOKEN,
  useCdn: false,
})

async function checkData() {
  try {
    console.log('🔍 Checking Sanity data...\n')

    // Check if the test document exists
    const doc = await client.fetch('*[_id == "salesforce-account-001LIVE123456789AB"][0]')
    console.log('Test document exists:', !!doc)
    if (doc) {
      console.log('Document data:', JSON.stringify(doc, null, 2))
    } else {
      console.log('✅ Document not found (as expected after deletion)')
    }

    console.log('\n' + '='.repeat(50) + '\n')

    // Check total count of salesforceAccount documents
    const count = await client.fetch('count(*[_type == "salesforceAccount"])')
    console.log('📊 Total salesforceAccount documents:', count)

    // Get a sample of existing documents
    if (count > 0) {
      const sample = await client.fetch('*[_type == "salesforceAccount"][0...5]{_id, Name, _createdAt}')
      console.log('📋 Sample documents:')
      sample.forEach((doc, i) => {
        console.log(`  ${i + 1}. ${doc.Name} (${doc._id}) - Created: ${doc._createdAt}`)
      })
    }

  } catch (error) {
    console.error('❌ Error checking Sanity:', error.message)
  }
}

checkData()