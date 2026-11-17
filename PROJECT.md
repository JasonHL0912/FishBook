# 渔船航期记账与经营分析系统 · 项目说明

> 面向渔船主的单页记账工具：把每趟出海（一个「航期」）从采购到结算的整本账，装进一个手机点开就能用的网页，并自动算出收益率。
>
> 线上地址：https://yuchuan-zhangben.netlify.app

---

## 一、项目定位

### 解决什么问题

| 痛点 | 现状 | 本系统怎么解 |
|---|---|---|
| 账目分散 | 采购记纸上、卖鱼记另一本、工资口头约定 | 统一为四个账本：航期、开销、卖鱼、工资/预支 |
| 算不清赚多少 | 只知道卖了多少，不知道扣掉油钱、冰钱、工资还剩多少 | 自动算净利润与收益率，一屏看完 |
| 事后难复盘 | 上一趟为什么亏，说不清 | 成本构成、鱼种结构可视化 + 自动经营分析 |
| 换设备没法接续 | 数据只存在某个手机里 | 云端同步，手机电脑打开都是同一份账 |

### 目标用户

船东 / 船长本人，**单人使用**，不需要多人协作与审批流。

### 产品形态

一个网页链接，iPhone Safari 打开即用，可「添加到主屏幕」当作 App。

---

## 二、功能结构

```
概览     一屏看全部：6 张 KPI 卡 + 4 个图表 + 经营分析
航期     建航期（名称 / 启航日 / 返航日），自动算天数与月数
开销     启航前采购、船上花费，按分类记账
卖鱼收益 鱼种 × 单价 × 重量，自动算金额
员工工资 船长 / 船员月薪，按航期月数自动结算
预支     单独记账，不自动抵扣
设置     自定义开销分类、AI 接口、云端同步开关
```

### 核心计算规则

```
航期天数 = 返航日 − 启航日 + 1
航期月数 = 天数 ÷ 30
工资     = 月薪 × 月数
净利润   = 卖鱼总收入 − 采购开销 − 工资合计
收益率   = 净利润 ÷ 卖鱼总收入
```

### 关键产品决策

1. **船长与船员统一按「月薪 × 月数」结算**
   早期版本曾采用「船长按收益比例分成」，后统一为月薪制。好处是规则唯一、结果可预测；代价是船长收益与业绩脱钩。目前保留「船长 / 船员」岗位标签，仅作标识用途。

2. **预支工资不计入成本**
   预支属于现金流，不是成本。工资总额已计入成本，预支只是提前发放，若再计入会重复扣减。因此预支单独建台账展示，不参与净利润计算。

---

## 三、技术实现

### 3.1 整体架构

```
┌─────────────────────────────────────────┐
│  浏览器（iPhone / 电脑）                  │
│  index.html   单文件应用                  │
│   ├─ 全部 UI + 业务逻辑（原生 JS，无框架） │
│   ├─ localStorage  本机缓存（离线可用）    │
│   └─ fetch() 调用后端 API                 │
└──────────────┬──────────────────────────┘
               │ HTTPS  GET / PUT
               ▼
┌─────────────────────────────────────────┐
│  Netlify Functions（Serverless）          │
│  netlify/functions/data.mjs               │
│   ├─ 校验访问码（x-access-code）           │
│   ├─ GET  → 读账本                        │
│   └─ PUT  → 写账本                        │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│  Netlify Blobs（云端对象存储）             │
│  store: "fishbook"   key: "ledger"        │
└─────────────────────────────────────────┘
```

### 3.2 技术选型理由

| 决策 | 理由 |
|---|---|
| 单文件前端、无构建 | 一个 `index.html` 包含全部样式与逻辑，无框架、无依赖，离线可运行。渔船海上信号差，这是刚需 |
| 不引入数据库 | 单人使用、数据量极小（一份账本几 KB～几十 KB），键值对象存储足够，零运维、免费额度充足 |
| 不用账号体系 | 以「访问码」代替登录，降低使用门槛。代价是安全性弱于完整账号体系（见第六节） |
| 图表手绘（SVG/CSS） | 环形图用 `stroke-dasharray`、条形图用宽度百分比，不依赖任何 CDN，保证离线可用 |

