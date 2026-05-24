import { determineCategoryId } from '../src/lib/job-sources/categorization'

const testCases = [
  {
    title: 'Senior Project Manager',
    expectedId: 2,
    name: 'Project Management'
  },
  {
    title: 'Product Manager',
    expectedId: 9,
    name: 'Product Management'
  },
  {
    title: 'Technical Program Manager',
    expectedId: 2,
    name: 'Project Management'
  },
  {
    title: 'VP of Product',
    expectedId: 9,
    name: 'Product Management'
  },
  {
    title: 'Software Engineer',
    expectedId: 1,
    name: 'Programming & Development'
  },
  {
    title: 'Scrum Master',
    expectedId: 2,
    name: 'Project Management'
  },
  {
    title: 'Product Owner',
    expectedId: 9,
    name: 'Product Management'
  }
]

console.log('Verifying categorization logic...')
let failed = false

for (const test of testCases) {
  const actualId = determineCategoryId(test.title, '')
  if (actualId === test.expectedId) {
    console.log(`✅ ${test.title} -> ${test.name} (ID: ${actualId})`)
  } else {
    console.error(`❌ ${test.title} -> Expected ${test.expectedId}, got ${actualId}`)
    failed = true
  }
}

if (failed) {
  console.error('Verification failed!')
  process.exit(1)
} else {
  console.log('All tests passed!')
}
