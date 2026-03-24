/**
 * compare-pagination.js
 *
 * Reads pagination-log.json and generates quality metrics.
 * Use before/after a paginateChapters.js change to detect regressions.
 *
 * Usage:
 *   node scripts/compare-pagination.js                  # show current state
 *   node scripts/compare-pagination.js --save-baseline  # save baseline
 *   node scripts/compare-pagination.js --compare        # diff vs saved baseline
 */

const fs = require('fs');
const path = require('path');

const LOG_PATH = path.join(__dirname, '..', 'pagination-log.json');
const BASELINE_PATH = path.join(__dirname, 'pagination-baseline.json');

function analyze(raw) {
  const summary = raw.log?.summary || raw.summary || {};
  const allPages = Object.values(summary);
  const pages = allPages.filter(p => !p.blank && p.fillPct > 0);

  const totalPages = pages.length;
  const perfect   = pages.filter(p => p.fillPct >= 100).length;
  const above90   = pages.filter(p => p.fillPct >= 90).length;
  const below80   = pages.filter(p => p.fillPct < 80).length;
  const below60   = pages.filter(p => p.fillPct < 60).length;
  const withViol  = pages.filter(p => p.violations?.length > 0).length;
  const avgFill   = pages.reduce((s, p) => s + p.fillPct, 0) / (totalPages || 1);
  const totalScore= pages.reduce((s, p) => s + (p.score || 0), 0);

  // Non-chapter-end pages with low fill — real mid-chapter problems
  const problemPages = pages.filter(p => {
    if (p.fillPct >= 80) return false;
    const idx = allPages.findIndex(x => x.page === p.page);
    const next = allPages[idx + 1];
    const isChapterEnd = !next || next.blank || !next.chapter || next.chapter !== p.chapter;
    return !isChapterEnd;
  });

  const worstPages = [...pages]
    .sort((a, b) => a.fillPct - b.fillPct)
    .slice(0, 8)
    .map(p => ({ page: p.page, fillPct: p.fillPct, score: p.score, violations: p.violations }));

  // Per-page map for regression detection
  const pageMap = {};
  pages.forEach(p => { pageMap[p.page] = p; });

  return {
    totalPages, perfect, above90, below80, below60,
    withViol, avgFill, totalScore,
    problemPages: problemPages.map(p => ({
      page: p.page, fillPct: p.fillPct, score: p.score,
      chapter: (p.chapter || '').slice(0, 30), violations: p.violations
    })),
    worstPages,
    pageMap,
  };
}

function print(m, label) {
  const pct = (n) => `${(n / m.totalPages * 100).toFixed(1)}%`;
  console.log(`\n=== ${label} ===`);
  console.log(`Content pages total:    ${m.totalPages}`);
  console.log(`100% fill:              ${m.perfect}   (${pct(m.perfect)})`);
  console.log(`≥ 90% fill:             ${m.above90}   (${pct(m.above90)})`);
  console.log(`< 80% fill (any):       ${m.below80}   (${pct(m.below80)})`);
  console.log(`< 60% fill:             ${m.below60}`);
  console.log(`With violations:        ${m.withViol}`);
  console.log(`Avg fill:               ${m.avgFill.toFixed(1)}%`);
  console.log(`Total score (↓ better): ${m.totalScore}`);

  if (m.problemPages.length > 0) {
    console.log(`\nNon-chapter-end pages < 80% (MID-CHAPTER PROBLEMS):`);
    m.problemPages.forEach(p =>
      console.log(`  p${p.page}: ${p.fillPct}%  score=${p.score}  ch="${p.chapter}"  ${JSON.stringify(p.violations)}`)
    );
  } else {
    console.log(`\nNon-chapter-end pages < 80%: none ✅`);
  }

  console.log(`\nWorst pages (fill):`);
  m.worstPages.forEach(p =>
    console.log(`  p${p.page}: ${p.fillPct}%  score=${p.score}`)
  );
}

