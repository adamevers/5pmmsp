import { test } from 'node:test';
import assert from 'node:assert/strict';
import { categoryName, priceLabel, hoodName } from '../src/lib/data.js';

test('priceLabel', () => {
  assert.equal(priceLabel(1), '$');
  assert.equal(priceLabel(3), '$$$');
  assert.equal(priceLabel(4), '$$$$');
  assert.equal(priceLabel(0), '');
  assert.equal(priceLabel(null), '');
  assert.equal(priceLabel(9), '');
});

test('categoryName', () => {
  assert.equal(categoryName('dive-bar'), 'Dive Bar');
  assert.equal(categoryName('bar-restaurant'), 'Bar & Restaurant');
  assert.equal(categoryName('nope'), '');
});

test('hoodName falls back to slug', () => {
  assert.equal(hoodName('nordeast'), 'Nordeast');
  assert.equal(hoodName('unknown-slug'), 'unknown-slug');
});
