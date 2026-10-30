const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const C = require('../src/core.js'), R = require('../src/reporting.js');
const options = { asOf: '2026-10-28', minDays: 30 };
const rows = csv => C.validate(C.parseCsv(csv)).valid;
test('aging bands partition outstanding balances with inclusive boundaries', () => {
  const dates = ['2026-10-29','2026-10-28','2026-10-27','2026-09-28','2026-09-27','2026-08-29','2026-08-28','2026-07-30','2026-07-29'];
  const csv = 'id,unit,due_date,balance\n' + dates.map((d,i) => `A${i},East,${d},1.01`).join('\n') + '\nZERO,East,2026-01-01,0';
  const report = R.aging(rows(csv), options);
  assert.deepEqual(report.buckets.map(b=>b.count), [2,2,2,2,1]);
  assert.equal(report.outstanding_cents,909); assert.equal(report.settled_count,1);
});
test('aging respects unit scope and remains independent of hit threshold', () => {
  const report = R.build(C.sample, { ...options, unit:'West', minDays:3000 });
  assert.equal(report.hit_count,0);
  assert.equal(report.aging.outstanding_cents,33700025);
});
test('snapshot comparison reconciles additions, removals, field changes and net cents', () => {
  const header='id,unit,due_date,balance\n';
  const before=rows(header+'A,East,2026-01-01,10\nB,West,2026-01-01,20\nC,East,2026-01-01,3');
  const after=rows(header+'A,Central,2026-01-02,8\nC,East,2026-01-01,3\nD,East,2026-01-01,15');
  const diff=R.compare(before,after);
  assert.deepEqual(diff.changes.map(c=>[c.id,c.kind,c.delta_cents]),[['A','changed',-200],['B','removed',-2000],['D','added',1500]]);
  assert.equal(diff.delta_cents,-700);assert.equal(diff.unchanged_count,1);
  assert.equal(diff.changes.reduce((sum,c)=>sum+c.delta_cents,0),diff.delta_cents);
});
test('comparison refuses quarantined input instead of inventing a removal', () => {
  assert.throws(()=>R.build(C.sample,options,C.anomaly),/RECONCILIATION_REQUIRES_CLEAN_DATA/);
  assert.throws(()=>R.build(C.anomaly,options,C.sample),/RECONCILIATION_REQUIRES_CLEAN_DATA/);
  assert.doesNotThrow(()=>R.build(C.anomaly,options));
});
test('search, stable sorting and clamped pagination do not mutate source rows', () => {
  const source=rows(C.sample), before=JSON.stringify(source);
  const page=R.page(source,{search:'east',sort:'balance_cents',direction:'desc',number:99,size:2});
  assert.equal(page.number,2);assert.equal(page.total,4);
  assert.deepEqual(page.rows.map(r=>r.id),['DEMO-002','DEMO-010']);
  assert.equal(JSON.stringify(source),before);
  assert.throws(()=>R.page(source,{size:0}));
});
test('CSV export quotes commas/newlines and neutralizes spreadsheet formulas', () => {
  const report=R.build('id,unit,due_date,balance\nA,"  =SUM(1,2)",2026-01-01,0.01',options);
  const csv=R.toCsv(report);
  assert.ok(csv.startsWith('\uFEFFid,unit'));assert.ok(csv.includes('"\'  =SUM(1,2)"'));
  assert.ok(csv.includes('"1","2"'));assert.equal(report.hits[0].unit,'  =SUM(1,2)');
});
test('CLI emits CSV or a reconciled JSON report and rejects unknown formats', () => {
  const args=['scripts/analyze.cjs','--input','examples/loans.csv','--as-of','2026-10-28','--min-days','30'];
  const run=extra=>spawnSync(process.execPath,[...args,...extra],{cwd:path.resolve(__dirname,'..'),encoding:'utf8'});
  const csv=run(['--format','csv']);assert.equal(csv.status,0,csv.stderr);assert.ok(csv.stdout.startsWith('\uFEFFid,unit'));
  const diff=run(['--previous','examples/loans-previous.csv']);assert.equal(diff.status,0,diff.stderr);assert.equal(JSON.parse(diff.stdout).comparison.delta_cents,2900000);
  assert.equal(run(['--format','html']).status,1);
});