### 3.3 前端实现要点

| 模块 | 实现方式 |
|---|---|
| 界面 | 原生 HTML + CSS 变量主题；移动端媒体查询（窄屏表格横向滚动、输入框 16px 防 iOS 缩放） |
| 路由 | 7 个 `<section class="page">`，`showPage()` 切换显隐，无刷新 |
| 图表 | 纯 SVG / CSS 手绘，无第三方图表库 |
| 表单 | 统一 `modal()` 注入 HTML，无第三方组件库 |
| 经营分析 | 内置规则引擎（默认）+ 可选调用 OpenAI 兼容接口 |
| 数据备份 | `Blob` + `URL.createObjectURL` 导出 JSON；`FileReader` 导入 |

### 3.4 后端实现要点

`netlify/functions/data.mjs` 提供两个动作：

```js
import { getStore } from "@netlify/blobs";

const STORE_NAME = "fishbook";
const KEY = "ledger";

export default async (req) => {
  // 1. 访问码校验（请求头 x-access-code 或查询参数 ?code=）
  // 2. GET  → store.get(KEY, { type: "json", consistency: "strong" })
  // 3. PUT  → store.setJSON(KEY, { data, updatedAt: Date.now() })
  // 4. 统一 JSON 响应 + CORS 头
};
```

两个关键技术细节：

1. **强一致性读取**
   Netlify Blobs 默认最终一致性，写入后立即读取会返回空值，导致前端出现「刚保存又变空」。使用 `consistency: "strong"` 后解决。

2. **版本号 `updatedAt`**
   每次写入记录时间戳，前端据此判断「云端是否比本机新」，避免无意义的覆盖写。

---

## 四、数据存储

数据有**两份**，互为备份。

### 4.1 本机存储（localStorage）—— 主副本，离线可用

浏览器内共 3 个 key：

| Key | 内容 | 作用 |
|---|---|---|
| `fishing_ledger_v1` | 整本账（JSON） | 全部业务数据 |
| `fishbook_access_code` | 访问码 | 免每次输入，自动连接云端 |
| `fishbook_local_ts` | 本机最后修改时间戳 | 判断本机是否存在未同步改动 |

### 4.2 云端存储（Netlify Blobs）—— 跨设备同步

| 层级 | 值 |
|---|---|
| Store 名 | `fishbook` |
| Key | `ledger` |
| Value | `{ "data": { 账本 }, "updatedAt": 1794408731675 }` |

Netlify Blobs 为 Netlify 平台托管的对象存储，**按站点隔离**，仅本站点及持有有效访问码的请求可读写该 key。

### 4.3 账本数据结构

```json
{
  "voyages": [
    { "id": "abc123", "name": "2026春季第一航期",
      "startDate": "2026-03-01", "endDate": "2026-03-25" }
  ],
  "expenses": [
    { "id": "e1", "voyageId": "abc123", "date": "2026-02-28",
      "category": "燃料", "amount": 5000, "note": "柴油3桶" }
  ],
  "sales": [
    { "id": "s1", "voyageId": "abc123", "date": "2026-03-25",
      "species": "带鱼", "price": 20, "weight": 1000,
      "amount": 20000, "note": "" }
  ],
  "staff": [
    { "id": "p1", "name": "张三", "role": "船员",
      "monthlySalary": 7000, "note": "" }
  ],
  "advances": [
    { "id": "a1", "staffId": "p1", "voyageId": "abc123",
      "date": "2026-03-05", "amount": 2000, "note": "家用" }
  ],
  "categories": ["燃料", "冰/保鲜", "渔具/工具", "生活物资"],
  "settings": { "apiBase": "", "apiKey": "", "model": "deepseek-chat" }
}
```

**关联关系**：`expenses` / `sales` / `advances` 通过 `voyageId` 归属航期；`advances` 通过 `staffId` 归属员工。删除航期时，其下所有记录级联删除。

---

## 五、数据路径

### 5.1 源码文件路径

