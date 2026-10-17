const fs = require('fs');
const path = require('path');

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(function(file) {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) results = results.concat(walk(file));
    else results.push(file);
  });
  return results;
}

function shouldCheckFile(file) {
  return file.endsWith('.ts') || file.endsWith('.js');
}

const base = path.join(__dirname, '..');
const files = walk(base).filter(shouldCheckFile).filter(f => f.includes(path.sep + 'backend' + path.sep) || f.includes(path.sep + 'routes' + path.sep) || f.includes(path.sep + 'lib' + path.sep));

let failures = [];
for (const file of files) {
  const content = fs.readFileSync(file, 'utf8');
  if (content.includes('supabaseAdmin.from(') && content.includes('.select(')) {
    // If file uses secureFrom, executeDataQuery, or executeRpc, allow it.
    if (content.includes('secureFrom(') || content.includes('executeDataQuery(') || content.includes('executeRpc(')) continue;

    const hasCompanyEq = content.includes('.eq("company_id"') || content.includes(".eq('company_id'")
    const hasOutletIn = content.includes('.in("outlet_id"') || content.includes(".in('outlet_id'")

    if (!hasCompanyEq || !hasOutletIn) {
      failures.push({ file, reason: 'Missing company_id or outlet_id filter or missing secureFrom/executeDataQuery usage' })
    }
  }
}

if (failures.length) {
  console.error('\nAPI filter check failed. The following files violate the rule:');
  failures.forEach(f => console.error(`${f.file}: ${f.reason}`));
  process.exit(2);
}

console.log('API filter check passed.');
process.exit(0);
