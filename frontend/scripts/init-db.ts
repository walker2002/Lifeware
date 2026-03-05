import { db, sql } from '../src/lib/db';
import * as schema from '../src/lib/db/schema';

async function main() {
  console.log('🔄 Initializing database...');

  // Create tables
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS tasks (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        title TEXT NOT NULL,
        description TEXT,
        status TEXT NOT NULL DEFAULT 'draft',
        priority TEXT NOT NULL DEFAULT 'medium',
        estimated_time INTEGER,
        actual_time INTEGER,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
        due_date TIMESTAMP,
        completed_at TIMESTAMP,
        context JSONB DEFAULT '{}'
      );
    `);

    console.log('✅ Tasks table created/verified');

    // Add more tables as needed...

    console.log('🎉 Database initialization completed!');
  } catch (error) {
    console.error('❌ Error initializing database:', error);
    process.exit(1);
  }
}

main();