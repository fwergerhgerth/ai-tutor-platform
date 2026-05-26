import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  GitBranch,
  GitFork,
  Layers3,
  Play,
  RefreshCw,
  Save,
  Search,
  Settings2,
  Upload,
} from 'lucide-react';

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
  kind: 'chapter' | 'section' | string;
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
  severity: 'info' | 'warn' | 'error' | string;
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

type GraphNodeData = {
  title: string;
  kind: 'book' | 'chapter' | 'section' | 'exercise';
  subtitle: string;
  page?: number;
  issueCount?: number;
};

type SelectedItem =
  | { type: 'node'; node: Node<GraphNodeData> }
  | { type: 'edge'; edge: Edge }
  | null;

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

const nodeTypes = {
  courseNode: CourseNode,
};

function App() {
  const [profileText, setProfileText] = useState(JSON.stringify(sampleProfile, null, 2));
  const [pagesText, setPagesText] = useState(JSON.stringify(samplePages, null, 2));
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [nodes, setNodes] = useState<Node<GraphNodeData>[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [selectedItem, setSelectedItem] = useState<SelectedItem>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');

  const taxonomyById = useMemo(() => {
    const map = new Map<string, TaxonomyNode>();
    preview?.taxonomy.forEach((node) => map.set(node.id, node));
    return map;
  }, [preview]);

  const selectedNodeProblems = useMemo(() => {
    if (selectedItem?.type !== 'node' || !preview) {
      return [];
    }
    return preview.problems.filter((problem) => problem.labelIds.includes(selectedItem.node.id));
  }, [preview, selectedItem]);

  const filteredProblems = useMemo(() => {
    if (!preview) {
      return [];
    }
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return preview.problems;
    }
    return preview.problems.filter((problem) => {
      const labels = problem.labelIds
        .map((id) => taxonomyById.get(id)?.title ?? id)
        .join(' ');
      return `${problem.number} ${problem.content} ${labels}`.toLowerCase().includes(normalized);
    });
  }, [preview, query, taxonomyById]);

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
      applyPreview(payload.response);
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
      applyPreview(payload);
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setLoading(false);
    }
  }

  function applyPreview(nextPreview: PreviewResponse) {
    setPreview(nextPreview);
    const graph = buildGraph(nextPreview);
    setNodes(graph.nodes);
    setEdges(graph.edges);
    setSelectedItem(graph.nodes[0] ? { type: 'node', node: graph.nodes[0] } : null);
  }

  const selectNode = useCallback((_: unknown, node: Node<GraphNodeData>) => {
    setSelectedItem({ type: 'node', node });
  }, []);

  const selectEdge = useCallback((_: unknown, edge: Edge) => {
    setSelectedItem({ type: 'edge', edge });
  }, []);

  return (
    <main className="workbench">
      <header className="toolbar">
        <div className="brand-block">
          <div className="brand-icon">
            <GitBranch size={20} />
          </div>
          <div>
            <p>AI Tutor Platform</p>
            <h1>Course Graph Workbench</h1>
          </div>
        </div>

        <div className="toolbar-actions">
          <button className="ghost-button" onClick={loadSample}>
            <RefreshCw size={16} />
            样例
          </button>
          <button className="ghost-button">
            <Upload size={16} />
            上传 PDF
          </button>
          <button onClick={runPreview} disabled={loading}>
            <Play size={16} />
            {loading ? '解析中' : '运行解析'}
          </button>
          <button className="dark-button">
            <Save size={16} />
            保存草稿
          </button>
        </div>
      </header>

      {error && (
        <div className="error-banner">
          <AlertTriangle size={16} />
          {error}
        </div>
      )}

      <section className="summary-strip">
        <Metric icon={<FileText size={16} />} label="页数" value={preview?.metrics.pageCount ?? 0} />
        <Metric icon={<Layers3 size={16} />} label="结构节点" value={preview?.metrics.taxonomyCount ?? 0} />
        <Metric icon={<GitFork size={16} />} label="题目" value={preview?.metrics.problemCount ?? 0} />
        <Metric icon={<AlertTriangle size={16} />} label="待复核" value={preview?.metrics.issueCount ?? 0} />
      </section>

      <section className="main-grid">
        <aside className="left-rail">
          <PanelHeader title="资料结构" caption={preview?.sourceId ?? '未解析'} />
          <div className="source-title">
            <strong>{preview?.title ?? sampleProfile.title}</strong>
            <span>{preview ? `${preview.taxonomy.length} 个结构节点` : '等待解析'}</span>
          </div>

          <div className="outline-list">
            {preview?.taxonomy.map((node) => (
              <button
                className={`outline-row ${node.kind}`}
                key={node.id}
                onClick={() => {
                  const graphNode = nodes.find((item) => item.id === node.id);
                  if (graphNode) {
                    setSelectedItem({ type: 'node', node: graphNode });
                  }
                }}
              >
                <span>{node.kind}</span>
                <strong>{node.title}</strong>
                <small>p.{node.page}</small>
              </button>
            ))}
          </div>

          <details className="config-drawer">
            <summary>
              <Settings2 size={15} />
              Source Profile
            </summary>
            <textarea value={profileText} onChange={(event) => setProfileText(event.target.value)} />
          </details>

          <details className="config-drawer">
            <summary>
              <FileText size={15} />
              PDF Text Pages
            </summary>
            <textarea value={pagesText} onChange={(event) => setPagesText(event.target.value)} />
          </details>
        </aside>

        <section className="canvas-pane">
          <div className="canvas-header">
            <PanelHeader title="课程结构图" caption="Book / Chapter / Section / Exercise" />
            <div className="canvas-tools">
              <button className="ghost-button compact">
                <GitBranch size={15} />
                自动布局
              </button>
              <button className="ghost-button compact">
                <CheckCircle2 size={15} />
                仅看待确认
              </button>
            </div>
          </div>
          <div className="flow-shell">
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              fitView
              fitViewOptions={{ padding: 0.2 }}
              onNodeClick={selectNode}
              onEdgeClick={selectEdge}
              onPaneClick={() => setSelectedItem(null)}
              nodesDraggable
            >
              <Background gap={22} size={1} />
              <Controls position="bottom-right" />
              <MiniMap pannable zoomable nodeStrokeWidth={3} />
            </ReactFlow>
          </div>
        </section>

        <aside className="right-rail">
          <PanelHeader title="属性面板" caption="节点、边与证据" />
          <Inspector selectedItem={selectedItem} relatedProblems={selectedNodeProblems} />

          <div className="issue-card">
            <div className="issue-title">
              <AlertTriangle size={15} />
              质量检查
            </div>
            {preview?.issues.length ? (
              preview.issues.map((issue, index) => (
                <div className={`issue-row ${issue.severity}`} key={`${issue.code}-${index}`}>
                  <strong>{issue.code}</strong>
                  <p>{issue.message}</p>
                  {issue.page ? <span>p.{issue.page}</span> : null}
                </div>
              ))
            ) : (
              <p className="empty-state">暂无解析问题</p>
            )}
          </div>
        </aside>
      </section>

      <section className="review-dock">
        <div className="dock-header">
          <PanelHeader title="题目挂接审核" caption={`${filteredProblems.length} / ${preview?.problems.length ?? 0} 道题`} />
          <label className="search-box">
            <Search size={15} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索题号、题面或标签" />
          </label>
        </div>

        <div className="exercise-table">
          <div className="table-head">
            <span>题号</span>
            <span>页码</span>
            <span>题面</span>
            <span>挂接节点</span>
            <span>状态</span>
          </div>
          {filteredProblems.map((problem) => (
            <button
              className="table-row"
              key={problem.id}
              onClick={() => {
                const graphNode = nodes.find((node) => node.id === problem.id);
                if (graphNode) {
                  setSelectedItem({ type: 'node', node: graphNode });
                }
              }}
            >
              <strong>{problem.number}</strong>
              <span>p.{problem.page}</span>
              <p>{problem.content}</p>
              <div className="label-stack">
                {problem.labelIds.map((labelId) => (
                  <span key={labelId}>{taxonomyById.get(labelId)?.title ?? labelId}</span>
                ))}
              </div>
              <em>已挂接</em>
            </button>
          ))}
        </div>
      </section>
    </main>
  );
}

