/* Portfolio reports share the same cents/date rules as the analysis engine. */
(function (root) {
  'use strict';
  const C = typeof module !== 'undefined' && module.exports ? require('./core.js') : root.LoanCore;
  const bands = [
    { id: 'current', min: 0, max: 0 },
    { id: '1-30', min: 1, max: 30 },
    { id: '31-60', min: 31, max: 60 },
    { id: '61-90', min: 61, max: 90 },
    { id: '91+', min: 91, max: Infinity }
  ];

  function aging(rows, { asOf, unit = 'all' }) {
    const day = C.dateValue(asOf);
    const buckets = bands.map(b => ({ band: b.id, count: 0, balance_cents: 0 }));
    let settled = 0;
    for (const row of rows.filter(r => unit === 'all' || r.unit === unit)) {
      if (!row.balance_cents) { settled++; continue; }
      const days = Math.max(0, (day - C.dateValue(row.due_date)) / 86400000);
      const bucket = buckets[bands.findIndex(b => days >= b.min && days <= b.max)];
      bucket.count++;
      bucket.balance_cents += row.balance_cents;
    }
    return { as_of: asOf, unit, buckets, settled_count: settled,
      outstanding_cents: buckets.reduce((sum, b) => sum + b.balance_cents, 0) };
  }

  function compare(previous, current) {
    const before = new Map(previous.map(row => [row.id, row]));
    const after = new Map(current.map(row => [row.id, row]));
    if (before.size !== previous.length || after.size !== current.length) throw Error('DUPLICATE');
    const changes = [];
    for (const id of [...new Set([...before.keys(), ...after.keys()])].sort()) {
      const a = before.get(id), b = after.get(id);
      const fields = a && b ? ['unit', 'due_date', 'balance_cents'].filter(key => a[key] !== b[key]) : [];
      if (a && b && !fields.length) continue;
      changes.push({ id, kind: !a ? 'added' : !b ? 'removed' : 'changed', fields,
        delta_cents: (b?.balance_cents || 0) - (a?.balance_cents || 0), before: a || null, after: b || null });
    }
    const total = rows => rows.reduce((sum, row) => sum + row.balance_cents, 0);
    return { previous_count: previous.length, current_count: current.length,
      previous_balance_cents: total(previous), current_balance_cents: total(current),
      delta_cents: total(current) - total(previous),
      unchanged_count: current.filter(row => before.has(row.id)).length - changes.filter(c => c.kind === 'changed').length,
      changes };
  }

  function build(source, options, previousSource) {
    const records = C.validate(C.parseCsv(source));
    const report = C.analyze(records.valid, options);
    const synthetic = [C.sample, C.anomaly].includes(source.trim());
    const result = { ...report, schema_version: 2, synthetic,
      source_type: synthetic ? 'bundled_synthetic' : 'user_input',
      validation: { input: records.valid.length + records.rejected.length, valid: records.valid.length, rejected: records.rejected },
      aging: aging(records.valid, options) };
    if (previousSource !== undefined) {
      const prior = C.validate(C.parseCsv(previousSource));
      // A quarantined row can masquerade as a removal/addition. Fail closed for reconciliation.
      if (prior.rejected.length || records.rejected.length) throw Error('RECONCILIATION_REQUIRES_CLEAN_DATA');
      result.comparison = { ...compare(prior.valid, records.valid), scope: 'all valid records; independent of analysis filters' };
    }
    return result;
  }

  function page(rows, { search = '', sort = 'id', direction = 'asc', number = 1, size = 20 } = {}) {
    if (!['id', 'unit', 'due_date', 'balance_cents', 'days_overdue'].includes(sort) || !['asc', 'desc'].includes(direction) ||
      !Number.isInteger(number) || number < 1 || !Number.isInteger(size) || size < 1 || size > 100) throw Error('PAGE_OPTIONS');
    const query = String(search).toLowerCase();
    const matched = rows.filter(row => `${row.id} ${row.unit}`.toLowerCase().includes(query));
    const sign = direction === 'asc' ? 1 : -1;
    matched.sort((a, b) => {
      const x = a[sort] ?? 0, y = b[sort] ?? 0;
      return (x < y ? -1 : x > y ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0) * sign;
    });
    const pages = Math.max(1, Math.ceil(matched.length / size)), current = Math.min(number, pages);
    return { rows: matched.slice((current - 1) * size, current * size), total: matched.length, pages, number: current };
  }

  // Prefix spreadsheet formulas before RFC-4180 quoting; retain exact numeric cents separately.
  function csvCell(value) {
    let text = String(value ?? '');
    if (/^[\s\uFEFF]*[=+@-]/.test(text) || /^[\t\r\n]/.test(text)) text = "'" + text;
    return '"' + text.replace(/"/g, '""') + '"';
  }
  function toCsv(report) {
    const fields = ['id', 'unit', 'due_date', 'days_overdue', 'balance_cents', 'source_line'];
    return '\uFEFF' + [fields.join(','), ...report.hits.map(row => fields.map(key => csvCell(row[key])).join(','))].join('\r\n') + '\r\n';
  }
  const api = { aging, compare, build, page, toCsv };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.LoanReporting = api;
})(typeof window !== 'undefined' ? window : globalThis);
