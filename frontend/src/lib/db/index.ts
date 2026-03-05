import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

// Connection for queries
const connectionString = process.env.DATABASE_URL!;
const client = postgres(connectionString, { prepare: false });

// Database instance
export const db = drizzle(client, { schema });

// Export all schema tables and relations
export * from './schema';