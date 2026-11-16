import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDiarySnapshot } from './snapshot-parser.mjs';

const input = () => ({
  siteKey: 'seaham', tab: 'Service & Repairs', date: '2026-11-16',
  capturedAt: '2026-11-16T06:30:00Z',
  headings: ['Time', 'Notes', 'Status', 'Modified', 'User', 'Bay', 'Type', 'MOT', 'Customer'],
  rows: [
    ['08:30', '', 'NONE', '', '', 'WORKSHOP', 'Servicing/Repairs', '', ''],
    ['08:30', '', 'NONE', '', '', 'WORKSHOP', 'Full Service', '', 'EXAMPLE CUSTOMER'],
    ['09:15', 'OIL', 'NONE', '', '', 'WORKSHOP', 'Full Service', '', 'SECOND EXAMPLE']
  ]
});

test('retains multiple slots at the same time and does not infer booked/available from colour', () => {
  const result = normalizeDiarySnapshot(input());
  assert.equal(result.slotCount, 3);
  assert.deepEqual(result.rows.map(r => r.time), ['08:30', '08:30', '09:15']);
  assert.equal(result.rows[1].customer, 'EXAMPLE CUSTOMER');
  assert.equal('availability' in result.rows[1], false);
});

test('rejects missing headings (rather than trusting an incomplete scrape)', () => {
  const sample = input(); sample.headings[8] = 'Other';
  assert.throws(() => normalizeDiarySnapshot(sample), /Expected VGM diary headings absent/);
});

test('rejects invalid dates and incomplete rows', () => {
  const sample = input(); sample.date = '2026-02-30';
  assert.throws(() => normalizeDiarySnapshot(sample), /Invalid date/);
  const sample2 = input(); sample2.rows[0] = ['08:30'];
  assert.throws(() => normalizeDiarySnapshot(sample2), /Unexpected column count/);
});
