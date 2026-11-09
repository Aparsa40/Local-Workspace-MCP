import { useMemo, useState } from "react";
import {
  Activity, AlertTriangle, ArrowRight, ArrowUpRight,
  Bell, Check, CheckCircle2, ChevronDown, ChevronRight, CircleHelp,
  Clock3, Code2, Copy, Cpu, Database, Download, FileCode2, FileSearch,
  FileText, Folder, FolderPlus, FolderTree, Gauge, GitBranch, HardDrive,
  LayoutDashboard, LockKeyhole, MoreHorizontal, Network,
  Plus, Power, RefreshCw, Search, Server, Settings, Shield, ShieldAlert,
  ShieldCheck, SlidersHorizontal, Terminal, Trash2, Unplug, X, Zap,
} from "lucide-react";

type Page = "Dashboard" | "Workspaces" | "Permissions" | "Tools" | "Activity & Audit" | "Connections" | "Settings";
type Workspace = { id: number; name: string; path: string; status: "Enabled" | "Disabled"; access: string; updated: string };
type EventRow = { id: number; time: string; action: string; target: string; workspace: string; result: "Allowed" | "Denied" | "Completed" | "Blocked"; detail: string };

const initialWorkspaces: Workspace[] = [
  { id: 1, name: "Development Projects", path: "F:\\All-Projects-v3", status: "Enabled", access: "Read · Search", updated: "2 min ago" },
  { id: 2, name: "ParsSynapse Chat", path: "F:\\All-Projects-v3\\ParsSynapse-Chat", status: "Enabled", access: "Read · Write · Search", updated: "Today, 10:42 AM" },
  { id: 3, name: "Private Workspace", path: "F:\\Private-Workspace", status: "Disabled", access: "No access", updated: "Yesterday" },
];

const initialEvents: EventRow[] = [
  { id: 1, time: "10:48:22", action: "read_file", target: "src/App.tsx", workspace: "ParsSynapse Chat", result: "Allowed", detail: "Read operation permitted by workspace policy." },
  { id: 2, time: "10:45:09", action: "search_files", target: "**/*.ts", workspace: "Development Projects", result: "Completed", detail: "Search completed · 18 results returned." },
  { id: 3, time: "10:41:51", action: "read_file", target: "secrets.env", workspace: "Development Projects", result: "Denied", detail: "Sensitive file pattern is blocked by security policy." },
  { id: 4, time: "10:36:14", action: "list_files", target: "src/", workspace: "ParsSynapse Chat", result: "Allowed", detail: "Directory listing permitted." },
  { id: 5, time: "10:21:03", action: "read_file", target: "../Windows/System32", workspace: "Outside configured roots", result: "Blocked", detail: "Path traversal attempt rejected before filesystem access." },
];

const navItems: { label: Page; icon: typeof LayoutDashboard; group: string }[] = [
  { label: "Dashboard", icon: LayoutDashboard, group: "OVERVIEW" },
  { label: "Workspaces", icon: FolderTree, group: "ACCESS CONTROL" },
  { label: "Permissions", icon: ShieldCheck, group: "ACCESS CONTROL" },
  { label: "Tools", icon: Code2, group: "ACCESS CONTROL" },
  { label: "Activity & Audit", icon: Activity, group: "MONITORING" },
  { label: "Connections", icon: Network, group: "MONITORING" },
  { label: "Settings", icon: Settings, group: "SYSTEM" },
];

const capabilityInfo = [
  { key: "list", label: "List files", desc: "View directory contents and file names.", risk: "Low" },
  { key: "read", label: "Read files", desc: "Read the contents of permitted files.", risk: "Medium" },
  { key: "search", label: "Search", desc: "Search names and permitted file content.", risk: "Medium" },
  { key: "metadata", label: "File metadata", desc: "View size, timestamps and file type.", risk: "Low" },
  { key: "write", label: "Write files", desc: "Create or update file contents.", risk: "High" },
  { key: "create", label: "Create directories", desc: "Create new folders inside this workspace.", risk: "High" },
  { key: "rename", label: "Rename & move", desc: "Change file or directory locations.", risk: "High" },
  { key: "delete", label: "Delete", desc: "Remove files or directories.", risk: "Critical" },
];

const toolGroups = [
  { title: "Filesystem", note: "Available in the current Core foundation", tools: [
    { name: "list_files", desc: "List entries in an authorized directory.", cap: "list", state: "Available", icon: Folder },
    { name: "read_file", desc: "Read a bounded UTF-8 text file.", cap: "read", state: "Available", icon: FileText },
    { name: "search_files", desc: "Search names with bounded traversal.", cap: "search", state: "Available", icon: FileSearch },
    { name: "get_file_info", desc: "Read limited file and directory metadata.", cap: "metadata", state: "Available", icon: HardDrive },
    { name: "write_file", desc: "Create or update file contents.", cap: "write", state: "Planned", icon: FileCode2 },
    { name: "create_directory", desc: "Create a directory under an authorized root.", cap: "create", state: "Planned", icon: FolderPlus },
    { name: "move_file", desc: "Move or rename an authorized resource.", cap: "rename", state: "Planned", icon: ArrowRight },
    { name: "delete_file", desc: "Delete a resource after safeguards.", cap: "delete", state: "Planned", icon: Trash2 },
  ]},
  { title: "Developer modules", note: "Future modules · not executable in this prototype", tools: [
    { name: "git_status", desc: "Inspect repository status and working tree.", cap: "git", state: "Planned", icon: GitBranch },
    { name: "terminal_exec", desc: "Run narrowly allowlisted commands.", cap: "terminal", state: "Planned", icon: Terminal },
    { name: "powershell_run", desc: "Run constrained PowerShell workflows.", cap: "powershell", state: "Planned", icon: Cpu },
  ]},
];

