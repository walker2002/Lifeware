import { db } from '../src/lib/db'
import { sql } from 'drizzle-orm'

async function main() {
  console.log('Initializing database...')

  try {
    // Check if the users table exists to verify migration has been applied
    const result = await db.execute(sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'users'
      );
    `)

    const exists = (result as any)[0]?.exists
    if (exists) {
      console.log('Database already initialized. Run `npm run db:migrate` to apply pending migrations.')
    } else {
      console.log('Database not yet initialized. Run `npm run db:generate` then `npm run db:migrate`.')
    }
  } catch (error) {
    console.error('Error checking database:', error)
    process.exit(1)
  }

  process.exit(0)
}

main()
