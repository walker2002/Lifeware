/**
 * @file index
 * @brief 数据库初始化模块
 * 
 * 初始化 Drizzle ORM 数据库连接并导出实例
 */

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

/** 数据库连接字符串 */
const connectionString = process.env.DATABASE_URL!;

/** Postgres 客户端实例 */
const client = postgres(connectionString, { prepare: false });

/** Drizzle 数据库实例 */
export const db = drizzle(client, { schema });

/** 导出所有数据库表和关系 */
export * from './schema';