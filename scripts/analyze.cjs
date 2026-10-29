const C = require('../src/core.js');
const {options, read, emit, main} = require('./common.cjs');
main(() => {
  const args = options(process.argv.slice(2), ['input','as-of','min-days','unit','output'], ['help']);
  if (args.help) { console.log('node scripts/analyze.cjs --input FILE --as-of YYYY-MM-DD --min-days N [--unit NAME] [--output NEW_FILE]'); return; }
  if (!args['as-of'] || !args['min-days']) throw Error('Provide --as-of and --min-days');
  const raw = read(args.input, 1000000), records = C.validate(C.parseCsv(raw));
  const report = C.analyze(records.valid, {asOf:args['as-of'], minDays:Number(args['min-days']), unit:args.unit ?? 'all'});
  const synthetic = [C.sample, C.anomaly].includes(raw.trim());
  emit({...report, synthetic, source_type:synthetic?'bundled_synthetic':'user_input', validation:{input:records.valid.length+records.rejected.length, valid:records.valid.length, rejected:records.rejected}}, args.output);
});
