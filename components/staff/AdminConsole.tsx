"use client";

import { bpRuleError } from "@/lib/selfCheckThresholds";
import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import type { Role } from "@prisma/client";
import { Card } from "@/components/ui/Card";
import { TabBar } from "@/components/ui/TabBar";
import { StaffHeader } from "./StaffHeader";
import { ConfirmProvider, useConfirm } from "./ConfirmDialog";
import { METRIC, METRICS, type MetricId } from "@/lib/monitoring/catalog";
import { ruleText } from "@/components/monitoring/MonitoringPanel";
import type { Rule } from "@/lib/monitoring/engine";

type GroupRef = { id: string; code: string; name: string };
type Group = GroupRef & {
  description: string | null;
  destination: string | null;
  createdAt: string;
  _count: { members: number };
  overseers: { id: string; name: string; email: string }[];
};
type AdminUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  callsign: string;
  crewId: string;
  groupId: string | null;
  createdAt: string;
  disabled: boolean;
  group: GroupRef | null;
  overseenGroups: GroupRef[];
};

const input =
  "min-h-10 w-full rounded-md border border-mc-line-strong bg-mc-inset px-3 text-sm text-foreground placeholder:text-mc-label focus:border-mc-select focus:outline-none";
const primary =
  "min-h-10 rounded-md bg-mc-select px-4 text-sm font-semibold text-mc-on-select hover:bg-mc-soft disabled:opacity-50";
const ghost = "min-h-9 rounded-md border border-mc-line-strong px-3 text-xs font-medium text-mc-muted hover:text-foreground";

const ROLE_LABEL: Record<Role, string> = {
  SUPER_ADMIN: "Super admin",
  OVERSIGHT: "Oversight",
  COMMANDER: "Commander",
  ASTRONAUT: "Astronaut",
};

/** A readable temporary password: no look-alike characters. */
function tempPassword() {
  const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

async function api(url: string, method: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5 text-xs text-mc-label">
      {label}
      {children}
    </label>
  );
}

export function AdminConsole({ user }: { user: { id: string; name: string; role: Role } }) {
  const [tab, setTab] = useState("groups");
  const [groups, setGroups] = useState<Group[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const [g, u] = await Promise.all([api("/api/admin/groups", "GET"), api("/api/admin/users", "GET")]);
      setGroups(g.groups);
      setUsers(u.users);
    } catch (e) {
      setNotice({ ok: false, text: e instanceof Error ? e.message : "Could not load" });
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch
    void load();
  }, [load]);

  /** Runs an admin action, shows its result and reloads the lists. */
  const run = useCallback(
    async (action: () => Promise<unknown>, success: string) => {
      try {
        await action();
        // Reload first so the message never shows above a list that is still stale.
        await load();
        setNotice({ ok: true, text: success });
        return true;
      } catch (e) {
        setNotice({ ok: false, text: e instanceof Error ? e.message : "Something went wrong" });
        return false;
      }
    },
    [load]
  );

  const astronauts = users.filter((u) => u.role === "ASTRONAUT");
  const overseers = users.filter((u) => u.role === "OVERSIGHT");

  const tabs = [
    { id: "groups", label: "Mission groups", badge: groups.length },
    { id: "astronauts", label: "Astronauts", badge: astronauts.length },
    { id: "oversight", label: "Oversight accounts", badge: overseers.length },
    { id: "users", label: "All users", badge: users.length },
    { id: "rules", label: "Alert rules" },
    { id: "audit", label: "Audit log" },
  ];

  return (
    <ConfirmProvider>
    <div className="flex min-h-screen flex-col font-sans text-foreground">
      <StaffHeader user={user} active="/admin" subtitle="Super admin · mission groups & accounts" />
      <main className="mx-auto flex w-full max-w-[1200px] flex-col gap-5 p-4 md:p-6">
        <TabBar tabs={tabs} active={tab} onChange={setTab} />
        {notice && (
          <p
            role="status"
            className={`rounded-md border px-4 py-2.5 text-sm ${
              notice.ok ? "border-mc-green/40 text-mc-green" : "border-mc-red/50 bg-mc-red/10 text-mc-red"
            }`}
          >
            {notice.text}
          </p>
        )}

        {tab === "groups" && <GroupsTab groups={groups} run={run} />}
        {tab === "astronauts" && <AstronautsTab groups={groups} astronauts={astronauts} run={run} />}
        {tab === "oversight" && <OversightTab groups={groups} overseers={overseers} run={run} />}
        {tab === "users" && <UsersTab users={users} groups={groups} meId={user.id} run={run} />}
        {tab === "rules" && <RulesTab run={run} />}
        {tab === "audit" && <AuditTab />}
      </main>
    </div>
    </ConfirmProvider>
  );
}

