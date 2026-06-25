# AI 通过 MCP 访问 Knowledge Forge 向量知识库教程

这份教程写给第一次接触 MCP 的用户。目标是让 Claude Desktop、Cursor、Codex 或其他支持 MCP 的 AI 客户端，能够读取 Knowledge Forge 里的本地向量知识库，并用自然语言搜索你的资料。

本文所有路径里的 `C:\path\to\knowledge-forge` 都是占位符。请把它替换成你本机克隆或解压 Knowledge Forge 项目的绝对路径。

## 先说结论：这是 stdio，不是流式 HTTP

当前 Knowledge Forge 的 MCP server 默认使用 `stdio` 方式。

也就是说，AI 客户端不是通过一个公网 HTTP 地址连接 Knowledge Forge，而是像启动一个本地小程序一样启动 MCP server，然后通过标准输入/标准输出和它说话。

```text
AI 客户端
  -> 启动本地 MCP server 进程
  -> 通过 stdio 和 MCP server 通信
  -> MCP server 再访问本机 Knowledge Forge API
  -> Knowledge Forge API 查询本地 LanceDB 向量库
```

这里容易混淆的点：

- MCP 客户端到 MCP server：`stdio`
- MCP server 到 Knowledge Forge API：本机 HTTP，默认 `http://127.0.0.1:5183`
- 对外公网访问：没有，默认不开公网
- Streamable HTTP / SSE MCP：当前不是这种模式

## stdio 和流式 HTTP 的区别

| 方式 | 怎么连接 | 适合场景 | Knowledge Forge 当前状态 |
|---|---|---|---|
| stdio | AI 客户端本地启动一个命令，通过 stdin/stdout 通信 | 本机桌面工具、本地知识库、默认更安全 | 当前默认支持 |
| Streamable HTTP | MCP server 开一个 HTTP 地址，客户端通过网络请求连接 | 远程服务、多人服务、云部署 | 当前不作为默认交付 |
| SSE 老式 HTTP | 通过 HTTP + Server-Sent Events 连接 | 旧版 MCP HTTP 场景 | 当前不使用 |

为什么 Knowledge Forge 先用 `stdio`：

- 更适合本地单用户桌面工具。
- 不需要把 MCP 端口暴露到局域网或公网。
- AI 客户端只要能启动本地命令，就能访问知识库。
- 风险边界更清楚，写入工具默认关闭。

## 使用前准备

进入项目目录：

```powershell
cd C:\path\to\knowledge-forge
```

安装依赖：

```powershell
npm install
```

建议先跑一次基础 smoke，确认 API、LanceDB 和 MCP 都能工作：

```powershell
npm run smoke
```

看到类似下面结果就说明链路可用：

```json
{
  "ok": true,
  "searchResults": 1,
  "mcpResources": 7
}
```

## 第一步：先在 Knowledge Forge 里准备知识库

AI 通过 MCP 只能检索已经进入 Knowledge Forge 的资料。所以先做这几步：

1. 启动应用：

```powershell
npm run dev
```

2. 打开浏览器：

```text
http://127.0.0.1:5184
```

3. 创建或选择一个知识库。

4. 导入资料，例如 PDF、DOCX、Markdown、TXT、图片。

5. 等任务中心显示处理完成。

6. 先在 UI 的“本地检索”页面搜一次，确认能搜到内容。

这一步很重要。MCP 不会自动建立知识库，它只是把已经入库的内容暴露给 AI 客户端调用。

## 第二步：MCP server 命令是什么

开发环境里最简单的命令是：

```powershell
npm run mcp
```

但 AI 客户端配置通常不能直接写 `npm run mcp`，更推荐写完整命令：

```powershell
node C:\path\to\knowledge-forge\node_modules\tsx\dist\cli.mjs C:\path\to\knowledge-forge\server\mcp.ts
```

拆开看：

- `command`: `node`
- 第一个 `args`: `node_modules\tsx\dist\cli.mjs`
- 第二个 `args`: `server\mcp.ts`

MCP server 启动后会自动检查本机 API。

如果 `http://127.0.0.1:5183` 已经有 Knowledge Forge API，它会直接使用。

如果没有运行 API，默认会自动启动一个临时本地 API。

## 第三步：Claude Desktop 配置

打开 Claude Desktop 的 MCP 配置文件。

Windows 常见位置类似：

```text
%APPDATA%\Claude\claude_desktop_config.json
```

加入下面配置：

```json
{
  "mcpServers": {
    "knowledge-forge": {
      "command": "node",
      "args": [
        "C:\\path\\to\\knowledge-forge\\node_modules\\tsx\\dist\\cli.mjs",
        "C:\\path\\to\\knowledge-forge\\server\\mcp.ts"
      ],
      "env": {
        "KNOWLEDGE_FORGE_ROOT_DIR": "C:\\path\\to\\knowledge-forge",
        "KNOWLEDGE_FORGE_DATA_DIR": "C:\\path\\to\\knowledge-forge\\data"
      }
    }
  }
}
```

