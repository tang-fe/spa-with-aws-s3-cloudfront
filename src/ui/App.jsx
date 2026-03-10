import React, { useState } from "react";
import { BrowserRouter, Routes, Route, NavLink } from "react-router-dom";

const mockReleases = [
  {
    id: "2026-03-10T10:00:00Z",
    label: "v1.0.0 - Initial SPA demo",
    status: "Active",
  },
  {
    id: "2026-03-09T16:30:00Z",
    label: "v0.9.0 - Previous version",
    status: "Rollback target",
  },
];

function Home() {
  return (
    <main className="layout">
      <section className="card">
        <h2>1. 构建结果 (本地)</h2>
        <p>
          运行 <code>npm run build</code> 后，静态文件会输出到 <code>dist/</code>{" "}
          目录。
        </p>
        <ul>
          <li>HTML / JS / CSS / 图片资源</li>
          <li>适合托管在 S3 上作为静态网站</li>
        </ul>
      </section>

      <section className="card">
        <h2>2. 客户端路由演示</h2>
        <p>
          点击顶部导航栏中的不同菜单，例如「发布流程」「回滚流程」，URL 会变化但页面不会整页刷新，
          由 <code>react-router-dom</code> 在浏览器端完成路由切换。
        </p>
        <p>在 S3 + CloudFront 环境下，需要把所有路径都回退到 index.html 以支持 SPA 路由。</p>
      </section>
    </main>
  );
}

function DeployFlow() {
  return (
    <main className="layout">
      <section className="card">
        <h2>发布到 S3 + CloudFront</h2>
        <ol>
          <li>人工审核构建结果与变更说明</li>
          <li>确认后将 <code>dist/</code> 同步到 S3 桶（只增不删）</li>
          <li>创建 CloudFront 缓存失效，立即生效</li>
        </ol>
        <p className="hint">
          发布完全通过 GitHub Actions 完成：<code>.github/workflows/deploy.yml</code> 在手动触发并输入
          <strong>DEPLOY</strong> 后，会构建项目并上传到已开启 Versioning 的 S3 桶。静态资源会带上长缓存
          <code>Cache-Control: public,max-age=31536000,immutable</code>，而 <code>index.html</code>{" "}
          使用 <code>Cache-Control: no-store</code>，避免被浏览器和 CDN 长时间缓存，同时每次上传都会生成新的对象版本以支持回滚。
        </p>
      </section>
    </main>
  );
}

function RollbackFlow() {
  const [selectedRelease, setSelectedRelease] = useState(mockReleases[0].id);

  return (
    <main className="layout">
      <section className="card">
        <h2>回滚演示</h2>
        <p>选择要回滚到的发布版本（示例数据）：</p>
        <div className="release-list">
          {mockReleases.map((r) => (
            <button
              key={r.id}
              className={
                "release-item" +
                (selectedRelease === r.id ? " release-item--active" : "")
              }
              onClick={() => setSelectedRelease(r.id)}
            >
              <span className="release-label">{r.label}</span>
              <span className="release-meta">{r.status}</span>
            </button>
          ))}
        </div>
        <p>
          实际环境中，推荐直接使用 GitHub Actions 的{" "}
          <code>.github/workflows/rollback-index.yml</code>：先通过 AWS 控制台或命令行查看
          <code>index.html</code> 的历史 VersionId，然后在手动触发工作流时填写 <strong>ROLLBACK</strong>{" "}
          和目标 VersionId，工作流会将该版本复制为当前的 <code>index.html</code>，并触发 CloudFront
          缓存失效。
        </p>
      </section>
    </main>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <div className="page">
        <header className="header">
          <h1>SPA Demo: AWS S3 + CloudFront</h1>
          <p>可视化展示：构建、发布、回滚 + 客户端路由。</p>
          <nav className="nav">
            <NavLink
              to="/"
              end
              className={({ isActive }) =>
                "nav-link" + (isActive ? " nav-link--active" : "")
              }
            >
              总览
            </NavLink>
            <NavLink
              to="/deploy"
              className={({ isActive }) =>
                "nav-link" + (isActive ? " nav-link--active" : "")
              }
            >
              发布流程
            </NavLink>
            <NavLink
              to="/rollback"
              className={({ isActive }) =>
                "nav-link" + (isActive ? " nav-link--active" : "")
              }
            >
              回滚流程
            </NavLink>
          </nav>
        </header>

        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/deploy" element={<DeployFlow />} />
          <Route path="/rollback" element={<RollbackFlow />} />
        </Routes>

        <footer className="footer">
          <p>查看 <code>README.md</code> 了解 AWS 侧 S3 / CloudFront 创建，以及 GitHub Actions 的使用方式。</p>
        </footer>
      </div>
    </BrowserRouter>
  );
}