```
fishbook/
├── index.html                  前端全部代码
├── netlify/functions/data.mjs  后端 API
├── netlify.toml                部署配置（发布根目录 + 函数目录）
├── package.json                依赖声明（@netlify/blobs）
├── publish.ps1                 一键发布脚本
├── README.md                   简要说明
└── PROJECT.md                  本文档
```

### 5.2 线上访问路径

| 用途 | URL |
|---|---|
| 用户入口 | `https://yuchuan-zhangben.netlify.app/` |
| 数据 API | `https://yuchuan-zhangben.netlify.app/.netlify/functions/data` |

### 5.3 一次「录入」的完整数据流转

```
① 用户点击「保存」
       ↓
② save() 写入 localStorage['fishing_ledger_v1']
   并更新 localStorage['fishbook_local_ts']
       ↓  （本机立即生效，离线也不丢失）
③ 600ms 防抖后：PUT /.netlify/functions/data
   Header: x-access-code = <访问码>
   Body:   { data: <整本账> }
       ↓
④ data.mjs 校验访问码 → store.setJSON('ledger', { data, updatedAt })
       ↓
⑤ 返回 { ok: true, updatedAt }
       ↓
⑥ 前端更新 lastRemoteAt，顶部徽章显示「已同步」
```

### 5.4 跨设备同步路径

```
设备 A 保存 ──→ 云端 updatedAt 变化
                    ↓
设备 B 每 12 秒（或切回页面时）GET
        → 发现云端更新 → 覆盖本机 → 自动重渲染
```

**冲突保护机制**：

- 编辑弹窗打开时，不打断用户操作（暂不应用远端数据）
- 首次开启同步时若两边都有数据 → 弹窗让用户选择「用本机」或「用云端」，绝不静默覆盖
- 离线期间录入的数据 → 通过 `fishbook_local_ts` 识别为本地更新，联网后自动上传

### 5.5 部署链路

```
本地 fishbook/ 目录
    ↓ publish.ps1（GitHub CLI → GitHub API）
GitHub 仓库  github.com/JasonHL0912/FishBook（main 分支）
    ↓ Netlify 监听 main 变更，自动构建
Netlify 构建：npm install @netlify/blobs → 打包 netlify/functions/data.mjs
    ↓
线上站点  yuchuan-zhangben.netlify.app
```

---

## 六、当前限制与风险

| 项 | 现状 | 影响 | 建议 |
|---|---|---|---|
| 访问码强度 | 未配置环境变量时使用内置默认码 | 中 | 在 Netlify 环境变量 `ACCESS_CODE` 中改为自己的强密码 |
| 无完整账号体系 | 访问码明文存于 localStorage | 中 | 手机不外借；不将链接与访问码同时发给他人 |
| 并发写入 | 两人同时修改时，后提交覆盖前者 | 低（单人场景） | 后续可增加合并逻辑 |
| 数据体量 | 整本账一次性读写 | 低 | 数据量达到 MB 级前无问题 |
| 离线入口 | 网页需首次联网加载 | 低 | 加载后可离线使用；可加 Service Worker 实现全离线 |
| 备份 | 支持导出 / 导入，但需手动操作 | 中 | 建议每个航期结束后导出一份 JSON 存档 |

---

## 七、后续迭代方向

按投入产出排序：

1. **航期结算状态**：区分「进行中 / 已结清」，避免数据混看
2. **工资手动微调**：支持按实际出勤微调，而非仅按「月薪 × 月数」
3. **多航期对比**：同比 / 环比分析，识别高收益航期特征
4. **Service Worker 全离线**：断网也能打开页面
5. **账号体系**：若需多人协作或对外销售，迁移至 Supabase Auth 等方案

---

## 八、更新与发布

修改文件后，在 `fishbook` 目录执行：

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force
.\publish.ps1 -Message "本次更新说明"
```

脚本通过 GitHub CLI 将文件推送至仓库 `main` 分支，Netlify 随即自动重新部署（约 10～30 秒）。

前提：已安装 GitHub CLI 并完成 `gh auth login`。