type Run = (action: () => Promise<unknown>, success: string) => Promise<boolean>;

function GroupsTab({ groups, run }: { groups: Group[]; run: Run }) {
  const ask = useConfirm();
  const [form, setForm] = useState({ name: "", code: "", destination: "", description: "" });
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState({ name: "", code: "", destination: "", description: "" });

  const create = async (e: FormEvent) => {
    e.preventDefault();
    if (await run(() => api("/api/admin/groups", "POST", form), `Group ${form.code.toUpperCase()} created`)) {
      setForm({ name: "", code: "", destination: "", description: "" });
    }
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="flex flex-col gap-3">
        {groups.length === 0 && <p className="text-sm text-mc-label">No mission groups yet.</p>}
        {groups.map((g) =>
          editing === g.id ? (
            <Card key={g.id} title={`Edit ${g.code}`}>
              <form
                className="grid gap-3 sm:grid-cols-2"
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (await run(() => api(`/api/admin/groups/${g.id}`, "PATCH", draft), `Group ${draft.code.toUpperCase()} saved`)) {
                    setEditing(null);
                  }
                }}
              >
                <Field label="Name">
                  <input className={input} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} required />
                </Field>
                <Field label="Code">
                  <input className={input} value={draft.code} onChange={(e) => setDraft({ ...draft, code: e.target.value })} required />
                </Field>
                <Field label="Mission / destination">
                  <input className={input} value={draft.destination} onChange={(e) => setDraft({ ...draft, destination: e.target.value })} />
                </Field>
                <Field label="Description">
                  <input className={input} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
                </Field>
                <div className="flex gap-2 sm:col-span-2">
                  <button className={primary}>Save</button>
                  <button type="button" className={ghost} onClick={() => setEditing(null)}>
                    Cancel
                  </button>
                </div>
              </form>
            </Card>
          ) : (
            <section key={g.id} className="rounded-lg border border-mc-line bg-mc-panel px-5 py-4">
              <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="flex items-baseline gap-3">
                    <span className="font-mono text-sm text-mc-link">{g.code}</span>
                    <span className="text-[15px] font-semibold">{g.name}</span>
                  </p>
                  <p className="mt-1 text-xs text-mc-muted">
                    {[g.destination, g.description].filter(Boolean).join(" · ") || "No description"}
                  </p>
                  <p className="mt-2 text-xs text-mc-label">
                    {g._count.members} member{g._count.members === 1 ? "" : "s"} · oversight:{" "}
                    {g.overseers.length ? g.overseers.map((o) => o.name).join(", ") : "none assigned"}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className={ghost}
                    onClick={() => {
                      setEditing(g.id);
                      setDraft({ name: g.name, code: g.code, destination: g.destination ?? "", description: g.description ?? "" });
                    }}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className={`${ghost} hover:border-mc-red/60 hover:text-mc-red`}
                    onClick={async () => {
                      const ok = await ask({
                        title: `Delete group ${g.code}?`,
                        body: g._count.members
                          ? `${g.name} still has ${g._count.members} member${g._count.members === 1 ? "" : "s"}. Move them to another group first.`
                          : `${g.name} will be removed, along with its oversight assignments. This can't be undone.`,
                        confirmLabel: "Delete group",
                        danger: true,
                      });
                      if (ok) void run(() => api(`/api/admin/groups/${g.id}`, "DELETE"), `Group ${g.code} deleted`);
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            </section>
          )
        )}
      </div>

      <Card title="New mission group">
        <form className="flex flex-col gap-3" onSubmit={create}>
          <Field label="Name">
            <input className={input} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Artemis Lunar Gateway" required />
          </Field>
          <Field label="Code (shown as the crew id)">
            <input className={input} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="ART-3" required />
          </Field>
          <Field label="Mission / destination">
            <input className={input} value={form.destination} onChange={(e) => setForm({ ...form, destination: e.target.value })} placeholder="Lunar orbit" />
          </Field>
          <Field label="Description">
            <textarea className={`${input} py-2`} rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </Field>
          <button className={primary}>Create group</button>
        </form>
      </Card>
    </div>
  );
}

