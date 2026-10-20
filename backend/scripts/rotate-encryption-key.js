#!/usr/bin/env node
/**
 * Encryption key rotation script for custodial Stellar seed phrases.
 * 
 * This script re-encrypts all users.stellar_mnemonic values with the current
 * ENCRYPTION_SECRET when ENCRYPTION_SECRET_OLD is set.
 * 
 * Prerequisites:
 *   1. Set ENCRYPTION_SECRET_OLD to the current encryption key
 *   2. Set ENCRYPTION_SECRET to the new encryption key
 *   3. Both keys must be set for rotation to proceed
 * 
 * Usage:
 *   node scripts/rotate-encryption-key.js [--dry-run]
 * 
 * Options:
 *   --dry-run    Show what would be rotated without making changes
 * 
 * After successful rotation, you can remove ENCRYPTION_SECRET_OLD from your
 * environment. The old key will no longer be needed for decryption.
 * 
 * #1464 BE-20
 */

'use strict';

require('dotenv').config();
const { encrypt, decrypt, needsReEncryption, getOldSecret } = require('../src/utils/crypto');

const isDryRun = process.argv.includes('--dry-run');

async function main() {
  console.log('=== Encryption Key Rotation Script ===\n');
  
  // Verify prerequisites
  if (!process.env.ENCRYPTION_SECRET) {
    console.error('ERROR: ENCRYPTION_SECRET is not set');
    process.exit(1);
  }
  
  if (!getOldSecret()) {
    console.error('ERROR: ENCRYPTION_SECRET_OLD is not set');
    console.error('To rotate keys:');
    console.error('  1. Set ENCRYPTION_SECRET_OLD to your current key');
    console.error('  2. Set ENCRYPTION_SECRET to your new key');
    console.error('  3. Run this script');
    process.exit(1);
  }
  
  console.log('✓ Both ENCRYPTION_SECRET and ENCRYPTION_SECRET_OLD are set');
  if (isDryRun) {
    console.log('✓ DRY RUN mode - no changes will be made\n');
  } else {
    console.log('✓ LIVE mode - records will be re-encrypted\n');
  }
  
  // Initialize database
  const db = require('../src/db/schema');
  
  let adapter;
  if (db.isPostgres) {
    console.log('Using PostgreSQL adapter\n');
    adapter = {
      select: async () => {
        const { rows } = await db.query(
          'SELECT id, stellar_mnemonic FROM users WHERE stellar_mnemonic IS NOT NULL'
        );
        return rows;
      },
      update: async (id, value) => {
        await db.query(
          'UPDATE users SET stellar_mnemonic = $1 WHERE id = $2',
          [value, id]
        );
      },
      close: async () => {
        if (db.pool) await db.pool.end();
      }
    };
  } else {
    console.log('Using SQLite adapter\n');
    adapter = {
      select: () => {
        return db.prepare(
          'SELECT id, stellar_mnemonic FROM users WHERE stellar_mnemonic IS NOT NULL'
        ).all();
      },
      update: (id, value) => {
        db.prepare('UPDATE users SET stellar_mnemonic = ? WHERE id = ?').run(value, id);
      },
      close: () => db.close()
    };
  }
  
  try {
    const users = await adapter.select();
    console.log(`Found ${users.length} user(s) with encrypted mnemonics\n`);
    
    if (users.length === 0) {
      console.log('No users to rotate. Exiting.');
      await adapter.close();
      return;
    }
    
    let rotated = 0;
    let skipped = 0;
    let failed = 0;
    
    for (const user of users) {
      try {
        // Check if this mnemonic needs re-encryption
        const needs = await needsReEncryption(user.stellar_mnemonic);
        
        if (!needs) {
          console.log(`User ${user.id}: Already encrypted with current key (skipped)`);
          skipped++;
          continue;
        }
        
        // Decrypt with old key and re-encrypt with new key
        const plaintext = await decrypt(user.stellar_mnemonic);
        const newCiphertext = await encrypt(plaintext);
        
        if (!isDryRun) {
          await adapter.update(user.id, newCiphertext);
          console.log(`User ${user.id}: ✓ Re-encrypted with new key`);
        } else {
          console.log(`User ${user.id}: Would re-encrypt with new key (dry-run)`);
        }
        
        rotated++;
      } catch (error) {
        console.error(`User ${user.id}: ✗ Failed - ${error.message}`);
        failed++;
      }
    }
    
    console.log('\n=== Rotation Summary ===');
    console.log(`Total users:     ${users.length}`);
    console.log(`Re-encrypted:    ${rotated}`);
    console.log(`Already current: ${skipped}`);
    console.log(`Failed:          ${failed}`);
    
    if (isDryRun) {
      console.log('\nThis was a dry-run. No changes were made.');
      console.log('Run without --dry-run to perform the rotation.');
    } else if (failed === 0 && rotated > 0) {
      console.log('\n✓ Rotation completed successfully!');
      console.log('You can now remove ENCRYPTION_SECRET_OLD from your environment.');
    } else if (failed > 0) {
      console.error('\n✗ Rotation completed with errors.');
      console.error('Review the failures above before removing ENCRYPTION_SECRET_OLD.');
      process.exit(1);
    }
    
    await adapter.close();
  } catch (error) {
    console.error('\nFatal error:', error.message);
    await adapter.close();
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