function CourseNode({ data, selected }: NodeProps<Node<GraphNodeData>>) {
  return (
    <div className={`course-node ${data.kind} ${selected ? 'selected' : ''}`}>
      <Handle type="target" position={Position.Left} />
      <div className="node-kind">{data.kind}</div>
      <strong>{data.title}</strong>
      <span>{data.subtitle}</span>
      {data.page ? <small>p.{data.page}</small> : null}
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

function Metric({ icon, label, value }: { icon: ReactNode; label: string; value: number }) {
  return (
    <div className="metric-card">
      <div>{icon}</div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function PanelHeader({ title, caption }: { title: string; caption: string }) {
  return (
    <div className="panel-header">
      <h2>{title}</h2>
      <span>{caption}</span>
    </div>
  );
}

function Inspector({
  selectedItem,
  relatedProblems,
}: {
  selectedItem: SelectedItem;
  relatedProblems: ProblemSpan[];
}) {
  if (!selectedItem) {
    return <p className="empty-state">选择一个节点或关系查看详情</p>;
  }

  if (selectedItem.type === 'edge') {
    return (
      <div className="inspector-card">
        <span className="pill">edge</span>
        <h3>{selectedItem.edge.label ?? selectedItem.edge.type}</h3>
        <dl>
          <dt>from</dt>
          <dd>{selectedItem.edge.source}</dd>
          <dt>to</dt>
          <dd>{selectedItem.edge.target}</dd>
        </dl>
      </div>
    );
  }

  const node = selectedItem.node;
  return (
    <div className="inspector-card">
      <span className={`pill ${node.data.kind}`}>{node.data.kind}</span>
      <h3>{node.data.title}</h3>
      <p>{node.data.subtitle}</p>
      <dl>
        <dt>node id</dt>
        <dd>{node.id}</dd>
        <dt>source page</dt>
        <dd>{node.data.page ? `p.${node.data.page}` : 'n/a'}</dd>
        <dt>related exercises</dt>
        <dd>{relatedProblems.length}</dd>
      </dl>
      {relatedProblems.length ? (
        <div className="related-list">
          {relatedProblems.slice(0, 4).map((problem) => (
            <div key={problem.id}>
              <strong>{problem.number}</strong>
              <span>{problem.content}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function buildGraph(preview: PreviewResponse): { nodes: Node<GraphNodeData>[]; edges: Edge[] } {
  const taxonomyNodes = [...preview.taxonomy];
  const sections = taxonomyNodes.filter((node) => node.kind === 'section');
  const taxonomyIndex = new Map(taxonomyNodes.map((node, index) => [node.id, index]));
  const sectionIndex = new Map(sections.map((node, index) => [node.id, index]));

  const nodes: Node<GraphNodeData>[] = [
    {
      id: preview.sourceId,
      type: 'courseNode',
      position: { x: 20, y: 180 },
      data: {
        kind: 'book',
        title: preview.title,
        subtitle: `${preview.metrics.pageCount} pages`,
      },
    },
  ];

  taxonomyNodes.forEach((item) => {
    const index = taxonomyIndex.get(item.id) ?? 0;
    const isChapter = item.kind === 'chapter';
    const sectionRank = sectionIndex.get(item.id) ?? index;
    nodes.push({
      id: item.id,
      type: 'courseNode',
      position: {
        x: isChapter ? 330 : 620,
        y: isChapter ? 120 + index * 150 : 50 + sectionRank * 170,
      },
      data: {
        kind: isChapter ? 'chapter' : 'section',
        title: item.title,
        subtitle: item.path.slice(0, -1).join(' / ') || 'source taxonomy',
        page: item.page,
      },
    });
  });

  preview.problems.forEach((problem, index) => {
    const sectionRank = problem.sectionId ? sectionIndex.get(problem.sectionId) ?? 0 : 0;
    const localOffset = preview.problems
      .slice(0, index)
      .filter((item) => item.sectionId === problem.sectionId).length;
    nodes.push({
      id: problem.id,
      type: 'courseNode',
      position: {
        x: 960,
        y: 30 + sectionRank * 170 + localOffset * 86,
      },
      data: {
        kind: 'exercise',
        title: `${problem.number} p.${problem.page}`,
        subtitle: problem.content.slice(0, 52),
        page: problem.page,
      },
    });
  });

  const edges: Edge[] = [];
  taxonomyNodes.forEach((item) => {
    edges.push({
      id: `${item.parentId || preview.sourceId}->${item.id}`,
      source: item.parentId || preview.sourceId,
      target: item.id,
      label: item.parentId ? 'CONTAINS' : 'HAS_CHAPTER',
      markerEnd: { type: MarkerType.ArrowClosed },
      style: { strokeWidth: 1.5 },
    });
  });

  preview.problems.forEach((problem) => {
    edges.push({
      id: `${problem.id}->${problem.sectionId || preview.sourceId}`,
      source: problem.sectionId || preview.sourceId,
      target: problem.id,
      label: 'LOCATED_IN',
      markerEnd: { type: MarkerType.ArrowClosed },
      style: { strokeWidth: 1.5 },
    });
  });

  return { nodes, edges };
}

function messageOf(err: unknown) {
  return err instanceof Error ? err.message : String(err);
}

export default App;
