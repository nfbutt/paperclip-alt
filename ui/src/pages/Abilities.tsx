import { useState, useEffect, useId } from "react";
import { useQuery } from "@tanstack/react-query";
import type { LucideIcon } from "lucide-react";
import {
  Database, FolderOpen, HardDrive, Cloud, Server, Globe,
  Plus, Pencil, Trash2, X, KeyRound, Link2, ChevronDown, Check,
  Cpu, ShieldCheck,
} from "lucide-react";
import { agentsApi } from "../api/agents";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import { cn } from "../lib/utils";
import { Button } from "@/components/ui/button";
import { Tabs } from "@/components/ui/tabs";
import { PageTabBar } from "../components/PageTabBar";
import { EmptyState } from "../components/EmptyState";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import type { Agent } from "@paperclipai/shared";

// ─── Types ────────────────────────────────────────────────────────────────────

type ConnectorType = "database" | "local_files" | "gdrive" | "onedrive";
type AbilitiesTab = "connectors" | "mcps" | "apis";

interface Connector {
  id: string;
  name: string;
  type: ConnectorType;
  config: Record<string, string>;
  createdAt: string;
}

interface MCPServer {
  id: string;
  name: string;
  url: string;
  settings: { key: string; value: string }[];
  agentIds: string[];
  createdAt: string;
}

interface APIConfig {
  id: string;
  name: string;
  baseUrl: string;
  credentials: { key: string; value: string }[];
  createdAt: string;
}

// ─── Storage helpers ──────────────────────────────────────────────────────────

function storageKey(companyId: string, section: string) {
  return `paperclip.abilities.${companyId}.${section}`;
}
function load<T>(key: string, fallback: T): T {
  try { const r = localStorage.getItem(key); return r ? (JSON.parse(r) as T) : fallback; }
  catch { return fallback; }
}
function save<T>(key: string, value: T) {
  localStorage.setItem(key, JSON.stringify(value));
}
function uid() { return Math.random().toString(36).slice(2, 10); }

// ─── Connector metadata ───────────────────────────────────────────────────────

interface ConnectorMeta {
  label: string;
  icon: LucideIcon;
  iconBg: string;
  description: string;
  fields: { key: string; label: string; placeholder: string; secret?: boolean }[];
}