const clientConfig = `{
  "mcpServers": {
    "local-workspace": {
      "command": "node",
      "args": ["C:/Program Files/Local-Workspace-MCP/dist/index.js"],
      "env": {
        "LWMCP_CONFIG": "C:/Users/you/AppData/Roaming/Local-Workspace-MCP/permissions.json"
      }
    }
  }
}`;

function App() {
  const [page, setPage] = useState<Page>("Dashboard");
  const [workspaces, setWorkspaces] = useState(initialWorkspaces);
  const [selectedWorkspace, setSelectedWorkspace] = useState(2);
  const [permissions, setPermissions] = useState<Record<number, string[]>>({
    1: ["list", "read", "search", "metadata"],
    2: ["list", "read", "search", "metadata", "write", "create"],
    3: [],
  });
  const [enabledTools, setEnabledTools] = useState(["list_files", "read_file", "search_files", "get_file_info"]);
  const [events] = useState(initialEvents);
  const [filter, setFilter] = useState("All events");
  const [query, setQuery] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPath, setNewPath] = useState("");
  const [toast, setToast] = useState("");
  const [settingsTab, setSettingsTab] = useState("General");
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);

  const activeWorkspace = workspaces.find((w) => w.id === selectedWorkspace) ?? workspaces[0];
  const filteredEvents = useMemo(() => events.filter((event) => {
    const matchesFilter = filter === "All events" || (filter === "Denied" ? ["Denied", "Blocked"].includes(event.result) : event.result === filter);
    const text = `${event.action} ${event.target} ${event.workspace} ${event.detail}`.toLowerCase();
    return matchesFilter && text.includes(query.toLowerCase());
  }), [events, filter, query]);

  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2800);
  };

  const togglePermission = (key: string) => {
    if (!activeWorkspace) return;
    setPermissions((current) => {
      const currentKeys = current[activeWorkspace.id] ?? [];
      const next = currentKeys.includes(key) ? currentKeys.filter((item) => item !== key) : [...currentKeys, key];
      return { ...current, [activeWorkspace.id]: next };
    });
  };

  const toggleWorkspace = (id: number) => {
    setWorkspaces((items) => items.map((item) => item.id === id ? { ...item, status: item.status === "Enabled" ? "Disabled" : "Enabled" } : item));
    notify("Workspace state updated in this prototype.");
  };

  const addWorkspace = () => {
    if (!newName.trim() || !newPath.trim()) {
      notify("Enter both a workspace name and an absolute folder path.");
      return;
    }
    const id = Math.max(0, ...workspaces.map((item) => item.id)) + 1;
    setWorkspaces((items) => [...items, { id, name: newName.trim(), path: newPath.trim(), status: "Enabled", access: "No access", updated: "Just now" }]);
    setPermissions((current) => ({ ...current, [id]: [] }));
    setSelectedWorkspace(id);
    setNewName("");
    setNewPath("");
    setShowAdd(false);
    notify("Workspace added to the prototype state (no real folder access).");
  };

  const removeWorkspace = (id: number) => {
    setWorkspaces((items) => items.filter((item) => item.id !== id));
    if (selectedWorkspace === id) setSelectedWorkspace(workspaces.find((w) => w.id !== id)?.id ?? 1);
    setConfirmDelete(null);
    notify("Workspace removed from prototype state. No files were deleted.");
  };

  const toggleTool = (name: string, state: string) => {
    if (state !== "Available") {
      notify("This tool is planned and is not implemented in the MCP Core yet.");
      return;
    }
    setEnabledTools((items) => items.includes(name) ? items.filter((item) => item !== name) : [...items, name]);
    notify("Tool availability updated in this prototype.");
  };

  const copyConfig = async () => {
    try {
      await navigator.clipboard.writeText(clientConfig);
      notify("Example configuration copied.");
    } catch {
      notify("Clipboard access is unavailable. Select and copy the configuration manually.");
    }
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark"><ShieldCheck size={21} /></div>
          <div><div className="brand-name">Local Workspace</div><div className="brand-sub">MCP CONTROL CENTER</div></div>
          <button className="icon-button sidebar-collapse" aria-label="Collapse sidebar"><MoreHorizontal size={18}/></button>
        </div>
        <div className="server-mini">
          <div className="server-mini-icon"><Server size={17}/></div>
          <div className="server-mini-copy"><strong>Local MCP Core</strong><span><i className="status-dot green"/> Ready to launch</span></div>
          <ChevronDown size={15} className="muted-icon"/>
        </div>
        {["OVERVIEW", "ACCESS CONTROL", "MONITORING", "SYSTEM"].map((group) => (
          <div className="nav-group" key={group}>
            <div className="nav-label">{group}</div>
            {navItems.filter((item) => item.group === group).map(({ label, icon: Icon }) => (
              <button key={label} className={`nav-item ${page === label ? "active" : ""}`} onClick={() => setPage(label)}>
                <Icon size={17}/><span>{label}</span>{label === "Activity & Audit" && <span className="nav-count">2</span>}
              </button>
            ))}
          </div>
        ))}
        <div className="sidebar-bottom">
          <div className="security-card"><div className="security-card-icon"><Shield size={16}/></div><div><strong>Protected by policy</strong><span>Default-deny access control</span></div></div>
          <div className="profile-row"><div className="avatar">AP</div><div className="profile-copy"><strong>Local Administrator</strong><span>Desktop profile</span></div><MoreHorizontal size={17} className="muted-icon"/></div>
          <div className="version-row"><span>Prototype v0.1.0</span><span>Build preview</span></div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumbs"><span>Workspace</span><ChevronRight size={14}/><strong>{page}</strong></div>
          <div className="topbar-actions"><div className="environment-pill"><span className="status-dot green"/> Local environment</div><button className="icon-button" aria-label="Notifications" onClick={() => notify("You're all caught up.")}><Bell size={17}/><span className="notification-dot"/></button><button className="help-button" onClick={() => setPage("Connections")}><CircleHelp size={16}/> Help</button></div>
        </header>
        <div className="page-content">
          {page === "Dashboard" && <Dashboard workspaces={workspaces} enabledTools={enabledTools} events={events} onNavigate={setPage} />}
          {page === "Workspaces" && <Workspaces workspaces={workspaces} onAdd={() => setShowAdd(true)} onToggle={toggleWorkspace} onDelete={setConfirmDelete} onPermissions={(id) => { setSelectedWorkspace(id); setPage("Permissions"); }} />}
          {page === "Permissions" && <Permissions workspaces={workspaces} selected={selectedWorkspace} onSelect={setSelectedWorkspace} permissions={permissions} onToggle={togglePermission} onSave={() => notify("Policy changes staged in prototype only. Core policy was not changed.")} />}
          {page === "Tools" && <Tools enabledTools={enabledTools} onToggle={toggleTool} />}
          {page === "Activity & Audit" && <ActivityPage events={filteredEvents} filter={filter} setFilter={setFilter} query={query} setQuery={setQuery} />}
          {page === "Connections" && <Connections onCopy={copyConfig} />}
          {page === "Settings" && <SettingsPage active={settingsTab} onTab={setSettingsTab} onSave={() => notify("Settings saved in prototype memory only.")} />}
        </div>
      </main>

      {showAdd && <Modal title="Add workspace" subtitle="Choose a folder that the MCP Core may be allowed to access." onClose={() => setShowAdd(false)}>
        <label className="field-label">Workspace name</label><input className="text-input" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Client Projects"/>
        <label className="field-label">Absolute folder path</label><input className="text-input" value={newPath} onChange={(e) => setNewPath(e.target.value)} placeholder="F:\\Projects\\Client"/>
        <div className="inline-notice"><Shield size={15}/> New workspaces start with no capabilities granted. The real app will validate the folder with Windows before saving.</div>
        <div className="modal-actions"><button className="button secondary" onClick={() => setShowAdd(false)}>Cancel</button><button className="button primary" onClick={addWorkspace}><Plus size={15}/> Add workspace</button></div>
      </Modal>}
      {confirmDelete !== null && <Modal title="Remove workspace?" subtitle="This removes the workspace from the prototype list. It does not delete the folder or its contents." onClose={() => setConfirmDelete(null)}>
        <div className="danger-notice"><AlertTriangle size={18}/><span>Future access through this policy would be revoked after a real configuration save and Core policy reload.</span></div>
        <div className="modal-actions"><button className="button secondary" onClick={() => setConfirmDelete(null)}>Keep workspace</button><button className="button danger" onClick={() => removeWorkspace(confirmDelete)}><Trash2 size={15}/> Remove workspace</button></div>
      </Modal>}
      {toast && <div className="toast"><CheckCircle2 size={17}/>{toast}</div>}
      <div className="prototype-banner"><span className="prototype-dot"/> Interactive prototype · Demo data only · No Windows files or Core policies are accessed</div>
    </div>
  );
}

function PageHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: React.ReactNode }) {
  return <div className="page-heading"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{description}</p></div>{action && <div className="heading-action">{action}</div>}</div>;
}
function Metric({ label, value, change, icon: Icon, tone = "blue" }: { label: string; value: string; change: string; icon: typeof Server; tone?: string }) {
  return <div className="metric-card"><div className={`metric-icon ${tone}`}><Icon size={18}/></div><div className="metric-label">{label}</div><div className="metric-value">{value}</div><div className="metric-foot"><span className="metric-change"><ArrowUpRight size={13}/>{change}</span><span>vs. last 24h</span></div></div>;
}
function StatusBadge({ children, tone = "green" }: { children: React.ReactNode; tone?: string }) { return <span className={`status-badge ${tone}`}><i/> {children}</span>; }

function Dashboard({ workspaces, enabledTools, events, onNavigate }: { workspaces: Workspace[]; enabledTools: string[]; events: EventRow[]; onNavigate: (page: Page) => void }) {
  const enabled = workspaces.filter((w) => w.status === "Enabled").length;
  return <>
    <PageHeading eyebrow="OVERVIEW" title="Good morning, welcome back" description="Here's the current state of your local MCP environment." action={<button className="button secondary" onClick={() => onNavigate("Connections")}><Network size={16}/> Connect a client</button>}/>
    <div className="demo-callout"><div className="demo-icon"><AlertTriangle size={17}/></div><div><strong>Preview environment</strong><span>Metrics and activity below are illustrative. The real Core is not connected to this UI prototype.</span></div><span className="demo-tag">DEMO DATA</span></div>
    <div className="metrics-grid">
      <Metric label="Configured workspaces" value={String(workspaces.length).padStart(2,"0")} change="+1 added" icon={FolderTree}/>
      <Metric label="Enabled workspaces" value={String(enabled).padStart(2,"0")} change="Access configured" icon={ShieldCheck} tone="green"/>
      <Metric label="Available tools" value={String(enabledTools.length).padStart(2,"0")} change="Read-only set" icon={Code2} tone="purple"/>
      <Metric label="Security events" value="02" change="2 blocked today" icon={ShieldAlert} tone="amber"/>
    </div>
    <div className="dashboard-grid">
      <section className="panel server-health">
        <div className="panel-header"><div><h2>Core status</h2><p>Local server readiness and runtime</p></div><button className="icon-button" onClick={() => onNavigate("Settings")}><MoreHorizontal size={18}/></button></div>
        <div className="core-status"><div className="core-status-icon"><Server size={23}/><span className="pulse"/></div><div><div className="core-status-title">Ready to launch</div><div className="core-status-sub">Configuration valid · No active stdio session observed</div></div><StatusBadge>Ready</StatusBadge></div>
        <div className="health-list"><div><span><span className="health-bullet green"/> Core executable</span><strong>Available</strong></div><div><span><span className="health-bullet green"/> Policy configuration</span><strong>Valid</strong></div><div><span><span className="health-bullet green"/> Transport</span><strong>STDIO</strong></div><div><span><span className="health-bullet gray"/> Active sessions</span><strong>0 observed</strong></div></div>
        <div className="panel-footer"><span><Clock3 size={14}/> Last configuration check · 2 minutes ago</span><button className="text-button" onClick={() => onNavigate("Settings")}>Run diagnostics <ArrowRight size={14}/></button></div>
      </section>
      <section className="panel workspace-overview">
        <div className="panel-header"><div><h2>Workspace access</h2><p>Configured roots and their current state</p></div><button className="text-button" onClick={() => onNavigate("Workspaces")}>View all <ArrowRight size={14}/></button></div>
        <div className="workspace-mini-list">{workspaces.slice(0,4).map((w) => <div className="workspace-mini" key={w.id}><div className="folder-tile"><Folder size={17}/></div><div className="workspace-mini-copy"><strong>{w.name}</strong><span>{w.path}</span></div><StatusBadge tone={w.status === "Enabled" ? "green" : "gray"}>{w.status}</StatusBadge></div>)}</div>
        <div className="panel-footer"><span>{enabledCount(workspaces)} enabled · {workspaces.length - enabledCount(workspaces)} disabled</span><button className="text-button" onClick={() => onNavigate("Permissions")}>Review permissions <ArrowRight size={14}/></button></div>
      </section>
      <section className="panel activity-overview">
        <div className="panel-header"><div><h2>Recent activity</h2><p>Latest policy decisions and tool calls</p></div><button className="text-button" onClick={() => onNavigate("Activity & Audit")}>Full audit <ArrowRight size={14}/></button></div>
        <div className="activity-list">{events.slice(0,4).map((event) => <div className="activity-item" key={event.id}><div className={`activity-symbol ${event.result.toLowerCase()}`}>{event.result === "Denied" || event.result === "Blocked" ? <LockKeyhole size={15}/> : <Check size={15}/>}</div><div className="activity-copy"><strong>{event.action} <span>· {event.target}</span></strong><small>{event.workspace}</small></div><div className="activity-meta"><StatusBadge tone={event.result === "Denied" || event.result === "Blocked" ? "red" : "green"}>{event.result}</StatusBadge><small>{event.time}</small></div></div>)}</div>
      </section>
      <section className="panel tools-overview">
        <div className="panel-header"><div><h2>Tool availability</h2><p>Registered filesystem tools</p></div><button className="text-button" onClick={() => onNavigate("Tools")}>Manage tools <ArrowRight size={14}/></button></div>
        <div className="tool-count"><div><strong>{enabledTools.length}</strong><span>enabled tools</span></div><div className="tool-count-icon"><Zap size={20}/></div></div>
        <div className="tool-chips">{["list_files","read_file","search_files","get_file_info"].map((tool) => <span key={tool} className={enabledTools.includes(tool) ? "tool-chip on" : "tool-chip"}><i/>{tool}</span>)}</div>
        <div className="panel-footer"><span>Mutation tools are not implemented yet.</span><button className="text-button" onClick={() => onNavigate("Tools")}>Explore catalog <ArrowRight size={14}/></button></div>
      </section>
    </div>
    <div className="bottom-note"><ShieldCheck size={16}/><span><strong>Security by design.</strong> Every MCP tool call is authorized by the Core's server-side policy. UI and client restrictions can only reduce access, never expand it.</span></div>
  </>;
}
function enabledCount(workspaces: Workspace[]) { return workspaces.filter((w) => w.status === "Enabled").length; }

