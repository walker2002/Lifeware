/**
 * @file pool
 * @brief PostgreSQL 连接池
 * 
 * 使用 postgres.js 管理数据库连接
 */

import postgres from 'postgres';

/** 数据库连接字符串 */
const connectionString = process.env.DATABASE_URL!;

/** Postgres 连接池实例 */
const pool = postgres(connectionString, {
  max: 10,
  idle_timeout: 30,
  connect_timeout: 10,
  prepare: false,
  ssl: {
    rejectUnauthorized: false,
  },
});

/**
 * 检查数据库连接状态
 * @returns 连接状态对象
 */
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

/**
 * 关闭连接池
 */
export async function closeConnectionPool() {
  await pool.end();
}

export default pool;