保存后重启 Claude Desktop。

如果 Claude Desktop 能看到 `knowledge-forge` 这个 MCP server，就说明配置成功。

## 第四步：Cursor 配置思路

Cursor 的 MCP 配置界面和版本会变化，但核心字段一样。

新增一个 MCP server：

```json
{
  "name": "knowledge-forge",
  "command": "node",
  "args": [
    "C:\\path\\to\\knowledge-forge\\node_modules\\tsx\\dist\\cli.mjs",
    "C:\\path\\to\\knowledge-forge\\server\\mcp.ts"
  ],
  "env": {
    "KNOWLEDGE_FORGE_ROOT_DIR": "C:\\path\\to\\knowledge-forge",
    "KNOWLEDGE_FORGE_DATA_DIR": "C:\\path\\to\\knowledge-forge\\data"
  }
}
```

如果 Cursor 要求填写 JSON 对象，就按它当前版本的 MCP 配置格式填入这些字段。

关键还是三件事：

- `command` 是 `node`
- `args` 里放 `tsx` 和 `server/mcp.ts`
- `env` 指向项目根目录和数据目录

## 第五步：Codex 或其他 MCP 客户端配置

其他 MCP 客户端也使用同样的 stdio 配置：

```json
{
  "knowledge-forge": {
    "command": "node",
    "args": [
      "C:\\path\\to\\knowledge-forge\\node_modules\\tsx\\dist\\cli.mjs",
      "C:\\path\\to\\knowledge-forge\\server\\mcp.ts"
    ],
    "env": {
      "KNOWLEDGE_FORGE_ROOT_DIR": "C:\\path\\to\\knowledge-forge",
      "KNOWLEDGE_FORGE_DATA_DIR": "C:\\path\\to\\knowledge-forge\\data"
    }
  }
}
```

如果客户端有“Transport”选项，选择：

```text
stdio
```

不要选择：

```text
streamable-http
sse
http
```

## 第六步：AI 能调用哪些工具

默认可用的是只读工具：

| 工具 | 用途 |
|---|---|
| `vf_stats` | 查看 Knowledge Forge 健康状态、集合和配置摘要 |
| `vf_list_collections` | 列出所有知识库 |
| `vf_search` | 在指定知识库里做本地向量检索 |
| `vf_get_document` | 读取某个文档的元数据和 chunks |

默认不可用或会被拒绝的是写入/删除工具：

| 工具 | 用途 | 默认 |
|---|---|---|
| `vf_upsert_text` | 写入文本到知识库 | 关闭 |
| `vf_delete_document` | 删除文档 | 关闭 |

写入工具只有在 Knowledge Forge 配置里明确开启 `mcp.allowWrites=true` 后才可用。

建议首次配置时先保持默认只读。

## 第七步：AI 能读取哪些资源

MCP resources 是“只读资料入口”，适合让 AI 先了解知识库状态。

| Resource URI | 作用 |
|---|---|
| `KnowledgeForge://health` | 健康状态、版本、LanceDB 表、配置摘要 |
| `KnowledgeForge://collections` | 所有知识库列表 |
| `KnowledgeForge://collections/{slug}/documents` | 某个知识库下的文档列表 |
| `KnowledgeForge://embedding-provider/status` | 当前 embedding provider 和索引兼容状态 |
| `KnowledgeForge://jobs/recent` | 最近任务列表 |
| `KnowledgeForge://anythingllm/sync-status` | 本地记录的 AnythingLLM 同步状态 |
| `KnowledgeForge://documents/quality` | OCR/解析质量概览 |

在 Knowledge Forge 桌面 UI 的 `MCP` 页面，也会列出这些 URI，并提供复制按钮。

## 第八步：怎么问 AI

推荐先这样问：

```text
请先调用 vf_list_collections，列出我当前有哪些 Knowledge Forge 知识库。
```

然后选择一个知识库，例如返回里有：

```text
slug: project-docs
```

再问：

```text
请调用 vf_search，在 collection=project-docs 里搜索：
“这个项目的部署步骤是什么？”
topK 设为 8。
回答时请引用 title、sourcePath、chunkIndex 和 score。
```

更完整的提问模板：

```text
你可以使用 Knowledge Forge MCP。
请先列出 collections。
然后选择最相关的 collection 做 vf_search。
回答时不要编造来源。
每条结论后面带上来源文档名、chunkIndex、score。
如果搜索结果不足，请明确说“知识库里没有足够证据”。
```

## 第九步：一个完整例子

假设你已经导入了几份报销制度 PDF，并创建了知识库 `finance-policy`。

你可以问 AI：