function Workspaces({ workspaces, onAdd, onToggle, onDelete, onPermissions }: { workspaces: Workspace[]; onAdd: () => void; onToggle: (id: number) => void; onDelete: (id: number) => void; onPermissions: (id: number) => void }) {
  return <>
    <PageHeading eyebrow="ACCESS CONTROL" title="Workspaces" description="Define which local folders the MCP Core is allowed to access." action={<button className="button primary" onClick={onAdd}><Plus size={16}/> Add workspace</button>}/>
    <div className="info-strip"><ShieldCheck size={17}/><span><strong>Explicit roots only.</strong> The Core can access only configured roots. New workspaces should start with no capabilities until you grant them.</span></div>
    <div className="summary-row"><div className="summary-box"><span>Total workspaces</span><strong>{workspaces.length}</strong></div><div className="summary-box"><span>Enabled</span><strong className="green-text">{enabledCount(workspaces)}</strong></div><div className="summary-box"><span>Disabled</span><strong>{workspaces.length-enabledCount(workspaces)}</strong></div><div className="summary-box"><span>Default policy</span><strong className="blue-text">Deny</strong></div></div>
    <section className="panel table-panel"><div className="panel-header"><div><h2>Configured roots</h2><p>Manage folder boundaries and workspace state.</p></div><button className="button secondary small" onClick={onAdd}><FolderPlus size={15}/> Add folder</button></div>
      <div className="table-wrap"><table><thead><tr><th>WORKSPACE</th><th>CANONICAL PATH</th><th>ACCESS PROFILE</th><th>STATUS</th><th>UPDATED</th><th/></tr></thead><tbody>{workspaces.map((w) => <tr key={w.id}><td><div className="table-primary"><div className="folder-tile"><Folder size={16}/></div><strong>{w.name}</strong></div></td><td><code className="path-code">{w.path}</code></td><td><span className="access-text">{w.access}</span></td><td><StatusBadge tone={w.status === "Enabled" ? "green" : "gray"}>{w.status}</StatusBadge></td><td className="muted-cell">{w.updated}</td><td><div className="row-actions"><button className="icon-button" title="Manage permissions" onClick={() => onPermissions(w.id)}><SlidersHorizontal size={16}/></button><button className="icon-button" title={w.status === "Enabled" ? "Disable" : "Enable"} onClick={() => onToggle(w.id)}><Power size={16}/></button><button className="icon-button danger-hover" title="Remove" onClick={() => onDelete(w.id)}><Trash2 size={16}/></button></div></td></tr>)}</tbody></table></div>
      {workspaces.length === 0 && <div className="empty-state"><Folder size={28}/><strong>No workspaces yet</strong><span>Add a folder to define the first access boundary.</span><button className="button primary" onClick={onAdd}><Plus size={15}/> Add workspace</button></div>}
      <div className="table-foot"><span>Showing {workspaces.length} workspace roots</span><span>Nested roots are evaluated using the Core's documented precedence rules.</span></div>
    </section>
    <div className="two-col"><div className="panel compact-panel"><div className="compact-icon blue"><FolderTree size={18}/></div><div><h3>Root validation</h3><p>In the real app, each path is canonicalized and checked against Windows filesystem boundaries before it is saved.</p></div></div><div className="panel compact-panel"><div className="compact-icon amber"><AlertTriangle size={18}/></div><div><h3>Overlapping folders</h3><p>Nested or duplicate roots are highlighted so you can understand which policy applies to a requested path.</p></div></div></div>
  </>;
}

