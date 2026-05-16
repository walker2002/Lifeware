

``` 
文档说明：
- 本文档描述当前正在做的待澄清需求
- AI需要通过读取该文档完成需求规划
- 状态为“已完成”的是已完成的内容，无需处理
- 由开发者人工来维护“状态”栏的内容
```





## [000] 重新强调 Domain 的开发规范并修改已有内容

根据新构建的 Domain 注册管理规范 @mydocs/core/LW_domain\_注册指南_2026_05_14.md ，对已开发的 Domain 包括 timebox，habits，okrs，tasks，全部按照新的规范检查一遍，特别是意图触发机制要清晰定义，

### 状态

完成时间：20260515

### 修改内容包括：

- 文件目录和位置
- 指南中提到的8个步骤



### 重要提示

- 修复 State Machine 架构设计缺陷的改进

  - 耦合性问题

    - 当前设计让 State Machine 成为全系统所有对象生命周期规则的执行者，这意味着：每新增一个 Domain，State Machine 就必须被修改——Task、Habit、Timebox、OKR 各有各的状态流转规则全写在 Nexus 里。这违反了 Domain Plugin 的可扩展性承诺，是耦合泄漏，不是"正常的架构复杂度"。

  - 业务逻辑判断问题：

    - 当前的错误：

      State Machine（Nexus 组件）当前隐含地需要硬编码：

    ```
    if (objectType === 'Task') {
      // Task 的合法跃迁：draft→active, active→scheduled...
    } else if (objectType === 'Habit') {
      // Habit 的合法跃迁：draft→active, active→suspended...
    }
    ```

    这不是"State Machine 作为执行器"，这是"State Machine 作为业务知识仓库"。

  - 调整方案：生命周期声明下沉到 Domain Manifest（最新的 domain注册指南中已规范）

    - **在 Domain 的 manifest 增加如下声明**

      - 对象生命周期定义（一个Domain 可以有多个对象）

      - 对象生命周期转化规则定义，可考虑使用 from, to, trigger('intent'|'time') 来定义，intent = 经过 Orchestrator; time = State Machine 自行捕捉
      - 定义不可回退状态

    - **State Machine 执行逻辑变更**：

      ```
      收到 StateProposal
        → 查找 targetObject 对应 Domain 的 manifest.lifecycle
        → 校验 from → to 跃迁是否在声明范围内
        → 校验 不可回退 约束
        → 合法则执行，拒绝非法跃迁
      ```

    

- Step 6 明确了 view_routes 的实现责任：列表页/详情页直接调 Repository（只读无需链路），编辑页表单提交走 PrebuiltIntent 进入 Rule Engine，Next.js 的 `app/` 目录只做薄壳导入。这条分界线——只读走 Repository、写操作走链路——是这一步最重要的约束。

- 钩子 **`onActionSurfaceRequest` 签名修正** 移除了顶层的 `category`，改为每个 `ActionCandidate` 自带。这个改动同步需要更新 `LW_USOM_详细设计.md` 中 4.4 节的钩子签名定义，该文档时需要对齐。
- 当前的 习惯库、OKR、项目/任务 的增删改、激活、归档很有可能都绕过了 Nexus，需要按照指南规范重新修改



### 其他说明

- 需要逐个步骤核对确认，修改不符合规范的内容
- 注意保持现有页面、功能没有发生变化。







