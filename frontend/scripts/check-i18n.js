#!/usr/bin/env node
/**
 * i18n key synchronization checker
 * 
 * Validates that all locale files (ar.json, sw.json) have the same keys as en.json.
 * Exits with code 1 if any locale is missing keys or has extra keys.
 */

const fs = require('fs');
const path = require('path');

const LOCALE_DIR = path.join(__dirname, '../src/i18n');
const BASE_LOCALE = 'en';

function getAllKeys(obj, prefix = '') {
  const keys = [];
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      keys.push(...getAllKeys(value, fullKey));
    } else {
      keys.push(fullKey);
    }
  }
  return keys;
}

function main() {
  const enPath = path.join(LOCALE_DIR, `${BASE_LOCALE}.json`);
  const enData = JSON.parse(fs.readFileSync(enPath, 'utf-8'));
  const enKeys = new Set(getAllKeys(enData));

  const locales = fs.readdirSync(LOCALE_DIR)
    .filter(file => file.endsWith('.json') && file !== `${BASE_LOCALE}.json` && file !== 'index.js')
    .map(file => file.replace('.json', ''));

  let hasErrors = false;

  for (const locale of locales) {
    const localePath = path.join(LOCALE_DIR, `${locale}.json`);
    const localeData = JSON.parse(fs.readFileSync(localePath, 'utf-8'));
    const localeKeys = new Set(getAllKeys(localeData));

    const missing = [...enKeys].filter(k => !localeKeys.has(k));
    const extra = [...localeKeys].filter(k => !enKeys.has(k));

    if (missing.length > 0) {
      hasErrors = true;
      console.error(`\n❌ ${locale}.json is missing ${missing.length} key(s):`);
      missing.forEach(key => console.error(`   - ${key}`));
    }

    if (extra.length > 0) {
      hasErrors = true;
      console.error(`\n❌ ${locale}.json has ${extra.length} extra key(s) not in ${BASE_LOCALE}.json:`);
      extra.forEach(key => console.error(`   - ${key}`));
    }

    if (missing.length === 0 && extra.length === 0) {
      console.log(`✅ ${locale}.json is in sync with ${BASE_LOCALE}.json (${localeKeys.size} keys)`);
    }
  }

  if (hasErrors) {
    console.error('\n❌ i18n keys are out of sync. Please fix the issues above.');
    process.exit(1);
  } else {
    console.log(`\n✅ All locale files are in sync with ${BASE_LOCALE}.json`);
    process.exit(0);
  }
}

main();
