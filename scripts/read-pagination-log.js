#!/usr/bin/env node
/**
 * read-pagination-log.js
 * Used by Claude Code hook (UserPromptSubmit) to auto-inject
 * the latest pagination summary into Claude's context.
 * Outputs JSON with hookSpecificOutput.additionalContext.
 */
import { readFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const logFile = join(__dirname, '..', 'pagination-log.json')

if (!existsSync(logFile)) process.exit(0)

let data
try {
  data = JSON.parse(readFileSync(logFile, 'utf8'))
} catch {
  process.exit(0)
}

if (!data || !data.summaryText) process.exit(0)

// Only inject if log is recent (last 60 minutes)
const ts = data.log?.timestamp || data.timestamp
const ageMinutes = ts ? (Date.now() - new Date(ts).getTime()) / 60000 : 999
if (ageMinutes > 60) process.exit(0)

const additionalContext = `<pagination-log>\n${data.summaryText}\n</pagination-log>`

console.log(JSON.stringify({
  hookSpecificOutput: {
    hookEventName: 'UserPromptSubmit',
    additionalContext
  }
}))