function AstronautsTab({ groups, astronauts, run }: { groups: Group[]; astronauts: AdminUser[]; run: Run }) {
  const empty = { name: "", email: "", password: "", callsign: "", groupId: "" };
  const [form, setForm] = useState(empty);
  const [created, setCreated] = useState<{ email: string; password: string } | null>(null);
  const groupId = form.groupId || groups[0]?.id || "";

  const create = async (e: FormEvent) => {
    e.preventDefault();
    const body = { ...form, groupId, role: "ASTRONAUT" };
    if (await run(() => api("/api/admin/users", "POST", body), `Astronaut ${form.name} created`)) {
      setCreated({ email: form.email.trim().toLowerCase(), password: form.password });
      setForm(empty);
    }
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
      <Card title="Astronauts by group">
        <div className="flex flex-col gap-5">
          {groups.map((g) => {
            const list = astronauts.filter((a) => a.groupId === g.id);
            return (
              <div key={g.id}>
                <h4 className="mb-2 text-xs font-semibold text-mc-soft">
                  <span className="font-mono text-mc-link">{g.code}</span> · {g.name}
                </h4>
                {list.length === 0 && <p className="text-xs text-mc-label">No astronauts yet.</p>}
                <ul className="divide-y divide-mc-line">
                  {list.map((a) => (
                    <MemberRow key={a.id} astronaut={a} groups={groups} run={run} />
                  ))}
                </ul>
              </div>
            );
          })}
          {astronauts.some((a) => !a.groupId) && (
            <div>
              <h4 className="mb-2 text-xs font-semibold text-mc-amber">Not in a group</h4>
              <ul className="divide-y divide-mc-line">
                {astronauts
                  .filter((a) => !a.groupId)
                  .map((a) => (
                    <MemberRow key={a.id} astronaut={a} groups={groups} run={run} />
                  ))}
              </ul>
            </div>
          )}
        </div>
      </Card>

      <div className="flex flex-col gap-5">
      <Card title="New astronaut account">
        {groups.length === 0 ? (
          <p className="text-sm text-mc-label">Create a mission group first.</p>
        ) : (
          <form className="flex flex-col gap-3" onSubmit={create}>
            <Field label="Mission group">
              <select className={input} value={groupId} onChange={(e) => setForm({ ...form, groupId: e.target.value })}>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.code} · {g.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Name (as shown on the crew card)">
              <input className={input} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </Field>
            <Field label="Callsign / crew position">
              <input className={input} value={form.callsign} onChange={(e) => setForm({ ...form, callsign: e.target.value })} placeholder="EV1, FE, CMO…" />
            </Field>
            <Field label="Email">
              <input className={input} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
            </Field>
            <Field label="Temporary password (min 8)">
              <div className="flex gap-2">
                <input className={`${input} font-mono`} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} minLength={8} required />
                <button type="button" className={ghost} onClick={() => setForm({ ...form, password: tempPassword() })}>
                  Generate
                </button>
              </div>
            </Field>
            <button className={primary}>Create astronaut</button>
            {created && (
              <p className="rounded-md border border-mc-line-strong bg-mc-inset px-3 py-2 text-xs text-mc-muted">
                Give the astronaut: <span className="font-mono text-foreground">{created.email}</span> /{" "}
                <span className="font-mono text-foreground">{created.password}</span>. It is stored hashed and won&apos;t be shown again.
              </p>
            )}
          </form>
        )}
      </Card>
      {groups.length > 0 && <ImportCard groups={groups} run={run} />}
      </div>
    </div>
  );
}

type ImportResult = { line: number; email: string; ok: boolean; password?: string; error?: string };