function Permissions({ workspaces, selected, onSelect, permissions, onToggle, onSave }: { workspaces: Workspace[]; selected: number; onSelect: (id: number) => void; permissions: Record<number,string[]>; onToggle: (key: string) => void; onSave: () => void }) {
  const current = permissions[selected] ?? [];
  const [review, setReview] = useState(false);
  const groups = [{ title: "Read-only access", items: capabilityInfo.slice(0,4) }, { title: "File modifications", items: capabilityInfo.slice(4) }];
  return <>
    <PageHeading eyebrow="ACCESS CONTROL" title="Permissions" description="Grant capabilities per workspace. The MCP Core remains the final authorization boundary." action={<button className="button primary" onClick={() => setReview(true)}><ShieldCheck size={16}/> Review changes</button>}/>
    <div className="policy-banner"><div className="policy-icon"><LockKeyhole size={18}/></div><div><strong>Default-deny policy is active</strong><span>Only explicitly granted capabilities are permitted. A client or model cannot override these server-side rules.</span></div><StatusBadge>Enforced by Core</StatusBadge></div>
    <div className="permissions-layout">
      <section className="panel workspace-selector"><div className="panel-header"><div><h2>Select workspace</h2><p>Choose a root to edit its policy.</p></div></div>{workspaces.map((w) => <button key={w.id} className={`selector-item ${selected===w.id?"selected":""}`} onClick={() => { onSelect(w.id); setReview(false); }}><Folder size={17}/><span><strong>{w.name}</strong><small>{w.path}</small></span><ChevronRight size={15}/></button>)}</section>
      <section className="panel permission-editor"><div className="panel-header"><div><h2>{workspaces.find((w)=>w.id===selected)?.name ?? "Workspace policy"}</h2><p>{workspaces.find((w)=>w.id===selected)?.path ?? "No workspace selected"}</p></div><StatusBadge tone={current.length ? "green" : "gray"}>{current.length} grants</StatusBadge></div>
        {groups.map((group) => <div className="permission-group" key={group.title}><div className="permission-group-heading"><strong>{group.title}</strong><span>{group.items.filter((item)=>current.includes(item.key)).length}/{group.items.length} enabled</span></div>{group.items.map((item) => <div className={`permission-row ${item.risk==="Critical"?"critical-row":""}`} key={item.key}><div className="permission-copy"><div className="permission-name">{item.label}{item.risk==="Critical" && <span className="risk-label critical">CRITICAL</span>}{item.risk==="High" && <span className="risk-label high">HIGH RISK</span>}</div><p>{item.desc}</p></div><button className={`toggle ${current.includes(item.key)?"on":""} ${item.risk==="Critical"?"danger-toggle":""}`} onClick={() => onToggle(item.key)} role="switch" aria-checked={current.includes(item.key)} aria-label={`Toggle ${item.label}`}><span/></button></div>)}</div>)}
        <div className="permission-footer"><span><Shield size={15}/> Changes remain local to this prototype until reviewed.</span><button className="button primary" onClick={() => setReview(true)}>Review & save <ArrowRight size={15}/></button></div>
      </section>
    </div>
    {review && <Modal title="Review permission changes" subtitle="Confirm the proposed capability set for this workspace." onClose={() => setReview(false)}><div className="review-summary"><div><span>Workspace</span><strong>{workspaces.find((w)=>w.id===selected)?.name}</strong></div><div><span>Granted capabilities</span><strong>{current.length ? current.join(", ") : "None"}</strong></div><div><span>High-risk grants</span><strong className={current.some((k)=>["write","create","rename","delete"].includes(k))?"amber-text":""}>{current.filter((k)=>["write","create","rename","delete"].includes(k)).length}</strong></div></div><div className="inline-notice"><AlertTriangle size={15}/> In the real app, the Backend validates the full policy, writes it atomically, and asks the Core to reload or restart before showing it as enforced.</div><div className="modal-actions"><button className="button secondary" onClick={() => setReview(false)}>Continue editing</button><button className="button primary" onClick={() => { onSave(); setReview(false); }}>Confirm prototype changes</button></div></Modal>}
  </>;
}

