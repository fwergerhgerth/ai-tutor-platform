import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
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
  BookOpen,
  Brain,
  CheckCircle2,
  ClipboardCheck,
  Database,
  FileText,
  GitBranch,
  GraduationCap,
  Home,
  Layers3,
  ListChecks,
  Network,
  Play,
  RefreshCw,
  Save,
  Search,
  Settings,
  Settings2,
  Table2,
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
};

type SelectedItem =
  | { type: 'node'; node: Node<GraphNodeData> }
  | { type: 'edge'; edge: Edge }
  | null;

type WorkspaceTab = 'import' | 'structure' | 'graph' | 'review';

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

const tabs: Array<{ id: WorkspaceTab; label: string; icon: ReactNode }> = [
  { id: 'import', label: 'Import', icon: <Upload size={15} /> },
  { id: 'structure', label: 'Structure', icon: <BookOpen size={15} /> },
  { id: 'graph', label: 'Graph', icon: <Network size={15} /> },
  { id: 'review', label: 'Review', icon: <ClipboardCheck size={15} /> },
];

const platformNav = [
  { label: 'Dashboard', icon: <Home size={16} /> },
  { label: 'Course Ingestion', icon: <Upload size={16} />, active: true },
  { label: 'Knowledge Graph', icon: <Network size={16} /> },
  { label: 'Exercise Bank', icon: <Database size={16} /> },
  { label: 'Recommendation', icon: <Brain size={16} /> },
  { label: 'Students', icon: <GraduationCap size={16} /> },
  { label: 'Review Queue', icon: <ListChecks size={16} /> },
  { label: 'Settings', icon: <Settings size={16} /> },
];

const nodeTypes = {
  courseNode: CourseNode,
};