```text
请通过 Knowledge Forge MCP 检索 finance-policy 知识库：
1. 搜索“差旅报销发票要求”
2. 总结员工需要提交哪些材料
3. 每条要求后面标注来源文档、chunkIndex、score
4. 如果结果里没有明确说法，不要猜
```

AI 应该会调用：

```text
vf_search(collection="finance-policy", query="差旅报销发票要求", topK=8)
```

然后根据返回的 chunks 回答。

## 第十步：如果搜不到怎么办

按这个顺序排查：

1. Knowledge Forge UI 里能不能搜到？

如果 UI 里也搜不到，说明资料可能没成功入库、没完成 embedding，或 query 不合适。

2. AI 有没有先调用 `vf_list_collections`？

很多失败是 collection slug 写错。

3. 文档任务是否处理完成？

去“导入任务”页面看有没有 failed、running、cancelled。

4. 当前 embedding provider 是不是 `local-hash`？

`local-hash` 适合离线流程验证，不代表高质量语义检索。要更好的语义检索，需要配置 OpenAI-compatible embedding provider 并重建索引。

5. MCP server 的数据目录是否正确？

确认配置里的：

```json
"KNOWLEDGE_FORGE_DATA_DIR": "C:\\path\\to\\knowledge-forge\\data"
```

和你桌面应用实际使用的数据目录一致。

## 第十一步：常见错误

### 1. AI 客户端说 MCP server 启动失败

检查：

- `node` 是否能运行。
- `npm install` 是否已经执行。
- `node_modules\tsx\dist\cli.mjs` 是否存在。
- 路径里的反斜杠是否写成 `\\`。

手动测试：

```powershell
node C:\path\to\knowledge-forge\node_modules\tsx\dist\cli.mjs C:\path\to\knowledge-forge\server\mcp.ts
```

如果命令不退出并显示 MCP ready 类似日志，说明 server 已启动。

### 2. AI 找不到工具

确认客户端配置的是 `stdio`，不是 HTTP。

确认 JSON 结构符合客户端要求。

保存配置后重启 AI 客户端。

### 3. 搜索时报 API unreachable

可以先启动 Knowledge Forge API：

```powershell
npm run server:once
```

或者保持默认自动启动，不设置：

```text
KNOWLEDGE_FORGE_MCP_AUTOSTART=false
```

如果你设置了 `KNOWLEDGE_FORGE_API_URL`，确认地址可访问：

```powershell
Invoke-RestMethod http://127.0.0.1:5183/api/health
```

### 4. AI 想删除或写入但失败

这是正常安全设计。

MCP 默认只读。除非你明确开启：

```json
"mcp": {
  "allowWrites": true
}
```

否则 `vf_upsert_text` 和 `vf_delete_document` 会被拒绝。

首次配置时不建议开启写入。

### 5. API key 会不会泄漏给 AI？

MCP resources 和 `vf_stats` 会做密钥脱敏，不返回完整 API key。

但仍然建议：

- 不要把 `.env`、`data/`、`config.json` 提交到 GitHub。
- 不要把 AnythingLLM API key 直接贴给 AI。
- 不要把 Knowledge Forge API 暴露到公网。

## 第十二步：什么时候需要 HTTP MCP

普通本机使用不需要。

只有这些场景才可能考虑 Streamable HTTP：

- 你想让另一台机器访问 MCP。
- 你要部署成多人服务。
- 你要放到服务器上给远程 AI client 连接。

这些场景需要额外设计：

- 鉴权
- HTTPS
- CORS
- 网络访问控制
- 多用户权限
- 写入审计
- 速率限制

当前 Knowledge Forge 的定位是本机单用户桌面工具，所以默认不走这条路线。

## 推荐安全配置

首次配置建议：

- 使用 `stdio`
- 保持 MCP 写入关闭
- API 只绑定 `127.0.0.1`
- 不暴露公网
- 先用 UI 导入和管理文档
- 让 AI 只做 `vf_list_collections`、`vf_search`、`vf_get_document`

这样 AI 就可以读你的本地知识库，但不容易误删或误写。

## 最小可复制配置

如果你只想复制一段最小配置，用这个：

```json
{
  "mcpServers": {
    "knowledge-forge": {
      "command": "node",
      "args": [
        "C:\\path\\to\\knowledge-forge\\node_modules\\tsx\\dist\\cli.mjs",
        "C:\\path\\to\\knowledge-forge\\server\\mcp.ts"
      ],
      "env": {
        "KNOWLEDGE_FORGE_ROOT_DIR": "C:\\path\\to\\knowledge-forge",
        "KNOWLEDGE_FORGE_DATA_DIR": "C:\\path\\to\\knowledge-forge\\data"
      }
    }
  }
}
```

配置后重启 AI 客户端，然后问：

```text
请调用 Knowledge Forge MCP 的 vf_list_collections，告诉我有哪些知识库。
```

能列出知识库，就说明接入成功。