const CONNECTOR_META: Record<ConnectorType, ConnectorMeta> = {
  database: {
    label: "Database",
    icon: Database,
    iconBg: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300",
    description: "PostgreSQL, MySQL, SQLite and more",
    fields: [
      { key: "host", label: "Host", placeholder: "localhost" },
      { key: "port", label: "Port", placeholder: "5432" },
      { key: "database", label: "Database name", placeholder: "mydb" },
      { key: "username", label: "Username", placeholder: "postgres" },
      { key: "password", label: "Password", placeholder: "••••••••", secret: true },
    ],
  },
  local_files: {
    label: "Local Files",
    icon: FolderOpen,
    iconBg: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
    description: "Read from the local filesystem",
    fields: [
      { key: "path", label: "Root path", placeholder: "/home/user/documents" },
      { key: "glob", label: "File filter (glob)", placeholder: "**/*.{txt,md,pdf}" },
    ],
  },
  gdrive: {
    label: "Google Drive",
    icon: HardDrive,
    iconBg: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
    description: "Access Google Drive files and folders",
    fields: [
      { key: "client_id", label: "OAuth Client ID", placeholder: "xxxx.apps.googleusercontent.com" },
      { key: "client_secret", label: "Client Secret", placeholder: "••••••••", secret: true },
      { key: "folder_id", label: "Root Folder ID (optional)", placeholder: "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74" },
    ],
  },
  onedrive: {
    label: "OneDrive",
    icon: Cloud,
    iconBg: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300",
    description: "Access Microsoft OneDrive files",
    fields: [
      { key: "tenant_id", label: "Tenant ID", placeholder: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" },
      { key: "client_id", label: "Application (Client) ID", placeholder: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" },
      { key: "client_secret", label: "Client Secret", placeholder: "••••••••", secret: true },
    ],
  },
};

// ─── Shared input style ───────────────────────────────────────────────────────

const inputCls =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground/50 transition-shadow";

// ─── KeyValue editor ──────────────────────────────────────────────────────────

function KeyValueEditor({
  pairs,
  onChange,
  keyPlaceholder = "KEY",
  valuePlaceholder = "value",
  secretValues = false,
}: {
  pairs: { key: string; value: string }[];
  onChange: (pairs: { key: string; value: string }[]) => void;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
  secretValues?: boolean;
}) {
  function update(i: number, field: "key" | "value", v: string) {
    const next = pairs.map((p, idx) => idx === i ? { ...p, [field]: v } : p);
    onChange(next);
  }
  function remove(i: number) { onChange(pairs.filter((_, idx) => idx !== i)); }
  function add() { onChange([...pairs, { key: "", value: "" }]); }

  return (
    <div className="space-y-2">
      {pairs.map((pair, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            value={pair.key}
            onChange={(e) => update(i, "key", e.target.value)}
            placeholder={keyPlaceholder}
            className={cn(inputCls, "font-mono flex-1 min-w-0")}
          />
          <input
            value={pair.value}
            onChange={(e) => update(i, "value", e.target.value)}
            placeholder={valuePlaceholder}
            type={secretValues ? "password" : "text"}
            className={cn(inputCls, "flex-[2] min-w-0")}
          />
          <button
            type="button"
            onClick={() => remove(i)}
            className="shrink-0 p-1.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={add}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors py-1"
      >
        <Plus className="h-3.5 w-3.5" />
        Add entry
      </button>
    </div>
  );
}

// ─── Field ────────────────────────────────────────────────────────────────────

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-foreground">{label}</label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

// ─── Ability card ─────────────────────────────────────────────────────────────

function AbilityCard({
  icon: Icon,
  iconBg,
  title,
  subtitle,
  badge,
  onEdit,
  onDelete,
  children,
}: {
  icon: LucideIcon;
  iconBg: string;
  title: string;
  subtitle: string;
  badge?: string;
  onEdit: () => void;
  onDelete: () => void;
  children?: React.ReactNode;
}) {
  return (
    <div className="group relative flex flex-col gap-3 rounded-xl border border-border bg-card p-5 hover:border-border/80 hover:shadow-sm transition-all">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className={cn("flex items-center justify-center rounded-lg h-9 w-9 shrink-0", iconBg)}>
            <Icon className="h-4.5 w-4.5" style={{ height: "1.125rem", width: "1.125rem" }} />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold leading-tight truncate">{title}</p>
            <p className="text-xs text-muted-foreground truncate mt-0.5">{subtitle}</p>
          </div>
        </div>
        {badge && (
          <span className="shrink-0 text-[10px] font-medium px-2 py-0.5 rounded-full border border-border text-muted-foreground">
            {badge}
          </span>
        )}
      </div>
      {children && <div className="text-xs text-muted-foreground space-y-0.5">{children}</div>}
      {/* Actions — visible on hover */}
      <div className="absolute top-3 right-3 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={onEdit}
          className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          title="Edit"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={onDelete}
          className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
          title="Delete"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

// ─── Section header ───────────────────────────────────────────────────────────

function SectionHeader({
  title, description, action, onAction,
}: { title: string; description: string; action: string; onAction: () => void }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <h2 className="text-sm font-semibold">{title}</h2>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>
      <Button size="sm" onClick={onAction} className="shrink-0">
        <Plus className="h-3.5 w-3.5 mr-1.5" />
        {action}
      </Button>
    </div>
  );
}

// ─── CONNECTORS ───────────────────────────────────────────────────────────────

function ConnectorsSection({ connectors, onChange }: {
  connectors: Connector[];
  onChange: (c: Connector[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Connector | null>(null);

  function openCreate() { setEditing(null); setOpen(true); }
  function openEdit(c: Connector) { setEditing(c); setOpen(true); }
  function handleDelete(id: string) { onChange(connectors.filter((c) => c.id !== id)); }
  function handleSave(c: Connector) {
    onChange(editing ? connectors.map((x) => x.id === c.id ? c : x) : [...connectors, c]);
    setOpen(false);
  }

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Connectors"
        description="Link databases, drives and local file systems to your company's agents."
        action="Add Connector"
        onAction={openCreate}
      />
      {connectors.length === 0 ? (
        <EmptyState icon={Database} message="No connectors yet. Add one to get started." action="Add Connector" onAction={openCreate} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {connectors.map((c) => {
            const meta = CONNECTOR_META[c.type];
            return (
              <AbilityCard
                key={c.id}
                icon={meta.icon}
                iconBg={meta.iconBg}
                title={c.name}
                subtitle={meta.label}
                badge={meta.label}
                onEdit={() => openEdit(c)}
                onDelete={() => handleDelete(c.id)}
              >
                {Object.entries(c.config)
                  .filter(([k]) => !k.toLowerCase().includes("password") && !k.toLowerCase().includes("secret"))
                  .slice(0, 2)
                  .map(([k, v]) => v && (
                    <div key={k} className="flex items-center gap-1.5">
                      <span className="text-muted-foreground/60 capitalize">{k}:</span>
                      <span className="font-mono truncate">{v}</span>
                    </div>
                  ))}
              </AbilityCard>
            );
          })}
        </div>
      )}
      <ConnectorDialog open={open} onOpenChange={setOpen} initial={editing} onSave={handleSave} />
    </div>
  );
}

function ConnectorDialog({ open, onOpenChange, initial, onSave }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial: Connector | null;
  onSave: (c: Connector) => void;
}) {
  const [name, setName] = useState("");
  const [type, setType] = useState<ConnectorType>("database");
  const [config, setConfig] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open) {
      setName(initial?.name ?? "");
      setType(initial?.type ?? "database");
      setConfig(initial?.config ?? {});
    }
  }, [open, initial]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    onSave({
      id: initial?.id ?? uid(),
      name: name.trim(),
      type,
      config,
      createdAt: initial?.createdAt ?? new Date().toISOString(),
    });
  }

  const meta = CONNECTOR_META[type];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="sm:max-w-lg p-0 gap-0">
        <DialogHeader className="flex-row items-center justify-between px-5 py-4 border-b border-border gap-0">
          <DialogTitle className="text-base">{initial ? "Edit Connector" : "Add Connector"}</DialogTitle>
          <button onClick={() => onOpenChange(false)} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="h-4 w-4" />
          </button>
        </DialogHeader>
        <form onSubmit={submit}>
          <div className="px-5 py-5 space-y-5 max-h-[70vh] overflow-y-auto">
            <Field label="Name">
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="My Production DB" className={inputCls} autoFocus />
            </Field>
            <Field label="Type">
              <div className="grid grid-cols-2 gap-2">
                {(Object.keys(CONNECTOR_META) as ConnectorType[]).map((t) => {
                  const m = CONNECTOR_META[t];
                  const Icon = m.icon;
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => { setType(t); setConfig({}); }}
                      className={cn(
                        "flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-colors",
                        type === t
                          ? "border-ring bg-accent text-foreground"
                          : "border-border hover:bg-accent/50 text-muted-foreground hover:text-foreground"
                      )}
                    >
                      <span className={cn("flex items-center justify-center h-7 w-7 rounded-md shrink-0", m.iconBg)}>
                        <Icon className="h-3.5 w-3.5" />
                      </span>
                      <span className="text-sm font-medium">{m.label}</span>
                      {type === t && <Check className="h-3.5 w-3.5 ml-auto text-ring shrink-0" />}
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground mt-1.5">{meta.description}</p>
            </Field>
            {meta.fields.map((f) => (
              <Field key={f.key} label={f.label}>
                <input
                  type={f.secret ? "password" : "text"}
                  value={config[f.key] ?? ""}
                  onChange={(e) => setConfig((prev) => ({ ...prev, [f.key]: e.target.value }))}
                  placeholder={f.placeholder}
                  className={cn(inputCls, "font-mono")}
                  autoComplete="off"
                />
              </Field>
            ))}
          </div>
          <DialogFooter className="px-5 py-4 border-t border-border">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit">{initial ? "Save changes" : "Add connector"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── MCP SERVERS ──────────────────────────────────────────────────────────────

function MCPsSection({ mcps, onChange, agents }: {
  mcps: MCPServer[];
  onChange: (m: MCPServer[]) => void;
  agents: Agent[];
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<MCPServer | null>(null);

  function openCreate() { setEditing(null); setOpen(true); }
  function openEdit(m: MCPServer) { setEditing(m); setOpen(true); }
  function handleDelete(id: string) { onChange(mcps.filter((m) => m.id !== id)); }
  function handleSave(m: MCPServer) {
    onChange(editing ? mcps.map((x) => x.id === m.id ? m : x) : [...mcps, m]);
    setOpen(false);
  }

  return (
    <div className="space-y-5">
      <SectionHeader
        title="MCP Servers"
        description="Connect Model Context Protocol servers and assign them to specific agents."
        action="Add MCP Server"
        onAction={openCreate}
      />
      {mcps.length === 0 ? (
        <EmptyState icon={Server} message="No MCP servers yet. Add one to get started." action="Add MCP Server" onAction={openCreate} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {mcps.map((m) => {
            const assignedAgents = agents.filter((a) => m.agentIds.includes(a.id));
            return (
              <AbilityCard
                key={m.id}
                icon={Cpu}
                iconBg="bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300"
                title={m.name}
                subtitle={m.url || "No URL set"}
                onEdit={() => openEdit(m)}
                onDelete={() => handleDelete(m.id)}
              >
                {m.settings.length > 0 && (
                  <div className="flex items-center gap-1.5">
                    <ShieldCheck className="h-3 w-3 text-muted-foreground/60 shrink-0" />
                    <span>{m.settings.length} setting{m.settings.length !== 1 ? "s" : ""}</span>
                  </div>
                )}
                {assignedAgents.length > 0 && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-muted-foreground/60">Agents:</span>
                    <span className="truncate">{assignedAgents.map((a) => a.name).join(", ")}</span>
                  </div>
                )}
                {assignedAgents.length === 0 && (
                  <span className="text-muted-foreground/50 italic">Not assigned to any agent</span>
                )}
              </AbilityCard>
            );
          })}
        </div>
      )}
      <MCPDialog open={open} onOpenChange={setOpen} initial={editing} onSave={handleSave} agents={agents} />
    </div>
  );
}

function MCPDialog({ open, onOpenChange, initial, onSave, agents }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial: MCPServer | null;
  onSave: (m: MCPServer) => void;
  agents: Agent[];
}) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [settings, setSettings] = useState<{ key: string; value: string }[]>([]);
  const [agentIds, setAgentIds] = useState<string[]>([]);
  const [agentOpen, setAgentOpen] = useState(false);

  useEffect(() => {
    if (open) {
      setName(initial?.name ?? "");
      setUrl(initial?.url ?? "");
      setSettings(initial?.settings ?? []);
      setAgentIds(initial?.agentIds ?? []);
      setAgentOpen(false);
    }
  }, [open, initial]);

  function toggleAgent(id: string) {
    setAgentIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    onSave({
      id: initial?.id ?? uid(),
      name: name.trim(),
      url: url.trim(),
      settings: settings.filter((s) => s.key.trim()),
      agentIds,
      createdAt: initial?.createdAt ?? new Date().toISOString(),
    });
  }

  const selectedAgents = agents.filter((a) => agentIds.includes(a.id));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="sm:max-w-lg p-0 gap-0">
        <DialogHeader className="flex-row items-center justify-between px-5 py-4 border-b border-border gap-0">
          <DialogTitle className="text-base">{initial ? "Edit MCP Server" : "Add MCP Server"}</DialogTitle>
          <button onClick={() => onOpenChange(false)} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="h-4 w-4" />
          </button>
        </DialogHeader>
        <form onSubmit={submit}>
          <div className="px-5 py-5 space-y-5 max-h-[70vh] overflow-y-auto">
            <Field label="Name">
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="My MCP Server" className={inputCls} autoFocus />
            </Field>
            <Field label="Server URL" hint="WebSocket (ws://) or HTTP (http://) endpoint of the MCP server.">
              <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="ws://localhost:3001" className={cn(inputCls, "font-mono")} />
            </Field>
            <Field label="Settings" hint="Environment variables or configuration passed to the MCP server.">
              <KeyValueEditor pairs={settings} onChange={setSettings} keyPlaceholder="SETTING_KEY" valuePlaceholder="value" />
            </Field>
            <Field label="Assign to agents" hint="Select which agents can use this MCP server.">
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setAgentOpen((v) => !v)}
                  className={cn(inputCls, "flex items-center justify-between cursor-pointer text-left")}
                >
                  <span className={selectedAgents.length === 0 ? "text-muted-foreground/50" : ""}>
                    {selectedAgents.length === 0
                      ? "Select agents…"
                      : selectedAgents.map((a) => a.name).join(", ")}
                  </span>
                  <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                </button>
                {agentOpen && (
                  <div className="absolute top-full mt-1 left-0 right-0 z-50 rounded-md border border-border bg-popover shadow-lg max-h-48 overflow-y-auto">
                    {agents.length === 0 ? (
                      <p className="px-3 py-2 text-xs text-muted-foreground">No agents in this company.</p>
                    ) : (
                      agents.map((a) => (
                        <button
                          key={a.id}
                          type="button"
                          onClick={() => toggleAgent(a.id)}
                          className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-left hover:bg-accent/50 transition-colors"
                        >
                          <span className={cn(
                            "flex items-center justify-center h-4 w-4 rounded border border-border shrink-0",
                            agentIds.includes(a.id) && "bg-foreground border-foreground"
                          )}>
                            {agentIds.includes(a.id) && <Check className="h-2.5 w-2.5 text-background" />}
                          </span>
                          {a.name}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            </Field>
          </div>
          <DialogFooter className="px-5 py-4 border-t border-border">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit">{initial ? "Save changes" : "Add server"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── APIs ────────────────────────────────────────────────────────────────────

function APIsSection({ apis, onChange }: {
  apis: APIConfig[];
  onChange: (a: APIConfig[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<APIConfig | null>(null);

  function openCreate() { setEditing(null); setOpen(true); }
  function openEdit(a: APIConfig) { setEditing(a); setOpen(true); }
  function handleDelete(id: string) { onChange(apis.filter((a) => a.id !== id)); }
  function handleSave(a: APIConfig) {
    onChange(editing ? apis.map((x) => x.id === a.id ? a : x) : [...apis, a]);
    setOpen(false);
  }

  return (
    <div className="space-y-5">
      <SectionHeader
        title="APIs"
        description="Register named API endpoints with credentials for agents to call."
        action="Add API"
        onAction={openCreate}
      />
      {apis.length === 0 ? (
        <EmptyState icon={Globe} message="No APIs configured yet. Add one to get started." action="Add API" onAction={openCreate} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {apis.map((a) => (
            <AbilityCard
              key={a.id}
              icon={Globe}
              iconBg="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
              title={a.name}
              subtitle={a.baseUrl || "No URL set"}
              onEdit={() => openEdit(a)}
              onDelete={() => handleDelete(a.id)}
            >
              {a.credentials.length > 0 && (
                <div className="flex items-center gap-1.5">
                  <KeyRound className="h-3 w-3 text-muted-foreground/60 shrink-0" />
                  <span>{a.credentials.length} credential{a.credentials.length !== 1 ? "s" : ""}</span>
                </div>
              )}
              {a.baseUrl && (
                <div className="flex items-center gap-1.5">
                  <Link2 className="h-3 w-3 text-muted-foreground/60 shrink-0" />
                  <span className="font-mono truncate">{a.baseUrl}</span>
                </div>
              )}
            </AbilityCard>
          ))}
        </div>
      )}
      <APIDialog open={open} onOpenChange={setOpen} initial={editing} onSave={handleSave} />
    </div>
  );
}

function APIDialog({ open, onOpenChange, initial, onSave }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial: APIConfig | null;
  onSave: (a: APIConfig) => void;
}) {
  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [credentials, setCredentials] = useState<{ key: string; value: string }[]>([]);

  useEffect(() => {
    if (open) {
      setName(initial?.name ?? "");
      setBaseUrl(initial?.baseUrl ?? "");
      setCredentials(initial?.credentials ?? []);
    }
  }, [open, initial]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    onSave({
      id: initial?.id ?? uid(),
      name: name.trim(),
      baseUrl: baseUrl.trim(),
      credentials: credentials.filter((c) => c.key.trim()),
      createdAt: initial?.createdAt ?? new Date().toISOString(),
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="sm:max-w-lg p-0 gap-0">
        <DialogHeader className="flex-row items-center justify-between px-5 py-4 border-b border-border gap-0">
          <DialogTitle className="text-base">{initial ? "Edit API" : "Add API"}</DialogTitle>
          <button onClick={() => onOpenChange(false)} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="h-4 w-4" />
          </button>
        </DialogHeader>
        <form onSubmit={submit}>
          <div className="px-5 py-5 space-y-5 max-h-[70vh] overflow-y-auto">
            <Field label="Name" hint="A short, memorable name for this API (e.g. Stripe, Internal CRM).">
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Stripe API" className={inputCls} autoFocus />
            </Field>
            <Field label="Base URL" hint="All requests will be relative to this URL.">
              <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://api.stripe.com/v1" className={cn(inputCls, "font-mono")} />
            </Field>
            <Field label="Credentials" hint="Headers or auth tokens sent with every request (e.g. Authorization, X-API-Key).">
              <KeyValueEditor
                pairs={credentials}
                onChange={setCredentials}
                keyPlaceholder="Header / key name"
                valuePlaceholder="value"
                secretValues
              />
            </Field>
          </div>
          <DialogFooter className="px-5 py-4 border-t border-border">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit">{initial ? "Save changes" : "Add API"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function Abilities() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const [tab, setTab] = useState<AbilitiesTab>("connectors");

  const { data: agents = [] } = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId!),
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const [connectors, setConnectors] = useState<Connector[]>(() =>
    selectedCompanyId ? load<Connector[]>(storageKey(selectedCompanyId, "connectors"), []) : []
  );
  const [mcps, setMCPs] = useState<MCPServer[]>(() =>
    selectedCompanyId ? load<MCPServer[]>(storageKey(selectedCompanyId, "mcps"), []) : []
  );
  const [apis, setAPIs] = useState<APIConfig[]>(() =>
    selectedCompanyId ? load<APIConfig[]>(storageKey(selectedCompanyId, "apis"), []) : []
  );

  useEffect(() => { setBreadcrumbs([{ label: "Abilities" }]); }, [setBreadcrumbs]);

  useEffect(() => {
    if (selectedCompanyId) save(storageKey(selectedCompanyId, "connectors"), connectors);
  }, [connectors, selectedCompanyId]);
  useEffect(() => {
    if (selectedCompanyId) save(storageKey(selectedCompanyId, "mcps"), mcps);
  }, [mcps, selectedCompanyId]);
  useEffect(() => {
    if (selectedCompanyId) save(storageKey(selectedCompanyId, "apis"), apis);
  }, [apis, selectedCompanyId]);

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Abilities</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Connect external services, MCP servers, and APIs to your company's agents.
          </p>
        </div>
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-border bg-muted/40 text-[11px] text-muted-foreground shrink-0">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-400 shrink-0" />
          Local storage
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={(v) => setTab(v as AbilitiesTab)}>
        <PageTabBar
          items={[
            { value: "connectors", label: `Connectors${connectors.length ? ` (${connectors.length})` : ""}` },
            { value: "mcps", label: `MCP Servers${mcps.length ? ` (${mcps.length})` : ""}` },
            { value: "apis", label: `APIs${apis.length ? ` (${apis.length})` : ""}` },
          ]}
          value={tab}
          onValueChange={(v) => setTab(v as AbilitiesTab)}
        />
      </Tabs>

      {tab === "connectors" && <ConnectorsSection connectors={connectors} onChange={setConnectors} />}
      {tab === "mcps" && <MCPsSection mcps={mcps} onChange={setMCPs} agents={agents} />}
      {tab === "apis" && <APIsSection apis={apis} onChange={setAPIs} />}
    </div>
  );
}
