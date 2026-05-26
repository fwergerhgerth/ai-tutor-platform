import { useEffect, useMemo, useState } from 'react';

type SourceProfile = {
  sourceId: string;
  title: string;
  layout: string;
  chapterPatterns: string[];
  sectionPatterns: string[];
  problemPatterns: string[];
  blockMarkers: Record<string, string>;
  pageOffset?: number;
};

type PageText = {
  page: number;
  text: string;
};

type PreviewRequest = {
  profile: SourceProfile;
  pages: PageText[];
};

type TaxonomyNode = {
  id: string;
  parentId?: string;
  kind: string;
  title: string;
  path: string[];
  page: number;
};

type ProblemSpan = {
  id: string;
  page: number;
  number: string;
  content: string;
  chapterId?: string;
  sectionId?: string;
  blockType?: string;
  labelIds: string[];
};

type QualityIssue = {
  severity: string;
  code: string;
  message: string;
  page?: number;
};

type PreviewResponse = {
  sourceId: string;
  title: string;
  taxonomy: TaxonomyNode[];
  problems: ProblemSpan[];
  issues: QualityIssue[];
  metrics: {
    pageCount: number;
    taxonomyCount: number;
    problemCount: number;
    orphanProblem: number;
    issueCount: number;
    textQualityHints: number;
  };
};

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8080';

const sampleProfile: SourceProfile = {
  sourceId: 'a4-shuer-ten-years',
  title: '考研数学这十年数二做题本',
  layout: 'single_column',
  chapterPatterns: ['^第[一二三四五六七八九十]+章'],
  sectionPatterns: ['^§\\d+\\.\\d+\\s+'],
  problemPatterns: ['^\\(\\d+\\)'],
  blockMarkers: {
    ten_year_exam: '十年真题',
    selected_problem: '真题精选',
    summary_note: '考点总结',
  },
  pageOffset: 0,
};

const samplePages: PageText[] = [
  {
    page: 72,
    text: `第三章 一元函数积分学
§3.1 不定积分、定积分与反常积分的概念
十年真题
(1) 设 f(x) 连续，判断原函数与不定积分的关系。
(2) 已知反常积分收敛，判断参数取值范围。`,
  },
  {
    page: 80,
    text: `§3.2 不定积分、定积分与反常积分的计算
十年真题
(1) 计算 ∫ f(g(x))g'(x) dx。
(2) 计算含根式结构的定积分，并判断是否适合换元。`,
  },
];

function App() {
  const [profileText, setProfileText] = useState(JSON.stringify(sampleProfile, null, 2));
  const [pagesText, setPagesText] = useState(JSON.stringify(samplePages, null, 2));
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const taxonomyById = useMemo(() => {
    const map = new Map<string, TaxonomyNode>();
    preview?.taxonomy.forEach((node) => map.set(node.id, node));
    return map;
  }, [preview]);

  useEffect(() => {
    void runPreview();
  }, []);

  async function loadSample() {
    setError('');
    try {
      const response = await fetch(`${API_BASE}/api/ingestion/sample`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const payload = await response.json();
      setProfileText(JSON.stringify(payload.request.profile, null, 2));
      setPagesText(JSON.stringify(payload.request.pages, null, 2));
      setPreview(payload.response);
    } catch (err) {
      setProfileText(JSON.stringify(sampleProfile, null, 2));
      setPagesText(JSON.stringify(samplePages, null, 2));
      setError(`无法加载后端样例，已使用本地样例。${messageOf(err)}`);
    }
  }

  async function runPreview() {
    setLoading(true);
    setError('');
    try {
      const request: PreviewRequest = {
        profile: JSON.parse(profileText) as SourceProfile,
        pages: JSON.parse(pagesText) as PageText[],
      };
      const response = await fetch(`${API_BASE}/api/ingestion/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? `HTTP ${response.status}`);
      }
      setPreview(payload);
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">AI Tutor Platform</p>
          <h1>教材/讲义导入工作台</h1>
        </div>
        <div className="actions">
          <button className="secondary" onClick={loadSample}>
            加载样例
          </button>
          <button onClick={runPreview} disabled={loading}>
            {loading ? '解析中' : '运行预览'}
          </button>
        </div>
      </header>

      <section className="workspace">
        <div className="editor-pane">
          <div className="pane-header">
            <h2>Source Profile</h2>
            <span>章节、题号、区块规则</span>
          </div>
          <textarea
            value={profileText}
            onChange={(event) => setProfileText(event.target.value)}
            spellCheck={false}
          />
        </div>

        <div className="editor-pane">
          <div className="pane-header">
            <h2>PDF Text Pages</h2>
            <span>上游 PDF 解析后的页文本</span>
          </div>
          <textarea
            value={pagesText}
            onChange={(event) => setPagesText(event.target.value)}
            spellCheck={false}
          />
        </div>
      </section>

      {error && <div className="error-bar">{error}</div>}

      {preview && (
        <section className="result-grid">
          <div className="metric-strip">
            <Metric label="页数" value={preview.metrics.pageCount} />
            <Metric label="标签节点" value={preview.metrics.taxonomyCount} />
            <Metric label="题目" value={preview.metrics.problemCount} />
            <Metric label="未挂接题" value={preview.metrics.orphanProblem} />
            <Metric label="质量提示" value={preview.metrics.issueCount} />
          </div>

          <div className="result-pane">
            <div className="pane-header">
              <h2>课程标签体系</h2>
              <span>{preview.sourceId}</span>
            </div>
            <div className="taxonomy-list">
              {preview.taxonomy.map((node) => (
                <div className={`taxonomy-row ${node.kind}`} key={node.id}>
                  <span className="kind">{node.kind}</span>
                  <div>
                    <strong>{node.title}</strong>
                    <p>p.{node.page} · {node.id}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="result-pane wide">
            <div className="pane-header">
              <h2>题目挂接预览</h2>
              <span>按识别顺序展示</span>
            </div>
            <div className="problem-list">
              {preview.problems.map((problem) => (
                <article className="problem-row" key={problem.id}>
                  <div className="problem-meta">
                    <strong>{problem.number}</strong>
                    <span>p.{problem.page}</span>
                    {problem.blockType && <span>{problem.blockType}</span>}
                  </div>
                  <p>{problem.content}</p>
                  <div className="labels">
                    {problem.labelIds.map((labelId) => (
                      <span key={labelId}>{taxonomyById.get(labelId)?.title ?? labelId}</span>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          </div>

          <div className="result-pane">
            <div className="pane-header">
              <h2>质量检查</h2>
              <span>需要复核的解析结果</span>
            </div>
            <div className="issue-list">
              {preview.issues.length === 0 && <p className="empty">暂无质量问题</p>}
              {preview.issues.map((issue, index) => (
                <div className={`issue-row ${issue.severity}`} key={`${issue.code}-${index}`}>
                  <strong>{issue.code}</strong>
                  <p>{issue.message}</p>
                  {issue.page ? <span>p.{issue.page}</span> : null}
                </div>
              ))}
            </div>
          </div>
        </section>
      )}
    </main>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function messageOf(err: unknown) {
  return err instanceof Error ? err.message : String(err);
}

export default App;
