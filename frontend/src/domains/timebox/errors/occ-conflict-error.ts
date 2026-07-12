/**
 * @file occ-conflict-error
 * @brief OCC 乐观并发冲突异常（[TD-003] T2）
 *
 * 抛出场景：repository.updateFields 的 WHERE occ_version = expectedOccVersion
 * 谓词 0 rows affected（行已被外部修改，occVersion 已变）。
 * 携带 currentOccVersion 给 caller 用于 retry / UX（drawer reload 用最新数据重填）。
 *
 * 域归属：timebox 域本地 class。Nexus 层 FieldMutationError/StateMutationError
 * 模式参考（domain-mutation-service/index.ts:408-421），但本 class 不入 nexus——
 * OCC 是 Repository 层实现细节，不污染 §III 业务事实写入口 contract。
 */

/**
 * 乐观并发冲突异常。
 *
 * @param currentOccVersion - 数据库当前 occ_version（caller 可读以决定 retry / UX）
 * @param attemptedOccVersion - caller 发起 update 时认为的 occ_version（已 stale）
 */
export class ConflictError extends Error {
  constructor(
    public readonly currentOccVersion: number,
    public readonly attemptedOccVersion: number,
  ) {
    super(
      `Timebox OCC conflict: attempted occ_version=${attemptedOccVersion}, current=${currentOccVersion}`,
    )
    this.name = 'ConflictError'
  }
}