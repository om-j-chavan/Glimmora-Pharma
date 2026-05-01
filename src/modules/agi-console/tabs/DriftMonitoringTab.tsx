import { Activity, AlertCircle, Plus } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import dayjs from "@/lib/dayjs";
import { chartDefaults } from "@/lib/chartColors";
import type { DriftAlert, DriftSeverity, DriftStatus } from "@/types/agi";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";

function driftSevBadge(s: DriftSeverity) { return <Badge variant={s === "Critical" ? "red" : s === "Major" ? "amber" : "gray"}>{s}</Badge>; }
function driftStatBadge(s: DriftStatus) { const m: Record<DriftStatus, "blue" | "amber" | "green"> = { Open: "blue", Investigating: "amber", Resolved: "green" }; return <Badge variant={m[s]}>{s}</Badge>; }

export interface DriftMonitoringTabProps {
  driftAlerts: DriftAlert[];
  openAlertsCount: number;
  driftMetrics: { month: string; accuracy: number; confidence: number }[];
  role: string;
  timezone: string;
  dateFormat: string;
  ownerName: (id: string) => string;
  onAddAlertOpen: () => void;
  onResolveAlert: (alert: DriftAlert) => void;
}

export function DriftMonitoringTab({
  driftAlerts, openAlertsCount, driftMetrics, role, timezone, dateFormat,
  ownerName, onAddAlertOpen, onResolveAlert,
}: DriftMonitoringTabProps) {
  return (
    <>
      {/* Performance chart */}
      <div className="card mb-4"><div className="card-header"><div className="flex items-center gap-2"><Activity className="w-4 h-4 text-[#6366f1]" aria-hidden="true" /><span className="card-title">Model performance &amp; drift metrics</span></div></div><div className="card-body">
        {driftMetrics.length === 0 ? (
          <p className="text-[11px] italic text-center py-6" style={{ color: "var(--text-muted)" }}>No metrics data available.</p>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={driftMetrics}>
              <CartesianGrid {...chartDefaults.cartesianGrid} />
              <XAxis dataKey="month" {...chartDefaults.xAxis} />
              <YAxis {...chartDefaults.yAxis} domain={[70, 100]} />
              <Tooltip {...chartDefaults.tooltip} />
              <Legend iconType="circle" iconSize={8} formatter={(v: string) => <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>{v}</span>} />
              <Line type="monotone" dataKey="accuracy" name="Accuracy" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="confidence" name="Confidence" stroke="#6366f1" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div></div>

      {/* Alerts table */}
      <div className="card overflow-hidden"><div className="card-header">
        <div className="flex items-center gap-2"><AlertCircle className="w-4 h-4 text-[#ef4444]" aria-hidden="true" /><span className="card-title">Drift alerts</span>{openAlertsCount > 0 && <Badge variant="red">{openAlertsCount} open</Badge>}</div>
        {role !== "viewer" && <Button variant="primary" size="sm" icon={Plus} className="ml-auto" onClick={onAddAlertOpen}>Log alert</Button>}
      </div><div className="card-body">
        {driftAlerts.length === 0 ? (
          <p className="text-[11px] italic text-center py-6" style={{ color: "var(--text-muted)" }}>No drift alerts logged. Log alerts manually or enable Drift Detection agent for automated monitoring.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table" aria-label="Drift alerts">
              <thead><tr><th scope="col">Type</th><th scope="col">Severity</th><th scope="col">Description</th><th scope="col">Agent</th><th scope="col">Owner</th><th scope="col">Detected</th><th scope="col">Status</th>{role !== "viewer" && <th scope="col"><span className="sr-only">Actions</span></th>}</tr></thead>
              <tbody>{driftAlerts.map((a) => (
                <tr key={a.id}>
                  <td><Badge variant="gray">{a.type}</Badge></td>
                  <td>{driftSevBadge(a.severity)}</td>
                  <td><p className="text-[12px] line-clamp-2" style={{ maxWidth: 220, color: "var(--text-primary)" }}>{a.description}</p></td>
                  <td className="text-[11px]" style={{ color: "var(--text-secondary)" }}>{a.agent}</td>
                  <td className="text-[11px]" style={{ color: "var(--text-secondary)" }}>{ownerName(a.owner)}</td>
                  <td className="text-[11px]" style={{ color: "var(--text-secondary)" }}>{a.detectedAt ? dayjs.utc(a.detectedAt).tz(timezone).format(dateFormat) : "\u2014"}</td>
                  <td>{driftStatBadge(a.status)}</td>
                  {role !== "viewer" && <td>{a.status !== "Resolved" && <Button variant="ghost" size="xs" onClick={() => onResolveAlert(a)}>Resolve</Button>}</td>}
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </div></div>
    </>
  );
}