/** Paste "name, email, callsign" lines to create several astronauts in one group. */
function ImportCard({ groups, run }: { groups: Group[]; run: Run }) {
  const [groupId, setGroupId] = useState("");
  const [text, setText] = useState("");
  const [results, setResults] = useState<ImportResult[] | null>(null);
  const target = groupId || groups[0]?.id || "";

  const rows = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !/^name\s*,/i.test(l))
    .map((l) => {
      const [name = "", email = "", callsign = ""] = l.split(",").map((c) => c.trim());
      return { name, email, callsign };
    });

  return (
    <Card title="Import astronauts (CSV)">
      <form
        className="flex flex-col gap-3"
        onSubmit={async (e) => {
          e.preventDefault();
          let found: ImportResult[] = [];
          const ok = await run(async () => {
            const res = (await api("/api/admin/users/import", "POST", { groupId: target, rows })) as { created: number; results: ImportResult[] };
            found = res.results;
          }, `Import finished: see the result list below`);
          if (ok) {
            setResults(found);
            setText("");
          }
        }}
      >
        <Field label="Into group">
          <select className={input} value={target} onChange={(e) => setGroupId(e.target.value)}>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.code} · {g.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="One astronaut per line: name, email, callsign">
          <textarea
            className={`${input} py-2 font-mono text-xs`}
            rows={4}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={"Ada Lin, ada@crew.space, EV1\nRavi Shah, ravi@crew.space, FE"}
          />
        </Field>
        <button className={primary} disabled={!rows.length}>
          Import {rows.length || ""} astronaut{rows.length === 1 ? "" : "s"}
        </button>
      </form>
      {results && (
        <div className="mt-3 rounded-md border border-mc-line-strong bg-mc-inset px-3 py-2 text-xs">
          <p className="mb-1 text-mc-label">Temporary passwords, shown once:</p>
          <ul className="flex flex-col gap-0.5 font-mono">
            {results.map((r) => (
              <li key={r.line} className={r.ok ? "text-foreground" : "text-mc-red"}>
                {r.email || `line ${r.line}`} {r.ok ? `/ ${r.password}` : `· ${r.error}`}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

function MemberRow({ astronaut: a, groups, run }: { astronaut: AdminUser; groups: Group[]; run: Run }) {
  return (
    <li className="flex flex-wrap items-center gap-3 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">
          {a.name} <span className="font-mono text-[11px] text-mc-label">{a.callsign}</span>
          {a.disabled && <DisabledBadge />}
        </p>
        <p className="truncate text-xs text-mc-label">{a.email}</p>
      </div>
      <label className="flex items-center gap-2 text-xs text-mc-label">
        Move to
        <select
          aria-label={`Move ${a.name} to group`}
          className="min-h-9 rounded-md border border-mc-line-strong bg-mc-inset px-2 text-xs text-foreground"
          value={a.groupId ?? ""}
          onChange={(e) => {
            const g = groups.find((x) => x.id === e.target.value);
            if (g) void run(() => api(`/api/admin/users/${a.id}`, "PATCH", { groupId: g.id }), `${a.name} moved to ${g.code}`);
          }}
        >
          {!a.groupId && <option value="">—</option>}
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.code}
            </option>
          ))}
        </select>
      </label>
    </li>
  );
}

function GroupChecks({ groups, value, onToggle }: { groups: Group[]; value: string[]; onToggle: (id: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {groups.map((g) => {
        const on = value.includes(g.id);
        return (
          <label
            key={g.id}
            className={`flex min-h-9 cursor-pointer items-center gap-2 rounded-md border px-3 text-xs ${
              on ? "border-mc-select bg-mc-select text-mc-on-select" : "border-mc-line-strong text-mc-muted"
            }`}
          >
            <input type="checkbox" className="accent-mc-select" checked={on} onChange={() => onToggle(g.id)} />
            <span className="font-mono">{g.code}</span>
          </label>
        );
      })}
    </div>
  );
}

const toggle = (ids: string[], id: string) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]);

/**
 * An oversight user's group ticks. Each tick shows at once and the saves run in order,
 * each sending the full latest set, so quick clicks never undo each other. The server's
 * list takes over again once every save has finished.
 */
function OverseerGroups({ overseer: o, groups, run }: { overseer: AdminUser; groups: Group[]; run: Run }) {
  const serverIds = o.overseenGroups.map((g) => g.id);
  const [local, setLocal] = useState<string[] | null>(null);
  const latest = useRef<string[]>([]);
  const pending = useRef(0);
  const queue = useRef<Promise<unknown>>(Promise.resolve());

  return (
    <GroupChecks
      groups={groups}
      value={local ?? serverIds}
      onToggle={(id) => {
        const next = toggle(pending.current ? latest.current : serverIds, id);
        latest.current = next;
        pending.current += 1;
        setLocal(next);
        queue.current = queue.current
          .then(() => run(() => api(`/api/admin/users/${o.id}`, "PATCH", { groupIds: next }), `${o.name}'s groups updated`))
          .finally(() => {
            pending.current -= 1;
            if (!pending.current) setLocal(null);
          });
      }}
    />
  );
}

function OversightTab({ groups, overseers, run }: { groups: Group[]; overseers: AdminUser[]; run: Run }) {
  const empty = { name: "", email: "", password: "", callsign: "SURGEON", groupIds: [] as string[] };
  const [form, setForm] = useState(empty);
  const [created, setCreated] = useState<{ email: string; password: string } | null>(null);

  const create = async (e: FormEvent) => {
    e.preventDefault();
    if (await run(() => api("/api/admin/users", "POST", { ...form, role: "OVERSIGHT" }), `Oversight account for ${form.name} created`)) {
      setCreated({ email: form.email.trim().toLowerCase(), password: form.password });
      setForm(empty);
    }
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
      <Card title="Oversight accounts · groups each can read">
        {overseers.length === 0 && <p className="text-sm text-mc-label">No oversight accounts yet.</p>}
        <ul className="divide-y divide-mc-line">
          {overseers.map((o) => (
            <li key={o.id} className="flex flex-col gap-2 py-3">
              <p className="text-sm font-medium">
                {o.name} <span className="font-mono text-[11px] text-mc-label">{o.callsign}</span>
                <span className="ml-2 text-xs font-normal text-mc-label">{o.email}</span>
              </p>
              <OverseerGroups
                key={o.id}
                overseer={o}
                groups={groups}
                run={run}
              />
            </li>
          ))}
        </ul>
      </Card>

      <Card title="New oversight account">
        <form className="flex flex-col gap-3" onSubmit={create}>
          <Field label="Name">
            <input className={input} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Dr. … (flight surgeon)" required />
          </Field>
          <Field label="Role tag">
            <input className={input} value={form.callsign} onChange={(e) => setForm({ ...form, callsign: e.target.value })} placeholder="SURGEON, CAPCOM…" />
          </Field>
          <Field label="Email">
            <input className={input} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
          </Field>
          <Field label="Temporary password (min 8)">
            <div className="flex gap-2">
              <input className={`${input} font-mono`} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} minLength={8} required />
              <button type="button" className={ghost} onClick={() => setForm({ ...form, password: tempPassword() })}>
                Generate
              </button>
            </div>
          </Field>
          <div className="flex flex-col gap-1.5 text-xs text-mc-label">
            Groups this account can read
            <GroupChecks groups={groups} value={form.groupIds} onToggle={(id) => setForm((f) => ({ ...f, groupIds: toggle(f.groupIds, id) }))} />
          </div>
          <button className={primary}>Create oversight account</button>
          {created && (
            <p className="rounded-md border border-mc-line-strong bg-mc-inset px-3 py-2 text-xs text-mc-muted">
              Sign-in: <span className="font-mono text-foreground">{created.email}</span> /{" "}
              <span className="font-mono text-foreground">{created.password}</span>. Stored hashed; not shown again.
            </p>
          )}
        </form>
      </Card>
    </div>
  );
}

