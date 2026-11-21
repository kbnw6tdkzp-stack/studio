import { test } from 'node:test'
import assert from 'node:assert/strict'
import { checkVin } from './vin.ts'

test('valid VIN passes check digit', () => {
  const r = checkVin('1HGCM82633A004352')
  assert.equal(r.ok, true)
  assert.equal(r.message, '')
})
test('wrong length', () => assert.equal(checkVin('1HGCM8263').ok, false))
test('O and I are corrected', () => assert.equal(checkVin('1HGCM82633AOO4352').vin, '1HGCM82633A004352'))
