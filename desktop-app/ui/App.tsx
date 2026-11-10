import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Activity, AlertTriangle, Check, CheckCircle2, ChevronRight, Code2,
  Copy, FileSearch, FileText, Folder, FolderPlus, FolderTree,
  Gauge, HardDrive, LayoutDashboard, LockKeyhole, Network, Plus,
  RefreshCw, Server, Settings, Shield, ShieldCheck, Trash2, X
} from "lucide-react";
import "./styles.css";

type Page = "Dashboard" | "Workspaces" | "Permissions" | "Tools" | "Activity & Audit" | "Connections" | "Settings";
type Capability = "list" | "read" | "search" | "metadata";
type PolicyRoot = { path: string; permissions: Capability[] };
type PolicyDocument = {
  schemaVersion: 1;
  roots: PolicyRoot[];
  limits: {
    maxFileBytes: number;
    maxListEntries: number;
    maxSearchResults: number;
    maxSearchDepth: number;
  };
};
type ApiResult<T> = { ok: true; value: T } | { ok: false; error: { code: string; message: string } };
type AppStatus = {
  appVersion: string;
  policyConfigured: boolean;
  policyRevision?: string;
  coreEntryPath?: string;
  policyPath?: string;
  core: { state: string; pid?: number; activeRevision?: string; policyApplied: boolean };
};
type PolicyRead = { configured: boolean; document?: PolicyDocument; revision?: string; recoveredFromBackup?: boolean };
type PolicySave = { configured: true; savedRevision: string; applied: boolean; applyError?: string; coreState: string; activeRevision?: string };

declare global {
  interface Window {
    localWorkspace: {
      app: { getStatus: () => Promise<ApiResult<AppStatus>> };
      policy: {
        get: () => Promise<ApiResult<PolicyRead>>;
        save: (proposal: PolicyDocument, expectedRevision: string) => Promise<ApiResult<PolicySave>>;
      };
      core: {
        start: () => Promise<ApiResult<AppStatus>>;
        stop: () => Promise<ApiResult<AppStatus>>;
      };
      dialog: { selectDirectory: () => Promise<ApiResult<string | null>> };
    };
  }
}

const emptyPolicy = (): PolicyDocument => ({
  schemaVersion: 1,
  roots: [],
  limits: { maxFileBytes: 1_048_576, maxListEntries: 500, maxSearchResults: 100, maxSearchDepth: 5 }
});

const capabilities: { key: Capability; label: string; description: string }[] = [
  { key: "list", label: "List files", description: "View names and directory contents inside this root." },
  { key: "read", label: "Read files", description: "Read bounded UTF-8 text files inside this root." },
  { key: "search", label: "Search files", description: "Search names and permitted file contents." },
  { key: "metadata", label: "File metadata", description: "Read limited file and directory metadata." }
];

const tools = [
  { name: "list_files", capability: "list", description: "List entries in an authorized directory.", icon: Folder },
  { name: "read_file", capability: "read", description: "Read a bounded UTF-8 text file.", icon: FileText },
  { name: "search_files", capability: "search", description: "Search names with bounded traversal.", icon: FileSearch },
  { name: "get_file_info", capability: "metadata", description: "Read limited file and directory metadata.", icon: HardDrive }
];

const navigation: { label: Page; icon: typeof LayoutDashboard; group: string }[] = [
  { label: "Dashboard", icon: LayoutDashboard, group: "OVERVIEW" },
  { label: "Workspaces", icon: FolderTree, group: "ACCESS CONTROL" },
  { label: "Permissions", icon: ShieldCheck, group: "ACCESS CONTROL" },
  { label: "Tools", icon: Code2, group: "ACCESS CONTROL" },
  { label: "Activity & Audit", icon: Activity, group: "MONITORING" },
  { label: "Connections", icon: Network, group: "MONITORING" },
  { label: "Settings", icon: Settings, group: "SYSTEM" }
];

function unwrap<T>(result: ApiResult<T>): T {
  if (!result.ok) throw new Error(result.error.message || result.error.code);
  return result.value;
}

function folderName(folderPath: string): string {
  return folderPath.replace(/[\\/]+$/, "").split(/[\\/]/).pop() || folderPath;
}