function Tools({ enabledTools, onToggle }: { enabledTools: string[]; onToggle: (name:string,state:string)=>void }) {
  return <>
    <PageHeading eyebrow="ACCESS CONTROL" title="Tool catalog" description="Inspect MCP tools, their required capabilities, and implementation status." action={<button className="button secondary" onClick={() => window.alert("The production app will refresh this catalog from the Core tool registry.")}><RefreshCw size={15}/> Refresh catalog</button>}/>
    <div className="info-strip"><Code2 size={17}/><span><strong>Core-owned tool registry.</strong> Only implemented tools can be enabled. A UI toggle never creates a capability that the server does not support.</span></div>
    <div className="tool-summary-grid"><div className="summary-box"><span>Catalog entries</span><strong>11</strong></div><div className="summary-box"><span>Implemented</span><strong className="green-text">4</strong></div><div className="summary-box"><span>Enabled in prototype</span><strong>{enabledTools.length}</strong></div><div className="summary-box"><span>Planned modules</span><strong>3</strong></div></div>
    {toolGroups.map((group) => <section className="panel tool-group-panel" key={group.title}><div className="panel-header"><div><h2>{group.title}</h2><p>{group.note}</p></div><span className="subtle-count">{group.tools.length} tools</span></div><div className="tool-list">{group.tools.map((tool) => { const Icon=tool.icon; const available=tool.state==="Available"; const active=enabledTools.includes(tool.name); return <div className="tool-row" key={tool.name}><div className="tool-icon"><Icon size={18}/></div><div className="tool-description"><strong>{tool.name}</strong><span>{tool.desc}</span></div><code className="capability-tag">{tool.cap}</code><StatusBadge tone={available?"green":"gray"}>{tool.state}</StatusBadge>{available ? <button className={`toggle ${active?"on":""}`} role="switch" aria-checked={active} onClick={() => onToggle(tool.name,tool.state)}><span/></button> : <button className="button tiny secondary" onClick={() => onToggle(tool.name,tool.state)}>Details</button>}</div>; })}</div></section>)}
    <div className="bottom-note"><AlertTriangle size={16}/><span>Write, create, move, and delete tools are planned only. They must not be exposed until their Core implementations and Windows security tests pass.</span></div>
  </>;
}

