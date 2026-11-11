# 渔船航期记账与经营分析工具

一个面向渔船主的记账工具，记录每个航期的采购开销、卖鱼收益、员工工资与预支，并提供可视化图表与经营分析。支持云端同步，多设备共享同一份账本。

## 功能

- 航期管理（启航/返航日期、自动计算天数与月数）
- 采购与船上开销（分类记录）
- 卖鱼收益（按鱼种/单价/重量自动算金额）
- 员工工资（按月薪 × 航期月数结算）
- 预支工资（单独立账）
- 可视化卡片图表（收支对比、成本构成、鱼种占比）
- 经营分析（内置规则 + 可选接入大模型 API）
- 数据导出/导入备份
- **云端同步**（手机、电脑等多设备共享同一份数据，实时保存）

## 技术架构

- 前端：单文件 `index.html`（原生 JS，本地缓存 localStorage）
- 后端：Netlify Functions（`netlify/functions/data.mjs`）
- 存储：Netlify Blobs
- 部署：Netlify，GitHub `main` 分支推送后自动部署

### 数据流

1. 页面启动时从云端拉取最新账本，失败则使用本机缓存（离线可用）
2. 任何新增/编辑/删除，先写入本机 localStorage，再防抖 600ms 推送到云端
3. 每 12 秒或在页面重新可见时拉取一次云端更新（多设备同步）
4. 编辑弹窗打开时不会被远端数据打断

### 访问码

云端接口通过 `x-access-code` 请求头校验访问码，访问码取自 Netlify 环境变量 `ACCESS_CODE`。

- 未配置 `ACCESS_CODE` 时，使用内置默认值 `fishbook-2026`（建议在 Netlify 中改成自己的）
- 所有设备填写同一个访问码即可共享同一份账本
- 不填访问码时，可以「仅本机使用」，数据只保存在当前浏览器

## 部署配置

- 构建命令：留空（Netlify 会自动安装 `package.json` 中的依赖）
- 发布目录：`.`（根目录）
- 函数目录：`netlify/functions`

## 更新发布流程

修改文件后，在 `fishbook` 目录运行：

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force
.\publish.ps1 -Message "本次更新说明"
```

脚本会通过 GitHub CLI 把文件推送到仓库的 `main` 分支，Netlify 随即自动重新部署（约 10 秒）。手机刷新站点即可看到新版本。

前提：已安装 GitHub CLI 并完成 `gh auth login`。