function App() {
  const [page, setPage] = useState<Page>("Dashboard");
  const [savedPolicy, setSavedPolicy] = useState<PolicyDocument | null>(null);
  const [draft, setDraft] = useState<PolicyDocument>(emptyPolicy());
  const [revision, setRevision] = useState("");
  const [status, setStatus] = useState<AppStatus | null>(null);
  const [selectedPath, setSelectedPath] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);

  const dirty = useMemo(() => JSON.stringify(savedPolicy ?? emptyPolicy()) !== JSON.stringify(draft), [savedPolicy, draft]);
  const workspaces = draft.roots;
  const selected = workspaces.find((root) => root.path === selectedPath) ?? workspaces[0];

  async function refresh() {
    setError("");
    try {
      const [nextStatus, nextPolicy] = await Promise.all([
        window.localWorkspace.app.getStatus(),
        window.localWorkspace.policy.get()
      ]);
      const statusValue = unwrap(nextStatus);
      const policyValue = unwrap(nextPolicy);
      const document = policyValue.configured && policyValue.document ? policyValue.document : null;
      setStatus(statusValue);
      setSavedPolicy(document);
      setDraft(document ?? emptyPolicy());
      setRevision(policyValue.revision ?? "");
      setSelectedPath((current) => document?.roots.some((root) => root.path === current)
        ? current
        : (document?.roots[0]?.path ?? ""));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load desktop state.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void refresh(); }, []);

  function notify(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 3200);
  }

  async function persist(next: PolicyDocument) {
    setBusy(true);
    setError("");
    try {
      const result = unwrap(await window.localWorkspace.policy.save(next, revision));
      await refresh();
      if (result.applied) notify("Policy saved and confirmed active by the Core.");
      else if (result.applyError) notify("Policy saved, but the Core could not reload it and was stopped.");
      else notify("Policy saved. It will be loaded when the managed Core starts.");
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Policy could not be saved.";
      setError(message);
      notify(message);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function addWorkspace() {
    setBusy(true);
    setError("");
    try {
      const selectedDirectory = unwrap(await window.localWorkspace.dialog.selectDirectory());
      if (!selectedDirectory) return;
      if (draft.roots.some((root) => root.path.toLocaleLowerCase() === selectedDirectory.toLocaleLowerCase())) {
        throw new Error("This folder is already configured as a workspace.");
      }
      const next = {
        ...draft,
        roots: [...draft.roots, { path: selectedDirectory, permissions: [] as Capability[] }]
      };
      await persist(next);
      setSelectedPath(selectedDirectory);
      setPage("Permissions");
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Folder selection failed.";
      setError(message);
      notify(message);
    } finally {
      setBusy(false);
    }
  }

  async function removeWorkspace(folderPath: string) {
    const next = { ...draft, roots: draft.roots.filter((root) => root.path !== folderPath) };
    setConfirmRemove(null);
    if (selectedPath === folderPath) setSelectedPath(next.roots[0]?.path ?? "");
    await persist(next);
  }

  function toggleCapability(capability: Capability) {
    if (!selected) return;
    setDraft((current) => ({
      ...current,
      roots: current.roots.map((root) => root.path !== selected.path ? root : {
        ...root,
        permissions: root.permissions.includes(capability)
          ? root.permissions.filter((item) => item !== capability)
          : [...root.permissions, capability]
      })
    }));
  }

  async function controlCore(action: "start" | "stop") {
    setBusy(true);
    setError("");
    try {
      const nextStatus = unwrap(await window.localWorkspace.core[action]());
      setStatus(nextStatus);
      notify(action === "start" ? "Managed Core started and policy revision verified." : "Managed Core stopped.");
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : `Core ${action} failed.`;
      setError(message);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  function saveLimits(field: keyof PolicyDocument["limits"], value: string) {
    const parsed = Number(value);
    const bounds: Record<keyof PolicyDocument["limits"], { min: number; max: number }> = {
      maxFileBytes: { min: 1, max: 10_485_760 },
      maxListEntries: { min: 1, max: 2_000 },
      maxSearchResults: { min: 1, max: 500 },
      maxSearchDepth: { min: 0, max: 10 }
    };
    if (!Number.isInteger(parsed) || parsed < bounds[field].min || parsed > bounds[field].max) {
      setError(`${field} must be between ${bounds[field].min} and ${bounds[field].max}.`);
      return;
    }
    setError("");
    setDraft((current) => ({ ...current, limits: { ...current.limits, [field]: parsed } }));
  }

  async function copyConnectionConfig() {
    if (!status?.coreEntryPath || !status.policyPath) {
      notify("Connection paths are not available yet.");
      return;
    }
    const config = {
      mcpServers: {
        "local-workspace": {
          command: "node",
          args: [status.coreEntryPath],
          env: { LWMCP_CONFIG: status.policyPath }
        }
      }
    };
    try {
      await navigator.clipboard.writeText(JSON.stringify(config, null, 2));
      notify("Current local stdio configuration copied.");
    } catch {
      notify("Clipboard is unavailable in this window.");
    }
  }

  if (loading) return <div className="startup-state"><Server size={28}/><strong>Starting Local Workspace MCP</strong><span>Loading the saved policy and managed Core status…</span></div>;

  const coreRunning = status?.core.state === "running";
  const pageTitle = page;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark"><ShieldCheck size={21}/></div><div><div className="brand-name">Local Workspace</div><div className="brand-sub">MCP CONTROL CENTER</div></div></div>
        <div className="server-mini"><div className="server-mini-icon"><Server size={17}/></div><div className="server-mini-copy"><strong>Local MCP Core</strong><span><i className={`status-dot ${coreRunning ? "green" : "gray"}`}/>{coreRunning ? "Managed process running" : "Ready for stdio launch"}</span></div></div>
        {["OVERVIEW", "ACCESS CONTROL", "MONITORING", "SYSTEM"].map((group) => (
          <div className="nav-group" key={group}><div className="nav-label">{group}</div>
            {navigation.filter((item) => item.group === group).map(({ label, icon: Icon }) => (
              <button key={label} className={`nav-item ${page === label ? "active" : ""}`} onClick={() => setPage(label)}><Icon size={17}/><span>{label}</span></button>
            ))}
          </div>
        ))}
        <div className="sidebar-bottom"><div className="security-card"><div className="security-card-icon"><Shield size={16}/></div><div><strong>Core-enforced policy</strong><span>Default-deny authorization</span></div></div><div className="version-row"><span>Desktop v{status?.appVersion ?? "0.1.0"}</span><span>{status?.policyConfigured ? "Policy saved" : "Setup required"}</span></div></div>
      </aside>

      <main className="main-area">
        <header className="topbar"><div className="breadcrumbs"><span>Local environment</span><ChevronRight size={14}/><strong>{pageTitle}</strong></div><div className="topbar-actions"><div className="environment-pill"><i className={`status-dot ${coreRunning ? "green" : "gray"}`}/>{coreRunning ? "Core running" : "Core stopped"}</div><button className="icon-button" onClick={() => void refresh()} aria-label="Refresh status"><RefreshCw size={17}/></button></div></header>
        <div className="page-content">
          {error && <div className="error-callout" role="alert"><AlertTriangle size={16}/><span>{error}</span><button className="icon-button" onClick={() => setError("")} aria-label="Dismiss error"><X size={15}/></button></div>}

          {page === "Dashboard" && <>
            <PageHeading title="Dashboard" description="Live status from the Electron main process, policy store, and managed Core."/>
            <div className="metrics-grid">
              <Metric label="Configured workspaces" value={String(workspaces.length)} icon={FolderTree}/>
              <Metric label="Granted capabilities" value={String(workspaces.reduce((count, root) => count + root.permissions.length, 0))} icon={ShieldCheck} tone="green"/>
              <Metric label="Core process" value={coreRunning ? "Running" : "Stopped"} icon={Server} tone="purple"/>
              <Metric label="Policy state" value={status?.core.policyApplied ? "Applied" : status?.policyConfigured ? "Saved" : "Not set"} icon={LockKeyhole} tone="amber"/>
            </div>
            <section className="panel server-health">
              <div className="panel-header"><div><h2>Managed Core</h2><p>The desktop app only reports processes it launches and observes.</p></div><span className={`status-badge ${coreRunning ? "" : "gray"}`}>{coreRunning ? "Running" : "Stopped"}</span></div>
              <div className="health-list">
                <div><span>Application version</span><strong>{status?.appVersion ?? "—"}</strong></div>
                <div><span>Policy configured</span><strong>{status?.policyConfigured ? "Yes" : "No"}</strong></div>
                <div><span>Policy enforced by Core</span><strong>{status?.core.policyApplied ? "Confirmed" : "Not confirmed"}</strong></div>
                <div><span>Managed process ID</span><strong>{status?.core.pid ?? "—"}</strong></div>
                <div><span>Transport</span><strong>STDIO + private control pipes</strong></div>
              </div>
              <div className="panel-footer"><span>{status?.core.activeRevision ? `Active revision: ${status.core.activeRevision.slice(0, 12)}…` : "No active policy revision confirmed"}</span><div className="heading-action"><button className="button secondary small" disabled={busy || !status?.policyConfigured || coreRunning} onClick={() => void controlCore("start")}>Start Core</button><button className="button secondary small" disabled={busy || !coreRunning} onClick={() => void controlCore("stop")}>Stop Core</button></div></div>
            </section>
            <section className="panel workspace-overview"><div className="panel-header"><div><h2>Workspace access</h2><p>Actual roots loaded from the persisted policy.</p></div><button className="text-button" onClick={() => setPage("Workspaces")}>Manage <ChevronRight size={14}/></button></div>
              {workspaces.length ? <div className="workspace-mini-list">{workspaces.map((root) => <div className="workspace-mini" key={root.path}><div className="folder-tile"><Folder size={17}/></div><div className="workspace-mini-copy"><strong>{folderName(root.path)}</strong><span>{root.path}</span></div><span className="status-badge gray">{root.permissions.length} grants</span></div>)}</div> : <EmptyState title="No workspaces configured" detail="Add a folder to establish the first access boundary." action={() => setPage("Workspaces")}/>}</section>
          </>}

          {page === "Workspaces" && <>
            <PageHeading title="Workspaces" description="Choose real local folders. New roots receive no capabilities until you explicitly grant them." action={<button className="button primary" disabled={busy} onClick={() => void addWorkspace()}><FolderPlus size={16}/> Choose folder</button>}/>
            <div className="info-strip"><ShieldCheck size={17}/><span><strong>Explicit roots only.</strong> Folder paths are selected by the native Windows picker and canonicalized by PolicyStore before persistence.</span></div>
            <section className="panel table-panel"><div className="panel-header"><div><h2>Configured roots</h2><p>{workspaces.length} persisted workspace {workspaces.length === 1 ? "root" : "roots"}</p></div></div>
              {workspaces.length ? <div className="table-wrap"><table><thead><tr><th>FOLDER</th><th>CANONICAL PATH</th><th>CAPABILITIES</th><th>ACCESS</th><th/></tr></thead><tbody>{workspaces.map((root) => <tr key={root.path}><td><div className="table-primary"><div className="folder-tile"><Folder size={16}/></div><strong>{folderName(root.path)}</strong></div></td><td><code className="path-code">{root.path}</code></td><td>{root.permissions.length ? root.permissions.join(" · ") : "None"}</td><td><span className={`status-badge ${root.permissions.length ? "" : "gray"}`}>{root.permissions.length ? "Granted" : "Disabled"}</span></td><td><div className="row-actions"><button className="button tiny secondary" onClick={() => {setSelectedPath(root.path);setPage("Permissions");}}>Permissions</button><button className="icon-button danger-hover" title="Remove workspace" disabled={busy} onClick={() => setConfirmRemove(root.path)}><Trash2 size={16}/></button></div></td></tr>)}</tbody></table></div> : <EmptyState title="No workspace roots yet" detail="Choose a local folder. It will be saved with zero capabilities (default deny)." action={() => void addWorkspace()}/>}
              <div className="table-foot"><span>Nested roots use the Core's most-specific-root rule.</span><span>Removing a root never deletes its folder.</span></div>
            </section>
          </>}

          {page === "Permissions" && <>
            <PageHeading title="Permissions" description="Edit the proposed policy. Changes are not active until saved and confirmed by the Core." action={<button className="button primary" disabled={!dirty || busy || !selected} onClick={() => void persist(draft)}><Check size={15}/> Save policy</button>}/>
            <div className="policy-banner"><div className="policy-icon"><LockKeyhole size={18}/></div><div><strong>{status?.core.policyApplied ? "Saved policy revision confirmed" : "Default-deny authorization"}</strong><span>{dirty ? "Unsaved changes are shown below. The Core continues enforcing the last saved policy." : "Only the capabilities listed in the saved policy are granted."}</span></div><span className={`status-badge ${dirty ? "gray" : ""}`}>{dirty ? "Unsaved" : "Saved"}</span></div>
            {workspaces.length ? <div className="permissions-layout"><section className="panel workspace-selector"><div className="panel-header"><div><h2>Select workspace</h2><p>Permissions are scoped to each root.</p></div></div>{workspaces.map((root) => <button key={root.path} className={`selector-item ${selected?.path === root.path ? "selected" : ""}`} onClick={() => setSelectedPath(root.path)}><Folder size={17}/><span><strong>{folderName(root.path)}</strong><small>{root.path}</small></span><ChevronRight size={15}/></button>)}</section>
              <section className="panel permission-editor"><div className="panel-header"><div><h2>{selected ? folderName(selected.path) : "Workspace policy"}</h2><p>{selected?.path}</p></div><span className="status-badge blue">{selected?.permissions.length ?? 0} grants</span></div>
                <div className="permission-group"><div className="permission-group-heading"><strong>Implemented read-only capabilities</strong><span>Only supported Core capabilities</span></div>{capabilities.map((capability) => <label className="permission-row" key={capability.key}><div className="permission-copy"><div className="permission-name">{capability.label}</div><p>{capability.description}</p></div><input type="checkbox" checked={selected?.permissions.includes(capability.key) ?? false} onChange={() => toggleCapability(capability.key)} /></label>)}</div>
                <div className="permission-footer"><span><Shield size={15}/> Write, create, rename, and delete are not implemented.</span><button className="button primary" disabled={!dirty || busy} onClick={() => void persist(draft)}>Save & apply <ChevronRight size={15}/></button></div>
              </section></div> : <EmptyState title="No workspaces to configure" detail="Add a folder first. New folders start with no permissions." action={() => setPage("Workspaces")}/>}
          </>}

          {page === "Tools" && <>
            <PageHeading title="Tool catalog" description="This inventory reflects tools implemented by the current MCP Core. Tool availability is governed by workspace capabilities."/>
            <div className="summary-row"><Metric label="Registered tools" value="4" icon={Code2}/><Metric label="Supported capabilities" value="4" icon={ShieldCheck}/></div>
            <section className="panel tool-group-panel"><div className="panel-header"><div><h2>Filesystem tools</h2><p>Read-only tools registered in the current Core.</p></div><span className="status-badge">Implemented</span></div><div className="tool-list">{tools.map((tool) => {const Icon=tool.icon;return <div className="tool-row" key={tool.name}><div className="tool-icon"><Icon size={18}/></div><div className="tool-description"><strong>{tool.name}</strong><span>{tool.description}</span></div><code className="capability-tag">{tool.capability}</code><span className="status-badge">Available</span></div>;})}</div></section>
            <div className="bottom-note"><AlertTriangle size={16}/><span>Tool-level enable/disable controls are intentionally omitted: the current Core authorizes these tools using workspace-scoped capabilities, not a separate UI toggle.</span></div>
          </>}

          {page === "Activity & Audit" && <>
            <PageHeading title="Activity & audit" description="Persistent structured audit storage and filtering are not implemented yet."/>
            <div className="audit-privacy"><LockKeyhole size={17}/><div><strong>Audit data is not yet available in the desktop UI</strong><span>The current Core writes diagnostic audit output to stderr. This screen will remain empty until the structured, redacted, persistent audit pipeline is implemented.</span></div></div>
            <EmptyState title="No persistent audit records" detail="No demo events are shown. This screen will populate when the audit store and retention pipeline are delivered."/>
          </>}

          {page === "Connections" && <>
            <PageHeading title="Client connections" description="External MCP clients launch independent Core processes over local stdio."/>
            <div className="connection-hero"><div className="connection-hero-icon"><Network size={22}/></div><div><h2>Local MCP · STDIO transport</h2><p>Clients may launch the Core independently. Closing this desktop app does not terminate external client-owned processes.</p></div><span className="status-badge">Supported</span></div>
            <section className="panel config-panel"><div className="panel-header"><div><h2>Current local configuration</h2><p>Uses the Core entry point and policy path detected by this desktop session.</p></div><button className="button secondary small" onClick={() => void copyConnectionConfig()}><Copy size={14}/> Copy JSON</button></div><pre className="code-block"><code>{JSON.stringify({mcpServers:{"local-workspace":{command:"node",args:[status?.coreEntryPath ?? "Core path unavailable"],env:{LWMCP_CONFIG:status?.policyPath ?? "Policy path unavailable"}}}},null,2)}</code></pre></section>
            <div className="bottom-note"><ShieldCheck size={16}/><span>The Core policy remains authoritative. A client or model cannot expand permissions beyond the configured workspace capabilities.</span></div>
          </>}

          {page === "Settings" && <>
            <PageHeading title="Settings" description="Resource limits are stored in the same versioned policy document and validated by the Core schema." action={<button className="button primary" disabled={!dirty || busy} onClick={() => void persist(draft)}>Save settings</button>}/>
            <div className="settings-layout"><nav className="settings-nav"><button className="selected"><Gauge size={16}/> Resource limits</button><button disabled><Server size={16}/> Core runtime</button><button disabled><Shield size={16}/> Security</button></nav><section className="panel settings-panel"><div className="panel-header"><div><h2>Filesystem safeguards</h2><p>Bounds applied by the MCP Core, not by renderer-side checks.</p></div></div><div className="settings-section">{([
              ["Maximum file size (bytes)", "maxFileBytes"],
              ["Maximum list entries", "maxListEntries"],
              ["Maximum search results", "maxSearchResults"],
              ["Maximum search depth", "maxSearchDepth"]
            ] as const).map(([label, field]) => <div key={field}><label className="field-label">{label}</label><input className="text-input" type="number" min={field === "maxSearchDepth" ? 0 : 1} value={draft.limits[field]} onChange={(event) => void saveLimits(field, event.target.value)}/></div>)}</div><div className="settings-footer"><span>Unsaved changes: {dirty ? "Yes" : "No"}</span><button className="button primary" disabled={!dirty || busy} onClick={() => void persist(draft)}>Save limits</button></div></section></div>
          </>}
        </div>
      </main>

      {confirmRemove && <div className="modal-backdrop"><div className="modal"><div className="modal-heading"><div><h2>Remove workspace?</h2><p>This revokes the root from the saved policy. It does not delete the folder or its contents.</p></div><button className="icon-button" onClick={() => setConfirmRemove(null)} aria-label="Close"><X size={18}/></button></div><div className="modal-body"><div className="danger-notice"><AlertTriangle size={17}/><span>The Core will no longer authorize access through this root after the policy is saved and applied.</span></div><div className="modal-actions"><button className="button secondary" onClick={() => setConfirmRemove(null)}>Cancel</button><button className="button danger" disabled={busy} onClick={() => void removeWorkspace(confirmRemove)}><Trash2 size={15}/> Remove root</button></div></div></div></div>}
      {toast && <div className="toast"><CheckCircle2 size={17}/>{toast}</div>}
      <div className="integration-banner"><span className="prototype-dot"/> Connected desktop backend · Workspace and policy operations use the Electron main process</div>
    </div>
  );
}

function PageHeading({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <div className="page-heading"><div><div className="eyebrow">LOCAL WORKSPACE MCP</div><h1>{title}</h1><p>{description}</p></div>{action && <div className="heading-action">{action}</div>}</div>;
}

function Metric({ label, value, icon: Icon, tone = "blue" }: { label: string; value: string; icon: typeof Server; tone?: string }) {
  return <div className="metric-card"><div className={`metric-icon ${tone}`}><Icon size={18}/></div><div className="metric-label">{label}</div><div className="metric-value">{value}</div><div className="metric-foot">Live backend value</div></div>;
}

function EmptyState({ title, detail, action }: { title: string; detail: string; action?: () => void }) {
  return <div className="empty-state"><FolderTree size={28}/><strong>{title}</strong><span>{detail}</span>{action && <button className="button primary" onClick={action}><Plus size={15}/> Continue</button>}</div>;
}

export default App;
