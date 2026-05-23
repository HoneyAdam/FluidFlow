import { readFileSync } from 'fs';
const files = [
  'projectContext','projectHealth','promptHistory','promptTemplateStorage',
  'analyticsStorage','conversationContext','contextCompaction','contextExport',
  'promptTemplates','tokenCostEstimator','screenshotService','snippetLibrary',
  'webcontainer','version','providerStorage'
];
for (const f of files) {
  const c = readFileSync(`services/${f}.ts`, 'utf8');
  const lines = c.split('\n').filter(l => l.includes('export'));
  console.log(`=== ${f} ===`);
  for (const l of lines) console.log('  ' + l.trim());
}