function DisabledBadge() {
  return (
    <span className="ml-2 rounded border border-mc-red/50 px-1.5 py-0.5 align-middle font-mono text-[10px] font-semibold text-mc-red">
      DISABLED
    </span>
  );
}

const ROLES: Role[] = ["ASTRONAUT", "OVERSIGHT", "COMMANDER", "SUPER_ADMIN"];

function UsersTab({ users, groups, meId, run }: { users: AdminUser[]; groups: Group[]; meId: string; run: Run }) {
  const ask = useConfirm();
  const [query, setQuery] = useState("");
  const [role, setRole] = useState("");
  const [groupId, setGroupId] = useState("");
  const [status, setStatus] = useState("");
  const [editing, setEditing] = useState<string | null>(null);

  const q = query.trim().toLowerCase();
  const shown = users.filter(
    (u) =>
      (!q || u.name.toLowerCase().includes(q) || u.email.includes(q) || u.callsign.toLowerCase().includes(q)) &&
      (!role || u.role === role) &&
      (!groupId ||
        (groupId === "none" ? !u.groupId && !u.overseenGroups.length : u.groupId === groupId || u.overseenGroups.some((g) => g.id === groupId))) &&
      (!status || (status === "disabled") === u.disabled)
  );

  const filter = "min-h-9 rounded-md border border-mc-line-strong bg-mc-inset px-2 text-xs text-foreground";

  return (
    <Card
      title={`All users · ${shown.length} of ${users.length}`}
      action={
        <div className="flex flex-wrap gap-2">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, email, callsign…"
            aria-label="Search users"
            className={`${filter} w-56 placeholder:text-mc-label`}
          />
          <select aria-label="Filter by role" className={filter} value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="">All roles</option>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
          <select aria-label="Filter by group" className={filter} value={groupId} onChange={(e) => setGroupId(e.target.value)}>
            <option value="">All groups</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.code}
              </option>
            ))}
            <option value="none">No group</option>
          </select>
          <select aria-label="Filter by status" className={filter} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Active and disabled</option>
            <option value="active">Active</option>
            <option value="disabled">Disabled</option>
          </select>
        </div>
      }
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] text-left text-sm">
          <thead className="text-xs text-mc-label">
            <tr className="border-b border-mc-line">
              <th className="py-2 pr-4 font-medium">Name</th>
              <th className="py-2 pr-4 font-medium">Email</th>
              <th className="py-2 pr-4 font-medium">Role</th>
              <th className="py-2 pr-4 font-medium">Group / reads</th>
              <th className="py-2 pr-4 font-medium">Created</th>
              <th className="py-2 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-mc-line">
            {shown.map((u) =>
              editing === u.id ? (
                <EditRow key={u.id} u={u} groups={groups} self={u.id === meId} run={run} onDone={() => setEditing(null)} />
              ) : (
                <tr key={u.id} className={u.disabled ? "opacity-60" : undefined}>
                  <td className="py-2 pr-4">
                    {u.name} <span className="font-mono text-[11px] text-mc-label">{u.callsign}</span>
                    {u.disabled && <DisabledBadge />}
                    {u.id === meId && <span className="ml-2 text-[11px] text-mc-link">you</span>}
                  </td>
                  <td className="py-2 pr-4 text-mc-muted">{u.email}</td>
                  <td className="py-2 pr-4">{ROLE_LABEL[u.role]}</td>
                  <td className="py-2 pr-4 font-mono text-xs text-mc-link">
                    {u.role === "OVERSIGHT"
                      ? u.overseenGroups.map((g) => g.code).join(", ") || "—"
                      : u.group?.code ?? (u.role === "ASTRONAUT" ? "—" : u.crewId)}
                  </td>
                  <td className="py-2 pr-4 text-xs text-mc-label">{new Date(u.createdAt).toLocaleDateString()}</td>
                  <td className="py-2">
                    <div className="flex justify-end gap-1.5">
                      <button type="button" className={ghost} onClick={() => setEditing(u.id)}>
                        Edit
                      </button>
                      <button
                        type="button"
                        className={ghost}
                        onClick={async () => {
                          const ok = await ask({
                            title: `Reset ${u.name}'s password?`,
                            body: "Their current password stops working at once. The new temporary password is shown once, so have a way to hand it over.",
                            confirmLabel: "Reset password",
                          });
                          if (!ok) return;
                          const password = tempPassword();
                          void run(
                            () => api(`/api/admin/users/${u.id}`, "PATCH", { password }),
                            `New temporary password for ${u.email}: ${password} (shown once)`
                          );
                        }}
                      >
                        Reset password
                      </button>
                      {u.id !== meId && (
                        <button
                          type="button"
                          className={ghost}
                          onClick={() =>
                            void run(
                              () => api(`/api/admin/users/${u.id}`, "PATCH", { disabled: !u.disabled }),
                              `${u.name} ${u.disabled ? "enabled" : "disabled"}`
                            )
                          }
                        >
                          {u.disabled ? "Enable" : "Disable"}
                        </button>
                      )}
                      {u.id !== meId && (
                        <button
                          type="button"
                          className={`${ghost} hover:border-mc-red/60 hover:text-mc-red`}
                          onClick={async () => {
                            const ok = await ask({
                              title: `Delete ${u.name} permanently?`,
                              body: "This removes the account and all its vitals, health logs and AI chats. To keep the records, use Disable instead.",
                              confirmLabel: "Delete account",
                              danger: true,
                              typeToConfirm: u.email,
                            });
                            if (ok) void run(() => api(`/api/admin/users/${u.id}`, "DELETE"), `${u.name} deleted`);
                          }}
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )
            )}
          </tbody>
        </table>
        {shown.length === 0 && <p className="py-4 text-sm text-mc-label">No users match these filters.</p>}
      </div>
    </Card>
  );
}