function App() {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('graph');
  const [profileText, setProfileText] = useState(JSON.stringify(sampleProfile, null, 2));
  const [pagesText, setPagesText] = useState(JSON.stringify(samplePages, null, 2));
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [nodes, setNodes] = useState<Node<GraphNodeData>[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [selectedItem, setSelectedItem] = useState<SelectedItem>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const taxonomyById = useMemo(() => {
    const map = new Map<string, TaxonomyNode>();
    preview?.taxonomy.forEach((node) => map.set(node.id, node));
    return map;
  }, [preview]);

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

  const selectedNodeProblems = useMemo(() => {
    if (selectedItem?.type !== 'node' || !preview) {
      return [];
    }
    return preview.problems.filter((problem) => problem.labelIds.includes(selectedItem.node.id));
  }, [preview, selectedItem]);

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

  async function importSourceFile(file: File) {
    setError('');
    const text = await file.text();
    const lowerName = file.name.toLowerCase();

    if (lowerName.endsWith('.pdf')) {
      setError('PDF 上传入口已接上，但 PDF parser adapter 还没接入。当前可导入 .json 或 .txt 来验证工作流。');
      return;
    }

    if (lowerName.endsWith('.json')) {
      try {
        const payload = JSON.parse(text);
        if (payload.profile || payload.pages) {
          if (payload.profile) {
            setProfileText(JSON.stringify(payload.profile, null, 2));
          }
          if (payload.pages) {
            setPagesText(JSON.stringify(payload.pages, null, 2));
          }
          return;
        }
        if (Array.isArray(payload)) {
          setPagesText(JSON.stringify(payload, null, 2));
          return;
        }
        throw new Error('JSON 需要是 PreviewRequest 或 PageText[]。');
      } catch (err) {
        setError(`JSON 导入失败：${messageOf(err)}`);
        return;
      }
    }

    setPagesText(
      JSON.stringify(
        [
          {
            page: 1,
            text,
          },
        ],
        null,
        2,
      ),
    );
  }

  function saveDraft() {
    if (!preview) {
      setError('当前没有可保存的解析结果，请先运行解析。');
      return;
    }
    const payload = {
      savedAt: new Date().toISOString(),
      sourceId: preview.sourceId,
      title: preview.title,
      preview,
      graph: {
        nodes,
        edges,
      },
    };
    downloadJSON(`${preview.sourceId || 'course'}-graph-draft.json`, payload);
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
    <main className="app-root">
      <aside className="global-sidebar">
        <div className="platform-brand">
          <div className="platform-mark">
            <GitBranch size={20} />
          </div>
          <div>
            <strong>AI Tutor</strong>
            <span>Platform</span>
          </div>
        </div>

        <nav className="platform-nav">
          {platformNav.map((item) => (
            <button className={item.active ? 'active' : ''} key={item.label}>
              {item.icon}
              {item.label}
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <span>Current workspace</span>
          <strong>{preview?.sourceId ?? 'draft-source'}</strong>
        </div>
      </aside>

      <section className="module-shell">
        <input
          ref={fileInputRef}
          className="hidden-input"
          type="file"
          accept=".json,.txt,.md,.pdf"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) {
              void importSourceFile(file);
            }
            event.target.value = '';
          }}
        />

        <header className="app-chrome">
        <div className="brand">
          <div className="brand-mark">
            <GitBranch size={20} />
          </div>
          <div>
            <span>AI Tutor Platform</span>
            <strong>{preview?.title ?? 'Course ingestion workspace'}</strong>
          </div>
        </div>

        <nav className="workspace-tabs">
          {tabs.map((tab) => (
            <button className={activeTab === tab.id ? 'active' : ''} key={tab.id} onClick={() => setActiveTab(tab.id)}>
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </nav>

        <div className="chrome-actions">
          <button className="secondary-action" onClick={loadSample}>
            <RefreshCw size={15} />
            样例
          </button>
          <button className="secondary-action" onClick={() => fileInputRef.current?.click()}>
            <Upload size={15} />
            导入
          </button>
          <button onClick={runPreview} disabled={loading}>
            <Play size={15} />
            {loading ? '解析中' : '解析'}
          </button>
          <button className="primary-dark" onClick={saveDraft}>
            <Save size={15} />
            保存
          </button>
        </div>
      </header>

      {error && (
        <div className="error-banner">
          <AlertTriangle size={16} />
          {error}
        </div>
      )}

      <section className="workspace-grid">
        <aside className="navigation-pane">
          <PanelHeader title="Workspace" caption={preview?.sourceId ?? 'draft'} />
          <DocumentSummary preview={preview} />
          <SourceOutline
            nodes={nodes}
            preview={preview}
            onSelect={(node) => setSelectedItem({ type: 'node', node })}
          />
        </aside>

        <section className="content-pane">
          {activeTab === 'import' && (
            <ImportView
              preview={preview}
              profileText={profileText}
              pagesText={pagesText}
              onProfileChange={setProfileText}
              onPagesChange={setPagesText}
              onUpload={() => fileInputRef.current?.click()}
            />
          )}

          {activeTab === 'structure' && (
            <StructureView
              preview={preview}
              nodes={nodes}
              onSelect={(node) => setSelectedItem({ type: 'node', node })}
            />
          )}

          {activeTab === 'graph' && (
            <GraphView nodes={nodes} edges={edges} onNodeClick={selectNode} onEdgeClick={selectEdge} />
          )}

          {activeTab === 'review' && (
            <ReviewView
              problems={filteredProblems}
              total={preview?.problems.length ?? 0}
              query={query}
              taxonomyById={taxonomyById}
              nodes={nodes}
              onQueryChange={setQuery}
              onSelect={(node) => setSelectedItem({ type: 'node', node })}
            />
          )}
        </section>

        <aside className="inspector-pane">
          <PanelHeader title="Inspector" caption="selection details" />
          <Inspector selectedItem={selectedItem} relatedProblems={selectedNodeProblems} />
          <IssuePanel issues={preview?.issues ?? []} />
        </aside>
      </section>
      </section>
    </main>
  );
}

function DocumentSummary({ preview }: { preview: PreviewResponse | null }) {
  return (
    <div className="document-summary">
      <strong>{preview?.title ?? sampleProfile.title}</strong>
      <div className="summary-metrics">
        <Metric icon={<FileText size={14} />} label="Pages" value={preview?.metrics.pageCount ?? 0} />
        <Metric icon={<Layers3 size={14} />} label="Nodes" value={preview?.metrics.taxonomyCount ?? 0} />
        <Metric icon={<Table2 size={14} />} label="Exercises" value={preview?.metrics.problemCount ?? 0} />
        <Metric icon={<AlertTriangle size={14} />} label="Issues" value={preview?.metrics.issueCount ?? 0} />
      </div>
    </div>
  );
}

function SourceOutline({
  nodes,
  preview,
  onSelect,
}: {
  nodes: Node<GraphNodeData>[];
  preview: PreviewResponse | null;
  onSelect: (node: Node<GraphNodeData>) => void;
}) {
  return (
    <div className="source-outline">
      <div className="section-label">Outline</div>
      {preview?.taxonomy.map((item) => (
        <button
          className={`outline-item ${item.kind}`}
          key={item.id}
          onClick={() => {
            const graphNode = nodes.find((node) => node.id === item.id);
            if (graphNode) onSelect(graphNode);
          }}
        >
          <span>{item.kind}</span>
          <strong>{item.title}</strong>
          <small>p.{item.page}</small>
        </button>
      ))}
    </div>
  );
}

function ImportView({
  preview,
  profileText,
  pagesText,
  onProfileChange,
  onPagesChange,
  onUpload,
}: {
  preview: PreviewResponse | null;
  profileText: string;
  pagesText: string;
  onProfileChange: (value: string) => void;
  onPagesChange: (value: string) => void;
  onUpload: () => void;
}) {
  return (
    <div className="tab-view import-view">
      <ViewHeader
        icon={<Upload size={18} />}
        title="Import source material"
        caption="Upload a lecture PDF, parse text pages, and inspect source profile rules."
      />

      <div className="import-grid">
        <div className="drop-zone">
          <Upload size={26} />
          <strong>Import source file</strong>
          <p>导入 .json/.txt 可直接解析；PDF 入口会提示 adapter 未接入，避免假装可用。</p>
          <button onClick={onUpload}>选择文件</button>
        </div>

        <div className="quality-panel">
          <div className="section-label">Parse quality</div>
          <QualityRow label="Text pages" value={preview?.metrics.pageCount ?? 0} />
          <QualityRow label="Detected structure nodes" value={preview?.metrics.taxonomyCount ?? 0} />
          <QualityRow label="Detected exercises" value={preview?.metrics.problemCount ?? 0} />
          <QualityRow label="Review issues" value={preview?.metrics.issueCount ?? 0} />
        </div>
      </div>

      <div className="config-grid">
        <EditorPanel title="Source Profile" value={profileText} onChange={onProfileChange} />
        <EditorPanel title="PDF Text Pages" value={pagesText} onChange={onPagesChange} />
      </div>
    </div>
  );
}

function StructureView({
  preview,
  nodes,
  onSelect,
}: {
  preview: PreviewResponse | null;
  nodes: Node<GraphNodeData>[];
  onSelect: (node: Node<GraphNodeData>) => void;
}) {
  const bySection = useMemo(() => {
    const map = new Map<string, ProblemSpan[]>();
    preview?.problems.forEach((problem) => {
      const key = problem.sectionId || 'unassigned';
      map.set(key, [...(map.get(key) ?? []), problem]);
    });
    return map;
  }, [preview]);

  return (
    <div className="tab-view">
      <ViewHeader
        icon={<BookOpen size={18} />}
        title="Course structure"
        caption="Review the extracted chapter, section, and exercise hierarchy before graph editing."
      />

      <div className="structure-list">
        {preview?.taxonomy.map((item) => (
          <button
            className={`structure-row ${item.kind}`}
            key={item.id}
            onClick={() => {
              const graphNode = nodes.find((node) => node.id === item.id);
              if (graphNode) onSelect(graphNode);
            }}
          >
            <div>
              <span>{item.kind}</span>
              <strong>{item.title}</strong>
              <small>{item.path.join(' / ')}</small>
            </div>
            <em>{bySection.get(item.id)?.length ?? 0} exercises</em>
          </button>
        ))}
      </div>
    </div>
  );
}

function GraphView({
  nodes,
  edges,
  onNodeClick,
  onEdgeClick,
}: {
  nodes: Node<GraphNodeData>[];
  edges: Edge[];
  onNodeClick: (_: unknown, node: Node<GraphNodeData>) => void;
  onEdgeClick: (_: unknown, edge: Edge) => void;
}) {
  return (
    <div className="tab-view graph-view">
      <ViewHeader
        icon={<Network size={18} />}
        title="Course graph"
        caption="Explore the generated draft graph. Drag nodes to adjust the local layout."
      />

      <div className="graph-stage">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.22 }}
          onNodeClick={onNodeClick}
          onEdgeClick={onEdgeClick}
          nodesDraggable
        >
          <Background gap={24} size={1} />
          <Controls position="bottom-right" />
          <MiniMap pannable zoomable nodeStrokeWidth={3} />
        </ReactFlow>
      </div>
    </div>
  );
}

function ReviewView({
  problems,
  total,
  query,
  taxonomyById,
  nodes,
  onQueryChange,
  onSelect,
}: {
  problems: ProblemSpan[];
  total: number;
  query: string;
  taxonomyById: Map<string, TaxonomyNode>;
  nodes: Node<GraphNodeData>[];
  onQueryChange: (value: string) => void;
  onSelect: (node: Node<GraphNodeData>) => void;
}) {
  return (
    <div className="tab-view review-view">
      <ViewHeader
        icon={<ClipboardCheck size={18} />}
        title="Exercise attachment review"
        caption="Check which course nodes each exercise is attached to."
      >
        <label className="search-box">
          <Search size={15} />
          <input value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="Search exercises" />
        </label>
      </ViewHeader>

      <div className="review-count">{problems.length} / {total} exercises</div>

      <div className="review-table">
        <div className="table-head">
          <span>No.</span>
          <span>Page</span>
          <span>Problem text</span>
          <span>Attached nodes</span>
          <span>Status</span>
        </div>
        {problems.map((problem) => (
          <button
            className="table-row"
            key={problem.id}
            onClick={() => {
              const graphNode = nodes.find((node) => node.id === problem.id);
              if (graphNode) onSelect(graphNode);
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
            <em>linked</em>
          </button>
        ))}
      </div>
    </div>
  );
}

function CourseNode({ data, selected }: NodeProps<Node<GraphNodeData>>) {
  return (
    <div className={`course-node ${data.kind} ${selected ? 'selected' : ''}`}>
      <Handle type="target" position={Position.Left} />
      <div className="node-meta">
        <span />
        {data.kind}
      </div>
      <strong>{data.title}</strong>
      <small>{data.subtitle}</small>
      {data.page ? <em>p.{data.page}</em> : null}
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

function Metric({ icon, label, value }: { icon: ReactNode; label: string; value: number }) {
  return (
    <div className="metric">
      {icon}
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

function ViewHeader({
  icon,
  title,
  caption,
  children,
}: {
  icon: ReactNode;
  title: string;
  caption: string;
  children?: ReactNode;
}) {
  return (
    <div className="view-header">
      <div className="view-title">
        <div>{icon}</div>
        <section>
          <h1>{title}</h1>
          <p>{caption}</p>
        </section>
      </div>
      {children}
    </div>
  );
}

function QualityRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="quality-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function EditorPanel({
  title,
  value,
  onChange,
}: {
  title: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="editor-panel">
      <div className="editor-title">
        <Settings2 size={15} />
        {title}
      </div>
      <textarea value={value} onChange={(event) => onChange(event.target.value)} spellCheck={false} />
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
    return <p className="empty-state">Select a node or edge to inspect its source, links, and review status.</p>;
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

function IssuePanel({ issues }: { issues: QualityIssue[] }) {
  return (
    <div className="issue-card">
      <div className="issue-title">
        <AlertTriangle size={15} />
        Quality
      </div>
      {issues.length ? (
        issues.map((issue, index) => (
          <div className={`issue-row ${issue.severity}`} key={`${issue.code}-${index}`}>
            <strong>{issue.code}</strong>
            <p>{issue.message}</p>
            {issue.page ? <span>p.{issue.page}</span> : null}
          </div>
        ))
      ) : (
        <p className="empty-state">No issues detected.</p>
      )}
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
      id: `${problem.sectionId || preview.sourceId}->${problem.id}`,
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

function downloadJSON(filename: string, payload: unknown) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export default App;
