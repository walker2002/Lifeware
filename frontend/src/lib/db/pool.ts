import postgres from 'postgres';
import { env } from '@/env.mjs';

// Create connection pool for better performance
const connectionString = env.DATABASE_URL;

// Configure connection pool
const pool = postgres(connectionString, {
  // Connection pool configuration
  max: 10, // Maximum number of connections in the pool
  idle_timeout: 30, // Idle timeout in seconds
  connect_timeout: 10, // Connection timeout in seconds
  prepare: false, // Disable prepared statements for connection pooling

  // SSL configuration for Supabase
  ssl: {
    rejectUnauthorized: false, // For Supabase self-signed certificates
  },
});

// Health check function
export async function checkDatabaseConnection() {
  try {
    await pool`SELECT 1`;
    return { status: 'connected' as const };
  } catch (error) {
    console.error('Database connection failed:', error);
    return {
      status: 'error' as const,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

// Close connection pool (useful for testing)
export async function closeConnectionPool() {
  await pool.end();
  console.log('Database connection pool closed');
}

export default pool;