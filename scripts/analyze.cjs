const R = require('../src/reporting.js');
const {options, read, emit, main} = require('./common.cjs');
main(() => {
  const args = options(process.argv.slice(2), ['input','as-of','min-days','unit','previous','format','output'], ['help']);
  if (args.help) { console.log('node scripts/analyze.cjs --input FILE --as-of YYYY-MM-DD --min-days N [--unit NAME] [--previous CSV_FILE] [--format json|csv] [--output NEW_FILE]'); return; }
  if (!args['as-of'] || !args['min-days']) throw Error('Provide --as-of and --min-days');
  if (!['json', 'csv'].includes(args.format || 'json')) throw Error('Format must be json or csv');
  const report = R.build(read(args.input, 1000000), {asOf:args['as-of'], minDays:Number(args['min-days']), unit:args.unit ?? 'all'}, args.previous ? read(args.previous, 1000000) : undefined);
  emit(args.format === 'csv' ? R.toCsv(report) : report, args.output);
});