function compare(before, after) {
  const dScore  = after.totalScore - before.totalScore;
  const dBelow80= after.below80    - before.below80;
  const dAvg    = after.avgFill    - before.avgFill;
  const dProb   = after.problemPages.length - before.problemPages.length;

  const fmt = (n, invert) => {
    const better = invert ? n > 0 : n < 0;
    const worse  = invert ? n < 0 : n > 0;
    const sign   = n > 0 ? '+' : '';
    return `${sign}${n}  ${better ? '✅' : worse ? '❌' : '='}`;
  };
  const fmtF = (n, invert) => {
    const better = invert ? n > 0 : n < 0;
    const worse  = invert ? n < 0 : n > 0;
    const sign   = n > 0 ? '+' : '';
    return `${sign}${n.toFixed(1)}%  ${better ? '✅' : worse ? '❌' : '='}`;
  };

  console.log('\n=== DELTA (current vs baseline) ===');
  console.log(`Total score:            ${fmt(dScore, false)}`);
  console.log(`Pages < 80%:            ${fmt(dBelow80, false)}`);
  console.log(`Problem pages (mid-ch): ${fmt(dProb, false)}`);
  console.log(`Avg fill:               ${fmtF(dAvg, true)}`);

  // Detect regressions: pages that got worse (not in baseline OR fill dropped)
  const beforeProbMap = {};
  before.problemPages.forEach(p => { beforeProbMap[p.page] = p; });
  const newRegressions = after.problemPages.filter(p => {
    const b = before.pageMap[p.page];
    if (!b) return true; // new page with low fill
    return p.fillPct < b.fillPct - 5; // worsened by > 5%
  });
  const fixed = before.problemPages.filter(p => {
    const a = after.pageMap[p.page];
    return !a || a.fillPct >= 80;
  });

  if (fixed.length > 0) {
    console.log(`\n✅ Fixed pages:`);
    fixed.forEach(p => {
      const a = after.pageMap[p.page];
      console.log(`  p${p.page}: ${p.fillPct}% → ${a ? a.fillPct + '%' : 'gone'}`);
    });
  }
  if (newRegressions.length > 0) {
    console.log(`\n❌ Regressions (pages that got worse):`);
    newRegressions.forEach(p => {
      const b = before.pageMap[p.page];
      console.log(`  p${p.page}: ${b ? b.fillPct + '% → ' : '(new) '}${p.fillPct}%`);
    });
  }
  if (newRegressions.length === 0 && fixed.length === 0) {
    console.log('\n= No changes to problem pages');
  }

  // Verdict
  console.log('\n--- VERDICT ---');
  const acceptable = dScore <= 500 && dBelow80 <= 0 && newRegressions.length === 0;
  if (acceptable) {
    console.log('✅ ACCEPTABLE — commit this change');
  } else {
    console.log('❌ CONSIDER REVERTING — see issues above');
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

if (!fs.existsSync(LOG_PATH)) {
  console.error(`pagination-log.json not found at ${LOG_PATH}`);
  console.error('Load the book preview in the browser first to generate the log.');
  process.exit(1);
}

const raw     = JSON.parse(fs.readFileSync(LOG_PATH, 'utf8'));
const current = analyze(raw);
const args    = process.argv.slice(2);

if (args.includes('--save-baseline')) {
  fs.writeFileSync(BASELINE_PATH, JSON.stringify(current, null, 2));
  print(current, 'BASELINE SAVED');
  console.log(`\nSaved → ${BASELINE_PATH}`);

} else if (args.includes('--compare')) {
  if (!fs.existsSync(BASELINE_PATH)) {
    console.error('No baseline found. Run --save-baseline first.');
    process.exit(1);
  }
  const baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));
  print(baseline, 'BASELINE');
  print(current, 'CURRENT');
  compare(baseline, current);

} else {
  print(current, 'CURRENT STATE');
  console.log('\nTip:');
  console.log('  node scripts/compare-pagination.js --save-baseline   save snapshot');
  console.log('  node scripts/compare-pagination.js --compare         diff vs snapshot');
}
