import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { MetadataIssue, ProcessedMarkdown } from '../src/utils/types'
import { processMarkdown } from '../src/utils/markdownProcessor.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '..', '..')
const outputDir = resolve(repoRoot, 'output')

interface DerivedIssue extends MetadataIssue {
  url: string
}

function deriveIssues(result: ProcessedMarkdown): DerivedIssue[] {
  if (result.metadataIssues?.length) {
    return result.metadataIssues.filter((issue): issue is DerivedIssue => Boolean(issue.url))
  }

  return (result.bibliographyEntries ?? [])
    .filter((entry) => entry.needsManualMetadata && Boolean(entry.url))
    .map((entry) => ({
      url: entry.url,
      message: 'Metadata not provided. Please add details for this source.',
    }))
}

async function run(extraPath?: string) {
  mkdirSync(outputDir, { recursive: true })

  const rawPath = resolve(repoRoot, 'main-content.md')
  const rawMarkdown = readFileSync(rawPath, 'utf8')
  const firstPass = await processMarkdown(rawMarkdown)
  const firstDerivedIssues = deriveIssues(firstPass)
  if (!firstDerivedIssues.length) {
    throw new Error('First pass should produce metadata issues, but none were found.')
  }
  const firstOutputPath = resolve(outputDir, 'manual-metadata-flow-first.md')
  writeFileSync(firstOutputPath, firstPass.modified, 'utf8')

  const secondPass = await processMarkdown(firstPass.modified)
  const secondDerivedIssues = deriveIssues(secondPass)
  if (!secondDerivedIssues.length) {
    throw new Error('Re-processing the generated markdown did not surface metadata issues.')
  }

  const secondOutputPath = resolve(outputDir, 'manual-metadata-flow-second.md')
  writeFileSync(secondOutputPath, secondPass.modified, 'utf8')

  const existingProcessedPath = resolve(repoRoot, 'main-content-processed.md')
  const existingProcessedMarkdown = readFileSync(existingProcessedPath, 'utf8')
  const existingProcessedResult = await processMarkdown(existingProcessedMarkdown)
  const existingDerivedIssues = deriveIssues(
    existingProcessedResult,
  )
  if (!existingDerivedIssues.length) {
    throw new Error('Existing main-content-processed.md did not surface metadata issues.')
  }

  const report: Record<string, any> = {
    firstPassMetadataIssues: firstPass.metadataIssues.length,
    firstPassDerivedIssues: firstDerivedIssues.length,
    secondPassMetadataIssues: secondPass.metadataIssues.length,
    secondPassDerivedIssues: secondDerivedIssues.length,
    existingProcessedMetadataIssues: existingProcessedResult.metadataIssues.length,
    existingProcessedDerivedIssues: existingDerivedIssues.length,
    firstOutputPath,
    secondOutputPath,
  }

  if (extraPath) {
    const absoluteExtraPath = resolve(repoRoot, extraPath)
    const extraMarkdown = readFileSync(absoluteExtraPath, 'utf8')
    const extraResult = await processMarkdown(extraMarkdown)
    const extraDerived = deriveIssues(extraResult)
    if (!extraDerived.length) {
      throw new Error(`Provided file (${extraPath}) did not surface metadata issues.`)
    }
    report.extraFile = {
      path: absoluteExtraPath,
      metadataIssues: extraResult.metadataIssues.length,
      derivedIssues: extraDerived.length,
    }
  }

  console.log(JSON.stringify(report, null, 2))
}

const extraPathArg = process.argv[2]

run(extraPathArg).catch((error) => {
  console.error(error)
  process.exitCode = 1
})
