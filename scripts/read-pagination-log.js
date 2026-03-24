#!/usr/bin/env node
/**
 * read-pagination-log.js
 * Used by Claude Code hook (UserPromptSubmit) to auto-inject
 * the latest pagination + TOC summaries into Claude's context.
 * Outputs JSON with hookSpecificOutput.additionalContext.
 */
import { readFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const logFile = join(__dirname, '..', 'pagination-log.json')
const tocLogFile = join(__dirname, '..', 'toc-log.json')

const parts = []

// ── Pagination log ──
if (existsSync(logFile)) {
  try {
    const data = JSON.parse(readFileSync(logFile, 'utf8'))
    if (data?.summaryText) {
      const ts = data.log?.timestamp || data.timestamp
      const ageMinutes = ts ? (Date.now() - new Date(ts).getTime()) / 60000 : 999
      if (ageMinutes <= 60) {
        parts.push(`<pagination-log>\n${data.summaryText}\n</pagination-log>`)
      }
    }
  } catch {}
}

// ── TOC build log ──
if (existsSync(tocLogFile)) {
  try {
    const data = JSON.parse(readFileSync(tocLogFile, 'utf8'))
    if (data?.summaryText) {
      const ts = data.timestamp
      const ageMinutes = ts ? (Date.now() - new Date(ts).getTime()) / 60000 : 999
      if (ageMinutes <= 60) {
        parts.push(`<toc-log>\n${data.summaryText}\n</toc-log>`)
      }
    }
  } catch {}
}

if (parts.length === 0) process.exit(0)

console.log(JSON.stringify({
  hookSpecificOutput: {
    hookEventName: 'UserPromptSubmit',
    additionalContext: parts.join('\n')
  }
}))