function ActivityPage({ events, filter, setFilter, query, setQuery }: { events: EventRow[]; filter: string; setFilter: (v:string)=>void; query: string; setQuery: (v:string)=>void }) {
  return <>
    <PageHeading eyebrow="MONITORING" title="Activity & audit" description="Review tool calls, policy decisions, and security events." action={<button className="button secondary" onClick={() => window.alert("Audit export will be available when the persistent audit backend is implemented.")}><Download size={15}/> Export logs</button>}/>
    <div className="audit-summary"><div className="summary-box"><span>Events today</span><strong>128</strong></div><div className="summary-box"><span>Allowed</span><strong className="green-text">119</strong></div><div className="summary-box"><span>Denied / blocked</span><strong className="red-text">09</strong></div><div className="summary-box"><span>Last event</span><strong className="small-value">10:48:22 AM</strong></div></div>
    <section className="panel audit-panel"><div className="panel-header"><div><h2>Event log</h2><p>Sanitized event metadata · no file contents or secrets</p></div><StatusBadge tone="blue">Demo records</StatusBadge></div>
      <div className="audit-toolbar"><div className="search-field"><Search size={16}/><input value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="Search tools, paths or workspaces..."/></div><select className="select-input" value={filter} onChange={(e)=>setFilter(e.target.value)}><option>All events</option><option>Allowed</option><option>Completed</option><option>Denied</option></select><button className="icon-button" onClick={() => {setQuery("");setFilter("All events");}} title="Clear filters"><RefreshCw size={16}/></button></div>
      <div className="table-wrap"><table><thead><tr><th>TIME</th><th>OPERATION</th><th>RESOURCE</th><th>WORKSPACE</th><th>DECISION</th><th/></tr></thead><tbody>{events.map((event)=><tr key={event.id}><td className="time-cell">{event.time}</td><td><code className="operation-code">{event.action}</code></td><td><span className="resource-cell">{event.target}</span></td><td>{event.workspace}</td><td><StatusBadge tone={event.result==="Denied"||event.result==="Blocked"?"red":"green"}>{event.result}</StatusBadge></td><td><button className="icon-button" title={event.detail} onClick={() => window.alert(event.detail)}><ChevronRight size={16}/></button></td></tr>)}</tbody></table></div>
      {events.length===0 && <div className="empty-state"><Search size={26}/><strong>No matching events</strong><span>Try changing the search query or filter.</span></div>}
      <div className="table-foot"><span>{events.length} matching events</span><span>Retention and log rotation are configurable in Settings.</span></div>
    </section>
    <div className="audit-privacy"><LockKeyhole size={17}/><div><strong>Privacy-first audit logging</strong><span>Production logs must contain operation metadata and safe outcomes only. File contents, credentials, tokens, and private keys must never be recorded.</span></div></div>
  </>;
}

function Connections({ onCopy }: { onCopy: ()=>void }) {
  return <>
    <PageHeading eyebrow="MONITORING" title="Client connections" description="Connect ParsSynapse Chat or any compatible MCP client to the local Core." action={<button className="button secondary" onClick={() => window.alert("The production connection test will launch a disposable MCP stdio session.")}><Activity size={15}/> Test configuration</button>}/>
    <div className="connection-hero"><div className="connection-hero-icon"><Network size={22}/></div><div><h2>Local MCP · STDIO transport</h2><p>Clients launch their own Core process. The Desktop App does not need to stay open for an independently configured client session.</p></div><StatusBadge>Ready for setup</StatusBadge></div>
    <div className="section-title-row"><div><h2>Client setup</h2><p>Example configuration for a local stdio MCP client.</p></div></div>
    <div className="connection-grid"><section className="panel config-panel"><div className="panel-header"><div><h2>Generic MCP configuration</h2><p>Adapt the executable and policy paths to your installation.</p></div><button className="button secondary small" onClick={onCopy}><Copy size={14}/> Copy JSON</button></div><pre className="code-block"><div className="code-header"><span><i/> mcp-config.json</span><span>JSON</span></div><code>{clientConfig}</code></pre><div className="inline-notice"><AlertTriangle size={15}/> Example paths only. The installer and Connections page will generate the real command and configuration for your machine.</div></section>
      <section className="panel client-list-panel"><div className="panel-header"><div><h2>Supported client guides</h2><p>Connection instructions by client type.</p></div></div><div className="client-guide"><div className="client-icon purple"><Code2 size={18}/></div><div><strong>ParsSynapse Chat</strong><span>First-party client · backend-managed MCP stdio process</span></div><StatusBadge tone="blue">Planned</StatusBadge></div><div className="client-guide"><div className="client-icon blue"><Terminal size={18}/></div><div><strong>Generic MCP clients</strong><span>Any client that can launch a local stdio server process</span></div><StatusBadge>STDIO</StatusBadge></div><div className="client-guide"><div className="client-icon green"><Network size={18}/></div><div><strong>Remote / hosted clients</strong><span>Requires a future authenticated Streamable HTTP transport</span></div><StatusBadge tone="gray">Future</StatusBadge></div></section></div>
    <div className="two-col"><div className="panel compact-panel"><div className="compact-icon green"><ShieldCheck size={18}/></div><div><h3>Core policy is authoritative</h3><p>Client and model tool permissions can narrow access but cannot bypass the Core's workspace policy.</p></div></div><div className="panel compact-panel"><div className="compact-icon blue"><Unplug size={18}/></div><div><h3>Independent lifecycle</h3><p>Each stdio client can start its own Core process. No shared unauthenticated network daemon is required.</p></div></div></div>
  </>;
}

