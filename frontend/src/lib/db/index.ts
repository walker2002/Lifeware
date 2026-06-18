/**
 * @file index
 * @brief 数据库初始化模块
 * 
 * 初始化 Drizzle ORM 数据库连接并导出实例
 */

import { drizzle } from 'drizzle-orm/postgres-js';
import type { PostgresJsQueryResultHKT } from 'drizzle-orm/postgres-js';
import type { PgTransaction } from 'drizzle-orm/pg-core';
import type { ExtractTablesWithRelations } from 'drizzle-orm';
import postgres from 'postgres';
import * as schema from './schema';

/** 数据库连接字符串 */
const connectionString = process.env.DATABASE_URL!;

/** Postgres 客户端实例 */
const client = postgres(connectionString, { prepare: false });

/** Drizzle 数据库实例 */
export const db = drizzle(client, { schema });

/** `db.transaction(async (tx) => …)` 回调中 tx 句柄的类型 */
export type DbTransaction = PgTransaction<
  PostgresJsQueryResultHKT,
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
>;

/**
 * 统一的 Drizzle 客户端类型：既匹配顶层 `db` 单例（NodePgDatabase），
 * 也匹配 `db.transaction(async (tx) => …)` 回调里的 tx 句柄（PgTransaction）。
 * 二者的查询构建器方法（update/select/insert/delete）签名兼容，故仓储层以
 * `tx: DbClient = db` 接收可选事务句柄，缺省回退 db 单例，现有调用方零改动。
 */
export type DbClient = typeof db | DbTransaction;

/** 导出所有数据库表和关系 */
export * from './schema';