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

import { extractVin } from './vin.ts'
test('extract: plain', () => assert.equal(extractVin('1HGCM82633A004352'), '1HGCM82633A004352'))
test('extract: Code 39 import prefix', () => assert.equal(extractVin('I1HGCM82633A004352'), '1HGCM82633A004352'))
test('extract: buried in other text', () => assert.equal(extractVin('REG|CA|1HGCM82633A004352|2003|HOND'), '1HGCM82633A004352'))
test('extract: nothing', () => assert.equal(extractVin('HELLO WORLD'), null))