function SettingsPage({ active, onTab, onSave }: { active: string; onTab: (v:string)=>void; onSave: ()=>void }) {
  const tabs = ["General","Core runtime","Resource limits","Security","Audit & logs","Diagnostics"];
  const [toggles,setToggles] = useState<Record<string,boolean>>({"Launch at login":false,"Start minimized":true,"Confirm destructive actions":true,"Block sensitive file patterns":true,"Enable audit logging":true});
  const toggle = (key:string) => setToggles((current)=>({...current,[key]:!current[key]}));
  const switchRow = (label:string,desc:string) => <div className="setting-row" key={label}><div><strong>{label}</strong><span>{desc}</span></div><button className={`toggle ${toggles[label]?"on":""}`} role="switch" aria-checked={!!toggles[label]} onClick={()=>toggle(label)}><span/></button></div>;
  return <>
    <PageHeading eyebrow="SYSTEM" title="Settings" description="Configure the desktop app, Core runtime, resource limits, and security defaults." action={<button className="button primary" onClick={onSave}><Check size={15}/> Save settings</button>}/>
    <div className="settings-layout"><nav className="settings-nav">{tabs.map((tab)=> <button key={tab} className={active===tab?"selected":""} onClick={()=>onTab(tab)}>{tab==="General"?<SlidersHorizontal size={16}/>:tab==="Core runtime"?<Server size={16}/>:tab==="Resource limits"?<Gauge size={16}/>:tab==="Security"?<Shield size={16}/>:tab==="Audit & logs"?<Database size={16}/>:<Activity size={16}/>} {tab}</button>)}</nav>
      <section className="panel settings-panel"><div className="panel-header"><div><h2>{active}</h2><p>{active==="General"?"Personalize the desktop application experience.":active==="Core runtime"?"Configure the Core executable and policy configuration.":active==="Resource limits"?"Bound filesystem reads, traversal, and tool output.":active==="Security"?"Control security defaults and high-risk operation safeguards.":active==="Audit & logs"?"Configure safe event recording and log retention.":"Inspect runtime health and run local diagnostics."}</p></div></div>
        {active==="General" && <><div className="settings-section"><h3>Application</h3><div className="field-grid"><div><label className="field-label">Language</label><select className="text-input"><option>English</option><option>فارسی (Persian)</option></select></div><div><label className="field-label">Appearance</label><select className="text-input"><option>Dark</option><option>Light</option><option>System</option></select></div></div>{switchRow("Launch at login","Start Local-Workspace-MCP when you sign in to Windows.")}{switchRow("Start minimized","Open in the system tray instead of the full window.")}</div></>}
        {active==="Core runtime" && <div className="settings-section"><h3>Runtime paths</h3><label className="field-label">Core executable</label><input className="text-input" readOnly value="C:\\Program Files\\Local-Workspace-MCP\\dist\\index.js"/><label className="field-label">Policy configuration</label><input className="text-input" readOnly value="%APPDATA%\\Local-Workspace-MCP\\permissions.json"/><div className="inline-notice"><Server size={15}/> Runtime discovery and path validation will be implemented in the Desktop Backend.</div><div className="setting-row"><div><strong>Transport</strong><span>Initial release uses local process communication.</span></div><StatusBadge>STDIO</StatusBadge></div></div>}
        {active==="Resource limits" && <div className="settings-section"><h3>Filesystem safeguards</h3><div className="field-grid">{[["Maximum file size","1 MB"],["Maximum list entries","500"],["Maximum search results","100"],["Maximum search depth","5"]].map(([label,value])=><div key={label}><label className="field-label">{label}</label><input className="text-input" defaultValue={value}/></div>)}</div><div className="inline-notice"><Gauge size={15}/> Limits are examples from the current server foundation. Production values must be validated by the Core configuration schema.</div></div>}
        {active==="Security" && <div className="settings-section"><h3>Protection defaults</h3>{switchRow("Confirm destructive actions","Require explicit confirmation before delete or overwrite operations.")}{switchRow("Block sensitive file patterns","Deny access to common credential and secret files.")}<div className="setting-row"><div><strong>Default authorization</strong><span>Unspecified capabilities are denied.</span></div><StatusBadge>Default deny</StatusBadge></div><div className="danger-notice"><AlertTriangle size={17}/><span>Never run the Core as Administrator by default. Network transport is not enabled in the initial release.</span></div></div>}
        {active==="Audit & logs" && <div className="settings-section"><h3>Audit configuration</h3>{switchRow("Enable audit logging","Record security decisions and operation metadata.")}<div className="field-grid"><div><label className="field-label">Retention period</label><select className="text-input"><option>30 days</option><option>7 days</option><option>90 days</option></select></div><div><label className="field-label">Log level</label><select className="text-input"><option>Info</option><option>Warning</option><option>Debug</option></select></div></div><label className="field-label">Log directory</label><input className="text-input" readOnly value="%LOCALAPPDATA%\\Local-Workspace-MCP\\logs"/></div>}
        {active==="Diagnostics" && <div className="settings-section"><h3>System checks</h3>{[["Core binary","Not connected in prototype"],["Policy schema","Not connected in prototype"],["Windows filesystem","Not connected in prototype"],["MCP stdio handshake","Not connected in prototype"]].map(([label,state])=><div className="diagnostic-row" key={label}><span><i className="health-bullet gray"/>{label}</span><span className="muted-cell">{state}</span></div>)}<button className="button secondary" onClick={()=>window.alert("Diagnostics become functional when the Desktop Backend is connected.")}><Activity size={15}/> Run diagnostics</button></div>}
        <div className="settings-footer"><span><LockKeyhole size={14}/> Changes are stored in prototype memory only.</span><button className="button primary" onClick={onSave}>Save changes</button></div>
      </section></div>
  </>;
}

function Modal({ title, subtitle, onClose, children }: { title:string; subtitle:string; onClose:()=>void; children:React.ReactNode }) {
  return <div className="modal-backdrop" onMouseDown={(e)=>{if(e.target===e.currentTarget)onClose();}}><div className="modal"><div className="modal-heading"><div><h2>{title}</h2><p>{subtitle}</p></div><button className="icon-button" onClick={onClose} aria-label="Close"><X size={18}/></button></div><div className="modal-body">{children}</div></div></div>;
}

export default App;