function EditRow({ u, groups, self, run, onDone }: { u: AdminUser; groups: Group[]; self: boolean; run: Run; onDone: () => void }) {
  const [name, setName] = useState(u.name);
  const [callsign, setCallsign] = useState(u.callsign);
  const [role, setRole] = useState<Role>(u.role);
  const [groupId, setGroupId] = useState(u.groupId ?? groups[0]?.id ?? "");
  const cell = "min-h-9 w-full rounded-md border border-mc-line-strong bg-mc-inset px-2 text-xs text-foreground";
  const ask = useConfirm();

  const save = async () => {
    const body: Record<string, unknown> = { name, callsign };
    if (role !== u.role) body.role = role;
    if (role === "ASTRONAUT" && groupId !== u.groupId) body.groupId = groupId;
    if (
      role !== u.role &&
      !(await ask({
        title: `Change ${u.name}'s role?`,
        body: `${ROLE_LABEL[u.role]} → ${ROLE_LABEL[role]}. This changes what they can see and do.${
          u.role === "OVERSIGHT" ? " Their group assignments are cleared." : ""
        }${role === "SUPER_ADMIN" ? " Super admins can manage every account and read every group." : ""}`,
        confirmLabel: "Change role",
        danger: role === "SUPER_ADMIN",
      }))
    ) {
      return;
    }
    if (await run(() => api(`/api/admin/users/${u.id}`, "PATCH", body), `${name} saved`)) onDone();
  };

  return (
    <tr className="bg-mc-raised">
      <td className="py-2 pr-2">
        <div className="flex gap-1.5">
          <input aria-label="Name" className={cell} value={name} onChange={(e) => setName(e.target.value)} />
          <input aria-label="Callsign" className={`${cell} w-20 font-mono`} value={callsign} onChange={(e) => setCallsign(e.target.value)} />
        </div>
      </td>
      <td className="py-2 pr-2 text-xs text-mc-muted">{u.email}</td>
      <td className="py-2 pr-2">
        <select aria-label="Role" className={cell} value={role} disabled={self} onChange={(e) => setRole(e.target.value as Role)}>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABEL[r]}
            </option>
          ))}
        </select>
      </td>
      <td className="py-2 pr-2">
        {role === "ASTRONAUT" ? (
          <select aria-label="Group" className={cell} value={groupId} onChange={(e) => setGroupId(e.target.value)}>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.code}
              </option>
            ))}
          </select>
        ) : (
          <span className="text-xs text-mc-label">{role === "OVERSIGHT" ? "Set on Oversight tab" : "HQ"}</span>
        )}
      </td>
      <td />
      <td className="py-2">
        <div className="flex justify-end gap-1.5">
          <button type="button" className={primary.replace("min-h-10", "min-h-9")} onClick={() => void save()}>
            Save
          </button>
          <button type="button" className={ghost} onClick={onDone}>
            Cancel
          </button>
        </div>
      </td>
    </tr>
  );
}

