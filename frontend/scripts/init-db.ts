/**
 * @file init-db
 * @brief 数据库初始化检查脚本
 * 
 * @usage npx tsx scripts/init-db.ts
 * 
 * 检查数据库是否已初始化（通过检测 users 表是否存在）
 * 并给出相应的操作建议
 */

import { db } from '../src/lib/db'
import { sql } from 'drizzle-orm'

/**
 * 主函数：检查数据库初始化状态
 */
async function main() {
  console.log('Initializing database...')

  try {
    // 检查 users 表是否存在以验证迁移是否已应用
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
