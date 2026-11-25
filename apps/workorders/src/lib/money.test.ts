import { test } from 'node:test'
import assert from 'node:assert/strict'
import { totals, priceFromCost } from './money.ts'
import type { WorkOrderData } from './types.ts'

const base = (): WorkOrderData => ({
  complaint: '', findings: '', notes: '', mileageIn: '',
  diag: { hours: 1, rate: 160, waived: false, creditToRepair: false },
  jobs: [], fees: [],
  tax: { name: 'CA', rate: 8.75, taxParts: true, taxLabor: false, taxFees: false },
  terms: { diagnosis: '', repair: '', general: '' }, payments: [],
})

test('diagnosis only', () => {
  const t = totals(base())
  assert.equal(t.total, 160)
  assert.equal(t.tax, 0)
})

test('parts taxed, labor not, disposal fee not taxed', () => {
  const d = base()
  d.jobs.push({ id: 'j', title: 'Brakes', notes: '', laborHours: 2, laborRate: 160,
    parts: [{ id: 'p', desc: 'Pads', partNo: '', qty: 1, cost: 60, price: 100 }] })
  d.fees.push({ id: 'f', name: 'Disposal', amount: 10, taxable: false })
  const t = totals(d)
  assert.equal(t.parts, 100)
  assert.equal(t.labor, 320)
  assert.equal(t.tax, 8.75)
  assert.equal(t.total, 160 + 100 + 320 + 10 + 8.75)
  assert.equal(t.partsCost, 60)
})

test('diagnosis credited toward repair', () => {
  const d = base()
  d.diag.creditToRepair = true
  d.jobs.push({ id: 'j', title: 'x', notes: '', laborHours: 1, laborRate: 160, parts: [] })
  assert.equal(totals(d).total, 160)
})

test('markup', () => {
  assert.equal(priceFromCost(45.5, 30), 59.15)
})

test('card processing fee is never taxed, even where fees are taxed', () => {
  const d = base()
  d.tax.taxFees = true
  d.fees.push({ id: 'f', name: 'Shop supplies', amount: 10, taxable: true })
  d.fees.push({ id: 'c', name: 'Card fee', amount: 5, taxable: false, card: true })
  const t = totals(d)
  assert.equal(t.taxable, 10)
  assert.equal(t.total, 160 + 10 + 5 + 0.88)
})
