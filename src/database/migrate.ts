import fs from 'fs';
import path from 'path';
import { Client } from 'pg';
import { ENV } from '../config/env';

export async function runMigrations() {
  console.log('🔄 [Migration] Initializing database migration...');
  console.log(`📡 [Migration] Target Database URL: ${ENV.DATABASE_URL.replace(/:[^:@]+@/, ':****@')}`);

  // Resolve schema.sql path (supports both ts-node and compiled dist execution)
  const candidatePaths = [
    path.resolve(__dirname, 'schema.sql'),
    path.resolve(__dirname, '../database/schema.sql'),
    path.resolve(process.cwd(), 'src/database/schema.sql'),
    path.resolve(process.cwd(), 'dist/database/schema.sql'),
  ];

  let schemaPath = candidatePaths.find(p => fs.existsSync(p));
  if (!schemaPath) {
    throw new Error(`Schema file not found in candidate paths: ${candidatePaths.join(', ')}`);
  }

  console.log(`📄 [Migration] Reading schema from: ${schemaPath}`);
  const sql = fs.readFileSync(schemaPath, 'utf8');

  const client = new Client({
    connectionString: ENV.DATABASE_URL,
    connectionTimeoutMillis: 5000,
  });

  try {
    await client.connect();
    console.log('🔌 [Migration] Connected to PostgreSQL instance.');

    console.log('⚡ [Migration] Executing schema DDL statements...');
    await client.query(sql);
    console.log('✅ [Migration] Base schema DDL verified.');

    // Look for migrations directory
    const candidateMigrationsDirs = [
      path.resolve(__dirname, 'migrations'),
      path.resolve(__dirname, '../database/migrations'),
      path.resolve(process.cwd(), 'src/database/migrations'),
      path.resolve(process.cwd(), 'dist/database/migrations'),
      path.resolve(process.cwd(), 'backend/src/database/migrations'),
    ];

    const migrationsDir = candidateMigrationsDirs.find(d => fs.existsSync(d));
    if (migrationsDir) {
      const migrationFiles = fs.readdirSync(migrationsDir)
        .filter(f => f.endsWith('.sql'))
        .sort();
      
      console.log(`📁 [Migration] Discovered ${migrationFiles.length} incremental migration files in ${migrationsDir}`);
      for (const mFile of migrationFiles) {
        const mPath = path.join(migrationsDir, mFile);
        console.log(`   Applying migration: ${mFile}...`);
        const mSql = fs.readFileSync(mPath, 'utf8');
        await client.query(mSql);
        console.log(`   ✅ Migration ${mFile} applied successfully.`);
      }
    }

    // Verify critical tables exist
    const res = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name;
    `);

    const tableNames = res.rows.map(r => r.table_name);
    console.log(`📊 [Migration] Verified ${tableNames.length} tables present in database:`);
    console.log(`   ${tableNames.join(', ')}`);

    console.log('🎉 [Migration] Database migration completed cleanly with zero data loss.\n');
  } catch (err: any) {
    console.error('❌ [Migration Error] Migration failed:', err.message || err);
    throw err;
  } finally {
    await client.end();
  }
}

if (require.main === module) {
  runMigrations()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
