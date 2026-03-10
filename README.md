## Demo：使用 AWS S3 + CloudFront + GitHub Actions 部署 SPA（含人工审核）

这个仓库是一个**最小可运行的 Demo**，演示如何：

- **构建**一个 SPA（Vite + React + react-router）
- 通过 **GitHub Actions** 将构建结果发布到 **S3 + CloudFront**
- 在发布前通过 workflow 的输入字段做**人工确认**
- 为不同类型文件设置**不同的缓存策略**（HTML 短缓存 / 静态资源长缓存）

---

### 一、目录结构（与演示相关的部分）

- `src/`：前端 SPA 源码，包含简单的路由与文案说明
- `.github/workflows/deploy.yml`：发布工作流（构建 + 上传 + 失效缓存 + 人工确认）
- `vite.config.mts` / `package.json` 等：前端构建配置

本地开发时只需要 `npm install && npm run dev`，所有「上线」动作都通过 GitHub Actions 完成，不再需要本地 shell 脚本。

---

### 二、前置准备（AWS 侧）

- 已安装并配置好 **AWS 账户**（用于创建资源和生成访问密钥）
- 在 AWS 中准备：
  - 1 个 **S3 桶**：用来托管 SPA 静态资源
  - 1 个 **CloudFront 分发**：Origin 指向该 S3 桶

> 注意：S3 桶需要允许被 CloudFront 访问（可用 Origin Access Control / Origin Access Identity 等方式），这里不展开，只做部署演示。

---

### 三、本地开发（只看页面，不涉及部署）

```bash
cd spa-with-aws-s3-cloudfront
npm install
npm run dev
```

浏览器打开 `http://localhost:5173`：

- 顶部有导航：总览 / 发布流程
- 「发布流程」页面会用文字说明本仓库的 GitHub Actions 发布逻辑

---

### 四、配置 GitHub Actions Secrets

在项目所在的 GitHub 仓库中，进入：

`Settings -> Secrets and variables -> Actions -> New repository secret`

配置以下 Secrets：

- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_REGION`（例如 `ap-southeast-1`）
- `S3_BUCKET_PRIMARY`（你的 S3 桶名）
- `CLOUDFRONT_DISTRIBUTION_ID`（CloudFront 分发 ID）

工作流中使用这些 Secrets 来访问 AWS 并执行部署。

---

### 五、发布流程（GitHub Actions + 人工确认）

相关文件：`/.github/workflows/deploy.yml`

触发方式：**手动**（`workflow_dispatch`），并带有一个字符串确认字段。

1. 在 GitHub 仓库中打开 `Actions` 页签  
2. 选择 `Deploy SPA to S3 + CloudFront` 工作流  
3. 点击右侧的 `Run workflow`  
4. 在输入框 `confirm` 中填写 **`DEPLOY`**（大写且完全匹配）  
5. 点击确认运行  

若没有输入或输入不是 `DEPLOY`，工作流不会执行部署逻辑。

工作流主要步骤：

1. **Checkout + Node 环境**
   - `actions/checkout@v4`
   - `actions/setup-node@v4`（Node 18，npm cache）

2. **安装依赖 & 构建**

   ```bash
   npm ci
   npm run build
   ```

3. **配置 AWS 凭证**

   使用 `aws-actions/configure-aws-credentials@v4`，注入上面配置的 Secrets。

4. **上传静态资源（长缓存）**

   ```bash
   aws s3 sync dist/ "s3://${S3_BUCKET_PRIMARY}" \
     --exclude "index.html" \
     --cache-control "public,max-age=31536000,immutable"
   ```

   - 只上传 **非 `index.html` 文件**（如 JS / CSS / 图片）
   - 为这些带 hash 的静态资源设置**长缓存策略**：
     - `Cache-Control: public,max-age=31536000,immutable`

5. **上传 `index.html`（不缓存）**

   ```bash
   aws s3 cp dist/index.html "s3://${S3_BUCKET_PRIMARY}/index.html" \
     --cache-control "no-store" \
     --content-type "text/html; charset=utf-8"
   ```

   - 为 HTML 设置：
     - `Cache-Control: no-store`（避免被浏览器和 CDN 长时间缓存）

6. **创建 CloudFront 缓存失效**

   ```bash
   aws cloudfront create-invalidation \
     --distribution-id "${CLOUDFRONT_DISTRIBUTION_ID}" \
     --paths "/index.html" "/favicon.svg" "/favicon.ico"
   ```

   - 只清除可能变化的文件缓存
   - 带 hash 的静态资源文件（如 `assets/index-xxx.js`）由于文件名包含版本信息，无需清除缓存

---

### 六、如何在演示中讲清“不同文件缓存策略”

- **缓存策略差异**
  - 打开开发者工具（Network），访问你的 CloudFront 域名
  - 观察：
    - `index.html` 的响应头中 `Cache-Control: no-store`
    - JS / CSS / 图片等 `assets` 的 `Cache-Control: public,max-age=31536000,immutable`
  - 可以强调：这正是典型的 SPA 部署模式：
    - HTML 快速更新，不能被长时间缓存
    - 静态资源带 hash，可长时间缓存以提升性能
    - 部署时只清除必要的文件缓存，带 hash 的文件无需清除

- **发布 + 人工确认**
  - 在 GitHub Actions 里演示：
    - 修改前端文案，push 后手动触发 `Deploy SPA to S3 + CloudFront`
    - 指出 `confirm` 输入框就是一个**简单的人工确认**

---

### 七、后续扩展建议

在真实项目中，你可以在这个 Demo 基础上进一步扩展：

- 为不同路径配置更精细的 CloudFront 行为（例如 `/assets/*` 一个行为，`/*` 一个行为）
- 使用 GitHub Environments 的「Required reviewers」做正式环境审批
- 将本仓库的工作流迁移到你自己的项目，直接复用「单桶 + 不同缓存策略」的做法

本 Demo 的目标是：用尽量少的文件，清晰展示**SPA + S3 + CloudFront + GitHub Actions + 差异化缓存策略 + 优化缓存失效**的完整链路。