type AuditEntry = {
  id: string;
  actorName: string;
  action: string;
  targetType: string;
  targetLabel: string;
  detail: string | null;
  createdAt: string;
};

const ACTION_LABEL: Record<string, string> = {
  "group.create": "Created group",
  "group.update": "Edited group",
  "group.delete": "Deleted group",
  "user.create": "Created account",
  "user.update": "Changed account",
  "user.delete": "Deleted account",
  "user.import": "Imported astronauts",
  "rule.update": "Edited alert rule",
  "alert.acknowledge": "Acknowledged alert",
  "alert.resolve": "Resolved alert",
};

function AuditTab() {
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api("/api/admin/audit", "GET")
      .then((d: { entries: AuditEntry[] }) => setEntries(d.entries))
      .catch((e: Error) => setError(e.message));
  }, []);

  return (
    <Card title="Audit log · newest 300 admin actions">
      {error && <p className="text-sm text-mc-red">{error}</p>}
      {entries?.length === 0 && <p className="text-sm text-mc-label">No admin actions recorded yet.</p>}
      <ul className="divide-y divide-mc-line">
        {entries?.map((e) => (
          <li key={e.id} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 py-2 text-sm">
            <span className="w-40 shrink-0 font-mono text-[11px] text-mc-label">{new Date(e.createdAt).toLocaleString()}</span>
            <span className="font-medium">{e.actorName}</span>
            <span className="text-mc-link">{ACTION_LABEL[e.action] ?? e.action}</span>
            <span>{e.targetLabel}</span>
            {e.detail && <span className="text-xs text-mc-muted">{e.detail}</span>}
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** Super admin editor for the monitoring alert rules: thresholds, window and on/off. */
function RulesTab({ run }: { run: Run }) {
  const [rules, setRules] = useState<Rule[] | null>(null);
  const [drafts, setDrafts] = useState<Record<string, { amber: string; red: string; windowDays: string }>>({});
  const [error, setError] = useState("");

  const load = useCallback(() => {
    return api("/api/admin/alert-rules", "GET")
      .then((d: { rules: Rule[] }) => {
        setRules(d.rules);
        setDrafts(Object.fromEntries(d.rules.map((r) => [r.id, { amber: String(r.amber), red: String(r.red), windowDays: String(r.windowDays) }])));
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Reload inside the action so the "saved" message only shows once the table is current
  // and nothing typed after it is overwritten by a late reload.
  const save = (r: Rule, patch: Record<string, unknown>, what: string) =>
    run(async () => {
      await api("/api/admin/alert-rules", "PATCH", { id: r.id, ...patch });
      await load();
    }, what);

  const cell = "min-h-9 w-20 rounded-md border border-mc-line-strong bg-mc-inset px-2 font-mono text-xs text-foreground";
  return (
    <Card title="Alert rules · monitoring thresholds">
      <p className="mb-4 max-w-3xl text-xs leading-relaxed text-mc-muted">
        Rules are checked when a crew member&apos;s monitoring is viewed. Threshold rules use the average over the window.
        Latest-reading rules use the most recent value in the window. Trend rules compare two windows, and missing-data rules count hours since the last value.
        Changes apply at once and are written to the audit log. Defaults and their NASA sources are listed under each metric&apos;s
        &ldquo;Why we monitor this&rdquo;.
      </p>
      {error && <p className="text-sm text-mc-red">{error}</p>}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] text-left text-sm">
          <thead className="text-xs text-mc-label">
            <tr className="border-b border-mc-line">
              <th className="py-2 pr-3 font-medium">Metric</th>
              <th className="py-2 pr-3 font-medium">Rule</th>
              <th className="py-2 pr-3 font-medium">Amber</th>
              <th className="py-2 pr-3 font-medium">Red</th>
              <th className="py-2 pr-3 font-medium">Window (days)</th>
              <th className="py-2 pr-3 font-medium">On</th>
              <th className="py-2 font-medium" />
            </tr>
          </thead>
          <tbody className="divide-y divide-mc-line">
            {METRICS.flatMap((m) => (rules ?? []).filter((r) => r.metric === m.id)).map((r) => {
              const d = drafts[r.id] ?? { amber: "", red: "", windowDays: "" };
              const unit = r.kind === "missing" ? "h" : r.kind === "trend" ? "%" : METRIC[r.metric as MetricId].unit;
              const dirty = d.amber !== String(r.amber) || d.red !== String(r.red) || d.windowDays !== String(r.windowDays);
              const bpError =
                dirty && r.kind !== "missing" && r.kind !== "trend"
                  ? bpRuleError({ id: r.id, metric: r.metric, amber: Number(d.amber), red: Number(d.red) }, rules ?? [])
                  : null;
              const set = (k: keyof typeof d, v: string) => setDrafts((all) => ({ ...all, [r.id]: { ...d, [k]: v } }));
              return (
                <tr key={r.id} data-rule={r.id} className={r.enabled ? undefined : "opacity-60"}>
                  <td className="py-2 pr-3">{METRIC[r.metric as MetricId].label}</td>
                  <td className="py-2 pr-3">
                    <p className="font-medium">{r.label}</p>
                    <p className="text-[11px] text-mc-label">{ruleText(r)}</p>
                    {bpError && (
                      <p className="mt-1 text-[11px] font-semibold text-mc-red" role="alert">
                        {bpError}
                      </p>
                    )}
                  </td>
                  <td className="py-2 pr-3">
                    <input aria-label={`${r.label} amber`} className={cell} value={d.amber} onChange={(e) => set("amber", e.target.value)} />{" "}
                    <span className="text-[11px] text-mc-label">{unit}</span>
                  </td>
                  <td className="py-2 pr-3">
                    <input aria-label={`${r.label} red`} className={cell} value={d.red} onChange={(e) => set("red", e.target.value)} />{" "}
                    <span className="text-[11px] text-mc-label">{unit}</span>
                  </td>
                  <td className="py-2 pr-3">
                    {r.kind === "missing" ? (
                      <span className="text-[11px] text-mc-label">—</span>
                    ) : (
                      <input aria-label={`${r.label} window`} className={cell} value={d.windowDays} onChange={(e) => set("windowDays", e.target.value)} />
                    )}
                  </td>
                  <td className="py-2 pr-3">
                    <input
                      type="checkbox"
                      aria-label={`${r.label} enabled`}
                      className="h-4 w-4 accent-mc-select"
                      checked={r.enabled}
                      onChange={() => void save(r, { enabled: !r.enabled }, `${r.label} ${r.enabled ? "switched off" : "switched on"}`)}
                    />
                  </td>
                  <td className="py-2 text-right">
                    <button
                      type="button"
                      disabled={!dirty || Boolean(bpError)}
                      className={primary.replace("min-h-10", "min-h-9")}
                      onClick={() =>
                        void save(r, { amber: Number(d.amber), red: Number(d.red), windowDays: Number(d.windowDays) }, `${r.label} saved`)
                      }
                    >
                      Save
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
