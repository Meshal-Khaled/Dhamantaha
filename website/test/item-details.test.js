import test from 'node:test';
import assert from 'node:assert/strict';
import { deadlineText, endedPolicy } from '../src/lib/policy-labels.js';
import { explainWarranty } from '../src/lib/api.js';

test('expired labels omit elapsed-day counts and retain distinct return/refund wording', () => {
  assert.equal(deadlineText(-1026), 'Expired');
  assert.equal(deadlineText(-1, true), 'منتهي');
  assert.equal(deadlineText(0), 'Last day');
  assert.equal(deadlineText(52), '52 days left');
  assert.equal(endedPolicy('return'), 'Return ended');
  assert.equal(endedPolicy('refund'), 'Refund ended');
  assert.equal(endedPolicy('exchange'), 'Exchange ended');
});

test('terms upload sends one attachment and language without uploading the item photo', async () => {
  const file = new File(['terms'], 'terms.pdf', { type: 'application/pdf' });
  const result = await explainWarranty({ baseUrl: 'https://example.test/v1/', clientKey: 'test-key', file, product: 'Laptop', language: 'ar' }, { fetchImpl: async (url, init) => {
    assert.equal(url, 'https://example.test/v1/warranty/explain');
    assert.deepEqual([...init.body.keys()], ['file', 'product', 'language']);
    assert.equal(init.body.get('file').name, 'terms.pdf');
    assert.equal(init.body.get('language'), 'ar');
    assert.equal(init.headers['X-Client-Key'], 'test-key');
    return new Response(JSON.stringify({ coverage: { sourceText: 'terms', covered: [], excluded: [], unclear: [] } }), { status: 200 });
  } });
  assert.equal(result.body.coverage.sourceText, 'terms');
});
