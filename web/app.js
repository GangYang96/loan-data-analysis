(() => {
  'use strict';

  const {
      t,
      esc,
      $
    } = Demo,
    C = LoanCore, R = LoanReporting;
  let previousSource, pageNumber = 1;
  let source = C.sample,
    records = C.validate(C.parseCsv(source)),
    report = null;
  const reasons = {
    DUPLICATE: t('Duplicate ID', '记录编号重复'),
    DATE: t('Invalid calendar date', '日期不存在或格式错误'),
    AMOUNT: t('Invalid amount', '金额格式错误或为负'),
    UNIT: t('Missing unit', '机构为空或过长'),
    ID: t('Invalid ID', '记录编号不合法'),
    COLUMNS: t('Wrong column count', '列数不正确')
  };
  Demo.mount('loan-lab', t('Loan Table Analysis', '贷款表格分析'), t('Loan-table analysis with explicit parameters and source rows.', '贷款表格分析：明确参数、执行计算、保留来源记录。'), `<div class="notice">${t('Public workflow demo inspired by the DB-GPT project description. Fixed query patterns and local tools; no live model, DB-GPT service or real customer data.', '根据 DB-GPT 项目介绍独立实现。使用固定句式与本地计算，不连接模型或 DB-GPT 服务；数据均为虚构样例。')}</div><div class="grid"><div><section class="card"><h2><span class="section-no">01</span>${t('Ask & configure', '提问与参数')}</h2><div class="query"><input id="query" aria-label="${t('Question', '问题')}" value="${t('As of 2026-10-28 overdue 30 days or more', '截至2026-10-28，逾期30天及以上')}"><button class="btn" id="parse">${t('Parse question', '解析问题')}</button></div><div class="controls" style="margin-top:13px"><label>${t('As-of date', '统计日期')}<input id="asOf" type="date" value="2026-10-28"></label><label>${t('Minimum overdue days', '最低逾期天数')}<input id="minDays" type="number" min="1" max="3650" value="30"></label><label>${t('Unit', '机构')}<select id="unit"><option value="all">${t('All units', '全部机构')}</option><option>East</option><option>Central</option><option>West</option></select></label><button class="btn primary" id="run">${t('Run analysis', '执行分析')} →</button></div><div id="error" class="error" role="alert"></div></section><section class="card"><h2><span class="section-no">02</span>${t('Results & source rows', '计算结果与原始记录')}</h2><div class="metrics"><div class="metric"><div class="value" id="hitCount">—</div><div class="label">${t('Matched records', '命中记录')}</div></div><div class="metric"><div class="value" id="balance">—</div><div class="label">${t('Balance · CNY 10,000', '余额合计 · 万元')}</div></div><div class="metric"><div class="value" id="quality">12/12</div><div class="label">${t('Valid / input rows', '有效 / 输入行')}</div></div></div><div class="table-scroll"><table><thead><tr><th>${t('Record', '记录')}</th><th>${t('Unit', '机构')}</th><th>${t('Due', '到期日')}</th><th class="number">${t('Days', '逾期天数')}</th><th class="number">${t('Balance (CNY)', '余额（元）')}</th></tr></thead><tbody id="rows"></tbody></table></div><div class="evidence" id="rowEvidence">${t('Select a matched row to inspect its source.', '点击命中记录，查看原始行及计算依据。')}</div><div class="actions"><button class="btn" id="export" disabled>${t('Export analysis JSON', '导出分析 JSON')}</button><button class="btn" id="verify" disabled>${t('Recheck totals', '重新核对合计')}</button></div><p class="note-bottom">${t('Balances are calculated in integer cents. A rule match is a review signal, not a credit decision.', '金额以整数分计算。规则命中只是待复核信号，不代表信贷判断。')}</p></section></div><aside><section class="card"><h2>${t('Execution trace', '执行过程')}</h2><ol class="steps" id="steps"></ol><div class="step-progress"><i id="progress"></i></div><div id="verification" aria-live="polite"></div></section><section class="card"><h2>${t('Dataset & quality', '样例与数据质量')}</h2><div class="actions"><button class="btn" id="clean">${t('Clean sample', '正常样例')}</button><button class="btn" id="anomaly">${t('Inject errors', '异常样例')}</button><button class="btn" id="downloadCsv">${t('Sample CSV', '下载 CSV')}</button></div><label style="margin-top:12px">${t('Load compatible CSV · up to 1 MB', '导入同格式 CSV · 最大 1 MB')}<input id="file" type="file" accept=".csv,text/csv"></label><p>${t('All processing stays in this browser. No upload.', '所有处理都在当前浏览器中完成，不上传文件。')}</p><div id="qualityIssues"></div></section><section class="card"><h2>${t('Matched balance by unit', '命中余额按机构汇总')}</h2><div id="groups" class="bars"><p>${t('Run the analysis to compare units.', '执行分析后展示机构分布。')}</p></div></section></aside></div>`);
  $('rows').closest('.table-scroll').insertAdjacentHTML('beforebegin', `<div class="controls"><label>${t('Search ID or unit', '搜索编号或机构')}<input id="search" type="search"></label><label>${t('Order', '排序')}<select id="sort"><option value="id">${t('ID', '编号')}</option><option value="balance_cents">${t('Balance', '余额')}</option><option value="days_overdue">${t('Overdue days', '逾期天数')}</option></select></label><label>${t('Direction', '顺序')}<select id="direction"><option value="asc">${t('Ascending', '升序')}</option><option value="desc">${t('Descending', '降序')}</option></select></label></div>`);
  $('rows').closest('.table-scroll').insertAdjacentHTML('afterend', `<div class="actions"><button class="btn" id="prevPage">←</button><span id="pageInfo" aria-live="polite"></span><button class="btn" id="nextPage">→</button></div><p class="hint">${t('Search affects the table only. Totals and exports cover the complete analysis.', '搜索仅影响表格；合计和导出均包含完整分析结果。')}</p>`);
  $('export').insertAdjacentHTML('afterend', `<button class="btn" id="exportCsv" disabled>${t('Export result CSV', '导出结果 CSV')}</button>`);
  document.querySelector('.grid').insertAdjacentHTML('afterend', `<section class="card"><h2>${t('Portfolio aging', '存量账龄分布')}</h2><p>${t('All outstanding balances in the selected unit; not limited by the overdue threshold.', '所选机构的全部未结清余额，不受最低逾期天数筛选影响。')}</p><div id="aging" class="table-scroll"></div></section><section class="card"><h2>${t('Compare dataset snapshots', '前后数据对账')}</h2><p>${t('Compare every record by ID across two complete datasets. Both files must pass validation; removals do not automatically mean repayment.', '按编号对比两份完整数据，两个文件均须通过校验。记录移除不自动等同于已还款；对账不受上方筛选条件影响。')}</p><label>${t('Previous CSV', '前一份 CSV')}<input id="previousFile" type="file" accept=".csv"></label><div class="actions"><button class="btn" id="previousSample">${t('Load previous sample', '载入前一份样例')}</button><button class="btn" id="clearPrevious">${t('Clear comparison', '取消对账')}</button></div><p id="previousStatus"></p><div id="comparison" class="table-scroll" aria-live="polite"></div></section>`);
  function supplements() {
    $('exportCsv').disabled = !report;
    $('aging').innerHTML = report ? `<table><thead><tr><th>${t('Days overdue', '逾期天数')}</th><th>${t('Records', '笔数')}</th><th>${t('Balance (CNY)', '余额（元）')}</th></tr></thead><tbody>${report.aging.buckets.map(b => `<tr><td>${b.band === 'current' ? t('Not overdue', '未逾期') : b.band}</td><td>${b.count}</td><td>${Demo.money(b.balance_cents)}</td></tr>`).join('')}</tbody></table><p>${t('Settled records excluded', '已结清记录单独计数')}：${report.aging.settled_count}</p>` : '';
    const comparison = report?.comparison;
    const labels = { added: t('Added', '新增'), removed: t('Removed', '移除'), changed: t('Changed', '变更') };
    $('comparison').innerHTML = comparison ? `<p>${t('Net balance change', '余额净变动')}：¥${Demo.money(comparison.delta_cents)} · ${t('Unchanged', '未变记录')}：${comparison.unchanged_count}</p><table><thead><tr><th>ID</th><th>${t('Change', '变化')}</th><th>${t('Changed fields', '变更字段')}</th><th>${t('Delta (CNY)', '变动（元）')}</th></tr></thead><tbody>${comparison.changes.slice(0, 100).map(c => `<tr><td>${esc(c.id)}</td><td>${labels[c.kind]}</td><td>${esc(c.fields.join(', '))}</td><td>${Demo.money(c.delta_cents)}</td></tr>`).join('')}</tbody></table><p>${t('Up to 100 changes shown; JSON includes all changes.', '最多展示100条变化，完整变化可导出 JSON。')}</p>` : '';
  }
  function trace(done = 0) {
    const titles = [t('Read & validate', '读取与校验'), t('Resolve parameters', '确定分析参数'), t('Calculate & filter', '计算与筛选'), t('Retain source evidence', '保留原始依据')];
    const descriptions = [`${records.valid.length} ${t('valid rows', '条有效记录')} · ${records.rejected.length} ${t('quarantined', '条隔离记录')}`, `${$('asOf').value} · ≥ ${$('minDays').value} ${t('days', '天')}`, 'max(0, as_of − due_date)', t('Record ID + CSV line + rule', '记录编号 + CSV 行号 + 规则')];
    $('steps').innerHTML = titles.map((title, i) => `<li class="${i < done ? 'done' : ''}"><span class="step-dot">${i < done ? '✓' : i + 1}</span><div><div class="step-title">${title}</div><div class="step-desc">${esc(descriptions[i])}</div></div></li>`).join('');
    $('progress').style.width = done * 25 + '%';
  }
  function display() {
    const paged = R.page(report ? report.hits : records.valid, {search: $('search').value, sort: $('sort').value, direction: $('direction').value, number: pageNumber, size: 10});
    const rows = paged.rows;
    pageNumber = paged.number;
    $('pageInfo').textContent = `${paged.number} / ${paged.pages} · ${paged.total} ${t('records', '条记录')}`;
    $('prevPage').disabled = pageNumber === 1;
    $('nextPage').disabled = pageNumber === paged.pages;
    $('rows').innerHTML = rows.map(r => `<tr data-id="${esc(r.id)}" tabindex="0" role="button" aria-label="${esc(t('Inspect ', '查看 ') + r.id)}"><td class="mono">${esc(r.id)}</td><td>${esc(r.unit)}</td><td>${r.due_date}</td><td class="number">${r.days_overdue ?? '—'}</td><td class="number">${Demo.money(r.balance_cents)}</td></tr>`).join('') || `<tr><td colspan="5" class="empty">${t('No matching records.', '没有匹配记录。')}</td></tr>`;
    $('quality').textContent = `${records.valid.length}/${records.valid.length + records.rejected.length}`;
    $('qualityIssues').innerHTML = records.rejected.length ? `<div class="review warning">${records.rejected.length} ${t('rows excluded from analysis', '条记录已隔离，不参与计算')}</div><ul class="log">${records.rejected.map(r => `<li><span class="mono">L${r.line} · ${esc(r.id)}</span><br>${reasons[r.reason]}</li>`).join('')}</ul>` : `<p><span class="badge">${t('Schema checks passed', '字段校验通过')}</span></p>`;
    if (report) {
      $('hitCount').textContent = report.hit_count;
      $('balance').textContent = (report.hit_balance_cents / 1000000).toFixed(2);
      const max = Math.max(1, ...Object.values(report.groups).map(g => g.balance_cents));
      $('groups').innerHTML = Object.entries(report.groups).map(([u, g]) => `<div class="bar-row"><span>${esc(u)}</span><div class="bar-track"><div class="bar-fill" style="width:${g.balance_cents / max * 100}%"></div></div><span class="number">${(g.balance_cents / 1000000).toFixed(1)}</span></div>`).join('') || `<p>${t('No matches.', '暂无命中。')}</p>`;
    } else {
      $('hitCount').textContent = '—';
      $('balance').textContent = '—';
      $('groups').innerHTML = `<p>${t('Awaiting analysis.', '等待分析。')}</p>`;
    }
    $('export').disabled = !report;
    $('verify').disabled = !report;
    supplements();
  }
  function invalidate() {
    report = null;
    pageNumber = 1;
    $('verification').innerHTML = '';
    $('rowEvidence').textContent = t('Parameters changed. Run the analysis to refresh results.', '参数已改变，请执行分析更新结果。');
    display();
    trace(1);
  }
  function load(text) {
    try {
      const next = C.validate(C.parseCsv(text));
      if (!next.valid.length) throw Error('NO_VALID');
      source = text;
      records = next;
      const units = [...new Set(next.valid.map(r => r.unit))];
      $('unit').innerHTML = `<option value="all">${t('All units', '全部机构')}</option>` + units.map(u => `<option>${esc(u)}</option>`).join('');
      invalidate();
      $('error').textContent = '';
      Demo.toast(t('Dataset loaded', '样例已载入'));
    } catch (e) {
      $('error').textContent = t('CSV rejected: check headers, format and valid records. Previous dataset retained.', 'CSV 读取失败，请检查表头、格式和有效记录；原数据已保留。');
    }
  }
  $('parse').onclick = () => {
    try {
      const p = C.parseQuery($('query').value);
      $('asOf').value = p.asOf;
      $('minDays').value = p.minDays;
      invalidate();
      trace(2);
      $('error').textContent = '';
      Demo.toast(t('Parameters extracted. Review before running.', '参数已解析，请确认后执行。'));
    } catch {
      $('error').textContent = t('Supported example: As of 2026-10-28 overdue 30 days or more. Other conditions can be entered below.', '支持句式示例：截至2026-10-28，逾期30天及以上。其他条件请在下方设置。');
    }
  };
  $('run').onclick = () => {
    try {
      report = R.build(source, {
        asOf: $('asOf').value,
        minDays: Number($('minDays').value),
        unit: $('unit').value
      }, previousSource);
      $('error').textContent = '';
      display();
      trace(4);
      $('rowEvidence').textContent = `${report.scope_count} ${t('rows in scope', '条范围内记录')} → ${report.hit_count} ${t('matches', '条命中')}\n${report.rule}`;
      $('verification').innerHTML = `<div class="review">${t('Analysis completed. Every match retains its source row.', '分析完成，每条结果均保留来源行。')}</div>`;
    } catch (error) {
      report = null;
      display();
      $('error').textContent = error.message === 'RECONCILIATION_REQUIRES_CLEAN_DATA' ? t('Comparison requires two clean datasets. Resolve rejected rows or clear comparison.', '对账要求两份数据均无隔离记录。请修正数据或取消对账。') : t('Use a valid date and an integer threshold between 1 and 3650.', '请输入有效日期及1—3650之间的整数天数。');
    }
  };
  function evidence(id) {
    const r = (report?.hits || records.valid).find(r => r.id === id);
    if (!r) return;
    $('rowEvidence').textContent = `${t('Source', '来源')}: CSV L${r.source_line}\n${r.source_raw}\n${r.days_overdue !== undefined ? `${report.as_of} − ${r.due_date} = ${r.days_overdue} ${t('days', '天')}` : ''}`;
    document.querySelectorAll('#rows tr').forEach(el => el.classList.toggle('selected', el.dataset.id === id));
  }
  $('rows').onclick = e => {
    const tr = e.target.closest('[data-id]');
    if (tr) evidence(tr.dataset.id);
  };
  $('rows').onkeydown = e => {
    if (e.key === 'Enter' || e.key === ' ') {
      const tr = e.target.closest('[data-id]');
      if (tr) {
        e.preventDefault();
        evidence(tr.dataset.id);
      }
    }
  };
  for (const id of ['asOf', 'minDays', 'unit']) $(id).oninput = invalidate;
  $('clean').onclick = () => load(C.sample);
  $('anomaly').onclick = () => load(C.anomaly);
  $('downloadCsv').onclick = () => Demo.download('synthetic-loan-sample.csv', source, 'text/csv;charset=utf-8');
  $('file').onchange = async e => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 1000000) {
        $('error').textContent = t('File exceeds 1 MB.', '文件超过1 MB。');
        return;
      }
      load(await file.text());
    }
    e.target.value = '';
  };
  $('verify').onclick = () => {
    if (!report) return;
    const fresh = C.validate(C.parseCsv(source));
    const matches = fresh.valid.filter(r => (report.unit === 'all' || r.unit === report.unit) && r.balance_cents > 0 && Math.floor((C.dateValue(report.as_of) - C.dateValue(r.due_date)) / 86400000) >= report.minimum_days);
    const total = matches.reduce((s, r) => s + r.balance_cents, 0),
      same = total === report.hit_balance_cents && matches.length === report.hit_count;
    $('verification').innerHTML = `<div class="review ${same ? '' : 'warning'}">${same ? '✓ ' : ''}${t('Rechecked from raw CSV: ', '从原始 CSV 重算：')}${matches.length} ${t('matches', '条')} · ¥${Demo.money(total)}<br>${same ? t('Count and amount agree with the analysis.', '记录数与金额合计与分析结果一致。') : t('Mismatch detected. Rerun the analysis.', '核对不一致，请重新执行分析。')}</div>`;
  };
  $('export').onclick = () => {
    if (report) Demo.download('loan-analysis-demo.json', {
      ...report,
      synthetic: source === C.sample || source === C.anomaly,
      source_type: source === C.sample || source === C.anomaly ? 'bundled_synthetic' : 'user_import',
      validation: {
        input: records.valid.length + records.rejected.length,
        rejected: records.rejected
      },
      scope: 'Independent synthetic workflow demo; no live DB-GPT or model service'
    });
  };
  for (const id of ['search', 'sort', 'direction']) $(id).oninput = () => { pageNumber = 1; display(); };
  $('prevPage').onclick = () => { pageNumber--; display(); };
  $('nextPage').onclick = () => { pageNumber++; display(); };
  $('exportCsv').onclick = () => { if (report) Demo.download('loan-results.csv', R.toCsv(report), 'text/csv;charset=utf-8'); };
  function setPrevious(text, name) {
    const checked = C.validate(C.parseCsv(text));
    if (checked.rejected.length || !checked.valid.length) throw Error('PREVIOUS_INVALID');
    previousSource = text;
    $('previousStatus').textContent = `${name} · ${checked.valid.length} ${t('records', '条记录')}`;
    invalidate();
  }
  $('previousFile').onchange = async event => {
    const file = event.target.files[0];
    try { if (file) { if (file.size > 1000000) throw Error('SIZE'); setPrevious(await file.text(), file.name); } }
    catch { Demo.toast(t('Previous CSV rejected. Use valid rows and a file under 1 MB.', '前一份 CSV 无效，请检查数据，文件须小于1 MB。')); }
    event.target.value = '';
  };
  $('previousSample').onclick = () => setPrevious(C.sample.replace('125000.00', '130000.00').replace(/\nDEMO-012[^\n]*/, '') + '\nDEMO-OLD,West,2026-09-01,1000.00', t('Synthetic previous snapshot', '合成前期数据'));
  $('clearPrevious').onclick = () => { previousSource = undefined; $('previousStatus').textContent = ''; invalidate(); };
  display();
  trace(1);
})();
