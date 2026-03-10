## Demo：使用 AWS S3 + CloudFront + GitHub Actions 部署 SPA（含回滚 & 人工审核）

这个仓库是一个**最小可运行的 Demo**，演示如何：

- **构建**一个 SPA（Vite + React + react-router）
- 通过 **GitHub Actions** 将构建结果发布到 **S3 + CloudFront**
- 在发布前通过 workflow 的输入字段做**人工确认**
- 只使用 **一个开启 Versioning 的 S3 桶**，依靠 `index.html` 的对象版本实现**回滚**
- 为不同类型文件设置**不同的缓存策略**（HTML 短缓存 / 静态资源长缓存）

---

### 一、目录结构（与演示相关的部分）

- `src/`：前端 SPA 源码，包含简单的路由与文案说明
- `.github/workflows/deploy.yml`：发布工作流（构建 + 上传 + 失效缓存 + 人工确认）
- `.github/workflows/rollback-index.yml`：回滚工作流（指定 `index.html` 的 VersionId 回滚）
- `vite.config.mts` / `package.json` 等：前端构建配置

本地开发时只需要 `npm install && npm run dev`，所有「上线 / 回滚」动作都通过 GitHub Actions 完成，不再需要本地 shell 脚本。

---

### 二、前置准备（AWS 侧）

- 已安装并配置好 **AWS 账户**（用于创建资源和生成访问密钥）
- 在 AWS 中准备：
  - 1 个 **S3 桶**：用来托管 SPA 静态资源，**必须开启 Versioning**
  - 1 个 **CloudFront 分发**：Origin 指向该 S3 桶

> 注意：S3 桶需要允许被 CloudFront 访问（可用 Origin Access Control / Origin Access Identity 等方式），这里不展开，只做部署和回滚演示。

---

### 三、本地开发（只看页面，不涉及部署）

```bash
cd spa-with-aws-s3-cloudfront
npm install
npm run dev
```

浏览器打开 `http://localhost:5173`：

- 顶部有导航：总览 / 发布流程 / 回滚流程
- 「发布流程」「回滚流程」页面会用文字说明本仓库的 GitHub Actions 发布与回滚逻辑

---

### 四、配置 GitHub Actions Secrets

在项目所在的 GitHub 仓库中，进入：

`Settings -> Secrets and variables -> Actions -> New repository secret`

配置以下 Secrets：

- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_REGION`（例如 `ap-southeast-1`）
- `S3_BUCKET_PRIMARY`（你的 S3 桶名，须开启 Versioning）
- `CLOUDFRONT_DISTRIBUTION_ID`（CloudFront 分发 ID）

工作流中使用这些 Secrets 来访问 AWS 并执行部署 / 回滚。

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

5. **上传 `index.html`（不缓存 + 可回滚）**

   ```bash
   aws s3 cp dist/index.html "s3://${S3_BUCKET_PRIMARY}/index.html" \
     --cache-control "no-store" \
     --content-type "text/html; charset=utf-8"
   ```

   - 为 HTML 设置：
     - `Cache-Control: no-store`（避免被浏览器和 CDN 长时间缓存）
   - 由于 S3 桶开启了 Versioning：
     - 每次上传 `index.html` 都会产生一个新的对象版本
     - 这些版本可以用来进行**快速回滚**

6. **创建 CloudFront 缓存失效**

   ```bash
   aws cloudfront create-invalidation \
     --distribution-id "${CLOUDFRONT_DISTRIBUTION_ID}" \
     --paths "/*"
   ```

   这样可以让终端用户尽快拿到新的 HTML 和静态资源。

---

### 六、回滚流程（基于 index.html Versioning）

相关文件：`/.github/workflows/rollback-index.yml`

触发方式：**手动**（`workflow_dispatch`），带两个输入：

- `confirm`: 必须填写 **`ROLLBACK`** 才会执行
- `version_id`: 你希望回滚到的 `index.html` 对象版本 ID

#### 1. 获取 `index.html` 的历史 VersionId

你可以通过 AWS 控制台查看对象版本，或者使用 AWS CLI：

```bash
aws s3api list-object-versions \
  --bucket my-spa-prod-bucket \
  --prefix index.html \
  --max-items 5 \
  --output table
```

记下你想要回退到的那一行的 `VersionId`。

#### 2. 在 GitHub Actions 中触发回滚

1. 打开 `Actions` 页签
2. 选择 `Rollback SPA by index.html version` 工作流
3. 点击 `Run workflow`
4. 在 `confirm` 中填写 **`ROLLBACK`**
5. 在 `version_id` 中填写刚才记录的 `VersionId`

工作流会执行：

1. 配置 AWS 凭证  
2. 执行：

   ```bash
   aws s3api copy-object \
     --bucket "${S3_BUCKET_PRIMARY}" \
     --copy-source "${S3_BUCKET_PRIMARY}/index.html?versionId=${TARGET_VERSION_ID}" \
     --key "index.html"
   ```

   - 这会把指定 `VersionId` 的 `index.html` 复制为当前版本

3. 创建 CloudFront 失效：

   ```bash
   aws cloudfront create-invalidation \
     --distribution-id "${CLOUDFRONT_DISTRIBUTION_ID}" \
     --paths "/index.html" "/*"
   ```

CloudFront 更新后，用户将看到指定历史版本对应的前端界面。

---

### 七、如何在演示中讲清“不同文件缓存策略 + 回滚”

- **缓存策略差异**
  - 打开开发者工具（Network），访问你的 CloudFront 域名
  - 观察：
    - `index.html` 的响应头中 `Cache-Control: no-store`
    - JS / CSS / 图片等 `assets` 的 `Cache-Control: public,max-age=31536000,immutable`
  - 可以强调：这正是典型的 SPA 部署模式：
    - HTML 快速更新，不能被长时间缓存
    - 静态资源带 hash，可长时间缓存以提升性能

- **发布 + 人工确认**
  - 在 GitHub Actions 里演示：
    - 修改前端文案，push 后手动触发 `Deploy SPA to S3 + CloudFront`
    - 指出 `confirm` 输入框就是一个**简单的人工确认**

- **回滚**
  - 演示使用 `list-object-versions` 或控制台看历史版本
  - 在 `Rollback SPA by index.html version` 工作流中填写 `ROLLBACK` + 对应 `VersionId`
  - 刷新前端，看页面内容回到旧版本

---

### 八、后续扩展建议

在真实项目中，你可以在这个 Demo 基础上进一步扩展：

- 为不同路径配置更精细的 CloudFront 行为（例如 `/assets/*` 一个行为，`/*` 一个行为）
- 使用 GitHub Environments 的「Required reviewers」做正式环境审批
- 将本仓库的两个工作流迁移到你自己的项目，直接复用「单桶 + index.html versioning + 不同缓存策略」的做法

本 Demo 的目标是：用尽量少的文件，清晰展示**SPA + S3 + CloudFront + GitHub Actions + 对象版本回滚 + 差异化缓存策略**的完整链路。
