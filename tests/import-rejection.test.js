import { test, expect } from 'vitest';
import { MemoryEntityRepository } from '../src/data/entity-repository.js';
import { PantryService } from '../src/domain/pantry-service.js';
import { executePantryCommand } from '../src/server/pantry-commands.js';
import { parseCfdi } from '../src/domain/cfdi-parser.js';
import { cfdiFixture } from './fixtures/cfdi.js';
import { COMPANY_RFC } from '../src/data/initial-state.js';

test.each([
  { receiver: 'OTR010101AAA' },
  { receiver: COMPANY_RFC, issuer: COMPANY_RFC },
  { receiver: 'OTR010101AAA', uuid: false },
  { receiver: COMPANY_RFC, issuer: COMPANY_RFC, uuid: false },
  { type: 'P' }
])('el comando de servidor no guarda XML ajeno ni usa cuarentena para admitirlo: %j', async options => {
  const repository = new MemoryEntityRepository();
  await new PantryService(repository).initialize();
  const before = await repository.exportSnapshot();
  const result = await executePantryCommand(repository,
    { uid: 'editor-test', token: { forxActive: true, forxRole: 'editor' } },
    { command: 'importXML', input: { period: '2026-09', files: [{ name: 'private-name.xml', content: cfdiFixture(options) }] } });
  expect(result.counts.ineligible).toBe(1);
  const after = await repository.exportSnapshot();
  for (const name of Object.keys(before).filter(name => !['batches', 'audit'].includes(name))) {
    expect(after[name], name).toEqual(before[name]);
  }
  expect(JSON.stringify(after)).not.toContain('private-name.xml');
  expect(JSON.stringify(after)).not.toContain('OTR010101AAA');
});

test('el parser no acepta un receptor ajeno por sustitución de companyRfc', async () => {
  const result = await parseCfdi(cfdiFixture({ receiver: 'OTR010101AAA' }), { companyRfc: 'OTR010101AAA' });
  expect(result.document.elegibilidad.candidate).toBe(false);
});
