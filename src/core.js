/* Independent loan-table workflow. No model or DB-GPT connection. Money stays in integer cents; CSV evidence retains physical line numbers and exact source text. */
(function (root) {
  'use strict';

  const COLUMNS = ['id', 'unit', 'due_date', 'balance'];
  function dateValue(s) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw Error('DATE');
    const value = Date.parse(s + 'T00:00:00Z');
    if (!Number.isFinite(value) || new Date(value).toISOString().slice(0, 10) !== s) throw Error('DATE');
    return value;
  }
  function parseCsv(text) {
    if (typeof text !== 'string' || text.length > 1000000) throw Error('SIZE');
    const rows = [];
    let cells = [],
      field = '',
      quoted = false,
      closed = false;
    let line = 1,
      rowLine = 1,
      rowOffset = 0;
    function finish(end) {
      cells.push(field);
      if (cells.some(value => value !== '')) rows.push({
        cells,
        line: rowLine,
        raw: text.slice(rowOffset, end)
      });
      cells = [];
      field = '';
      closed = false;
    }
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (quoted) {
        if (c === '"') {
          if (text[i + 1] === '"') {
            field += '"';
            i++;
          } else {
            quoted = false;
            closed = true;
          }
        } else {
          field += c;
          if (c === '\n' || c === '\r' && text[i + 1] !== '\n') line++;
        }
        continue;
      }
      if (c === '"') {
        if (field || closed) throw Error('CSV');
        quoted = true;
      } else if (c === ',') {
        cells.push(field);
        field = '';
        closed = false;
      } else if (c === '\n' || c === '\r') {
        finish(i);
        if (c === '\r' && text[i + 1] === '\n') i++;
        line++;
        rowLine = line;
        rowOffset = i + 1;
      } else {
        if (closed) throw Error('CSV');
        field += c;
      }
    }
    if (quoted) throw Error('CSV');
    if (field || cells.length || closed) finish(text.length);
    if (!rows.length) throw Error('EMPTY');
    rows[0].cells[0] = rows[0].cells[0].replace(/^\uFEFF/, '');
    if (rows[0].cells.join(',') !== COLUMNS.join(',')) throw Error('HEADERS');
    if (rows.length > 10001) throw Error('SIZE');
    return rows.slice(1);
  }
  function validate(raw) {
    const valid = [],
      rejected = [],
      seen = new Set();
    for (const {
      cells,
      line,
      raw: sourceRaw
    } of raw) {
      let reason = '';
      const [id, unit, due, balance] = cells;
      if (cells.length !== 4) reason = 'COLUMNS';else if (!/^[A-Za-z0-9_-]{1,50}$/.test(id)) reason = 'ID';else if (seen.has(id)) reason = 'DUPLICATE';else if (!unit || unit.length > 50) reason = 'UNIT';else {
        try {
          dateValue(due);
        } catch {
          reason = 'DATE';
        }
        if (!reason && !/^\d{1,9}(\.\d{1,2})?$/.test(balance)) reason = 'AMOUNT';
      }
      if (reason) rejected.push({
        line,
        id: id || '—',
        reason
      });else {
        seen.add(id);
        const [whole, decimal = ''] = balance.split('.');
        valid.push({
          id,
          unit,
          due_date: due,
          balance_cents: Number(whole) * 100 + Number(decimal.padEnd(2, '0')),
          source_line: line,
          source_raw: sourceRaw
        });
      }
    }
    return {
      valid,
      rejected
    };
  }
  function analyze(rows, {
    asOf,
    minDays,
    unit = 'all'
  }) {
    const day = dateValue(asOf);
    if (!Number.isInteger(minDays) || minDays < 1 || minDays > 3650) throw Error('THRESHOLD');
    const scope = rows.filter(r => unit === 'all' || r.unit === unit);
    const evaluated = scope.map(r => ({
      ...r,
      days_overdue: Math.max(0, Math.floor((day - dateValue(r.due_date)) / 86400000))
    }));
    const hits = evaluated.filter(r => r.days_overdue >= minDays && r.balance_cents > 0);
    const sum = a => a.reduce((s, r) => s + r.balance_cents, 0);
    const groups = Object.create(null);
    for (const r of hits) {
      const g = groups[r.unit] || (groups[r.unit] = {
        count: 0,
        balance_cents: 0
      });
      g.count++;
      g.balance_cents += r.balance_cents;
    }
    return {
      as_of: asOf,
      minimum_days: minDays,
      unit,
      scope_count: scope.length,
      scope_balance_cents: sum(scope),
      hits,
      hit_count: hits.length,
      hit_balance_cents: sum(hits),
      groups,
      rule: 'days_overdue >= minimum_days AND balance_cents > 0',
      synthetic: true
    };
  }
  function parseQuery(q) {
    const patterns = [/^截至\s*(\d{4}-\d{2}-\d{2})[，,\s]*逾期\s*(\d+)\s*天(?:及以上|以上)$/i, /^as of\s+(\d{4}-\d{2}-\d{2})[,:\s]+overdue\s+(\d+)\s*days?\s*(?:or more|\+)$/i];
    const match = patterns.map(p => p.exec(q.trim())).find(Boolean);
    if (!match) throw Error('QUERY');
    dateValue(match[1]);
    const minDays = Number(match[2]);
    if (minDays < 1 || minDays > 3650) throw Error('THRESHOLD');
    return {
      asOf: match[1],
      minDays
    };
  }
  const sample = 'id,unit,due_date,balance\nDEMO-001,East,2026-08-10,125000.00\nDEMO-002,East,2026-10-20,86000.00\nDEMO-003,Central,2026-09-12,250000.50\nDEMO-004,West,2026-07-01,96000.25\nDEMO-005,Central,2026-10-05,78000.00\nDEMO-006,East,2026-08-25,168000.00\nDEMO-007,West,2026-11-15,138000.00\nDEMO-008,Central,2026-09-01,54000.00\nDEMO-009,West,2026-10-01,68000.00\nDEMO-010,East,2026-06-15,0.00\nDEMO-011,Central,2026-09-20,42000.00\nDEMO-012,West,2026-10-26,35000.00';
  const anomaly = sample + '\nDEMO-003,Central,2026-09-12,250000.50\nDEMO-013,East,2026-02-30,88000.00\nDEMO-014,West,2026-08-01,-120.00';
  const api = {
    parseCsv,
    validate,
    analyze,
    parseQuery,
    dateValue,
    sample,
    anomaly
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;else root.LoanCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
