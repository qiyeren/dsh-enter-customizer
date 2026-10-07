# DSH Enter Customizer（DSH 0.2.0-rc.2 兼容 fork）

fork 自 [Boliban/dsh-enter-customizer](https://github.com/Boliban/dsh-enter-customizer)，
修复其与 DSH **0.2.0-rc.2** 的兼容性问题。功能与默认行为完全不变。

## 功能

- **接管系统输入快捷键**：`Enter`、`Ctrl+Enter`、`Shift+Enter`、`Alt+Enter` 和右下角发送按钮
- **每个快捷键可独立选择行为**：发送消息 / 繁忙时插入消息 / 换行 / 无作用
- **设置持久化**：配置写入用户设置文档，重启不丢失；设置页「输入快捷键」直接编辑
- **发送失败提示**：失败时在输入栏正上方浮动显示错误提示（3.2 秒后自动消失）
- **安全护栏**：中文输入法组合输入（IME）、斜杠命令菜单/弹层打开、机器忙碌（提交中）、
  含 @引用/图片的草稿、空草稿、停止按钮等场景自动放行给系统默认处理

## 默认配置

| 快捷键 | 默认行为 |
|---|---|
| Enter | 发送消息 |
| Ctrl + Enter | 繁忙时插入消息 |
| Shift + Enter | 换行 |
| Alt + Enter | 发送消息 |
| 发送按钮 | 发送消息 |

## 安装

```bash
dsh plugin --profile desktop add github:<你的用户名>/dsh-enter-customizer
```

## 兼容性修复清单（0.1.x → 0.2.0-rc.2）

以下每一项均对照已发布的 `@deepseek-ai/*@0.2.0-rc.2` 包源码核实：

### 1. Host 半部：持久化注册机制已移除（**阻断性**）

`@deepseek-ai/dsh-settings` 不再导出 `settingsNamespace()`，也没有 `register()`。

新版由 `SettingsForms.describe()` **直接投影每个活跃插件自身的 `Config` schema**，
命名空间 id 取 profile entry id（`ns: entry.options.id`）。

| | 0.1.x | 0.2.0-rc.2（本 fork） |
|---|---|---|
| 声明方式 | `settings.register(settingsNamespace(NS), schema)` | 导出 `export const Config = z.object({...})` |
| 命名空间来源 | 运行时注册 | profile entry `id` |

因此 `cordis.patch.yml` 里的 entry `id` **必须**等于 `NAMESPACE`（`dsh-enter-customizer`），
否则客户端读不到该 section。

### 2. Client 半部：`settingsScope` → `configForms`（**阻断性**）

| 0.1.x | 0.2.0-rc.2 |
|---|---|
| `ctx.get("settingsScope")` | `ctx.get("configForms")` |
| `settingsScope.bind({ namespace })` | `configForms.get("<entry id>")` |
| `scope.getSnapshot().value` | `form.getSnapshot()` → `{ status, value, revision, writable }` |
| `scope.set(key, value)`（同步） | `form.set(key, value)` → `Promise<boolean>` |

新增 `status` 判别：`'loading'` / `'unavailable'` 时**不得**投影 `value`（否则把 `undefined`
当配置写入）。写入改为 Promise，需 `.catch()` 吞掉传输失败。

写通道由提供方的 fiber 持有，消费者**无需**自行声明 `remote` / `remote.settings`。

### 3. `inject` 面调整

- 移除 `settingsScope`（不存在了）
- 移除 `timer`（0.2.0-rc.2 无此服务）→ toast 改用 `window.setTimeout` + 卸载清理
- 移除 `connection`（configForms 自带写通道，不再需要）
- 保留 `slots`、`sessions`

### 4. `InputState` 字段重命名

`imageIds` → **`attachmentIds`**（`readonly DraftAttachmentId[]`）。
`phase` 新增 `'adjudicating'` / `'claimed'` / `'submitting'`；`plain` 仍是唯一可提交状态，
原判断逻辑不变。

### 5. 提交通道：`prompt()` 的 mode 语义变化

```js
session.prompt(content, mode)   // mode: 0.1.x 'queue' → 0.2.0-rc.2 'queue' | 'steer'
```

新增的 `'steer'` 会**打断正在运行的回合**，这不是 0.1.x「繁忙时插入消息」的含义。
本 fork 的 send 与 queue 两条路径**统一保持 `'queue'`**，与设置页文案承诺的系统队列栏一致。

返回值是判别联合 `{ ok: true, value } | { ok: false, error }`，`error` 为 `RemoteError`
（`.code` / `.message`），失败分支 `.code` 必存在。

### 6. 依赖版本对齐 0.2.0-rc.2

`@deepseek-ai/cordis` `^4.0.1` → `~4.0.4`，`@deepseek-ai/schemastery` `^3.18.1` → `~3.18.4`；
`@deepseek-ai/dsh-settings` 不再是 peer 依赖（Host 半部只依赖 schemastery）。

## 验证

Host 半部：用官方 `schemastery@3.18.4` 实测 —— `Config` 可 `toJSON()` 投影、
默认值正确、0.1.x 旧配置文档**原样迁移保值**、非法值被正确拒绝。

Client 半部：mock `__ModuleLoader__` 实测 —— 模块注册成功、CSS 注入成功、
`inject` 面完全匹配新版服务名、缺失服务时安全返回不抛错、两个 slot 正常注册。

## 文件结构

```
├── package.json         # dsh.client + dsh.bundle 声明；inject 面已对齐 0.2.0-rc.2
├── cordis.patch.yml     # bundle patch：entry id 必须等于 NAMESPACE
├── lib/
│   ├── index.js         # Host 半部：以 Config 声明持久 section
│   └── client.js        # Client 半部：快捷键拦截 + 设置页 + 失败提示
└── assets/
    └── settings.png     # 设置界面截图
```
