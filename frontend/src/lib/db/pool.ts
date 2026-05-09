import postgres from 'postgres';

const connectionString = process.env.DATABASE_URL!;

const pool = postgres(connectionString, {
  max: 10,
  idle_timeout: 30,
  connect_timeout: 10,
  prepare: false,
  ssl: {
    rejectUnauthorized: false,
  },
});

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

export async function closeConnectionPool() {
  await pool.end();
}

export default pool;
