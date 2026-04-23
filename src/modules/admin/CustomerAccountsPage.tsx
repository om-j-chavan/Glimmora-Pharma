"use client";
import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Plus,
  Pencil,
  Trash2,
  Building2,
  Users,
  MapPin,
  Search,
  X,
  Save,
  Upload,
  FileText,
} from "lucide-react";
import { useAppSelector } from "@/hooks/useAppSelector";
import { useAppDispatch } from "@/hooks/useAppDispatch";
import {
  addTenant,
  updateTenant,
  removeTenant,
  setTenants,
  type Tenant,
} from "@/store/auth.slice";
import { fetchTenants, createTenantApi, updateTenantApi, deleteTenantApi } from "@/lib/tenantApi";
import { isTenantEffectivelyActive, getInactiveReason } from "@/lib/tenantStatus";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Badge } from "@/components/ui/Badge";
import dayjs from "@/lib/dayjs";

/* ── Helpers ── */

function nextCustomerCode(name: string, existingTenants: { id: string }[]) {
  // Generate code from company name initials: "Pharma Glimmora International" → "PGI_001"
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase())
    .join("")
    .slice(0, 4) || "GP";
  const existingCodes = new Set(existingTenants.map((t) => t.id));
  let seq = 1;
  let code = `${initials}_${String(seq).padStart(3, "0")}`;
  while (existingCodes.has(code)) {
    seq++;
    code = `${initials}_${String(seq).padStart(3, "0")}`;
  }
  return code;
}

/* ── Yes / No toggle button ── */

function YesNo({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div>
      <span className="block text-[11px] font-medium mb-1.5" style={{ color: "var(--text-secondary)" }}>{label}</span>
      <div className="flex gap-0 rounded-lg overflow-hidden" style={{ border: "1px solid var(--bg-border)" }}>
        <button
          type="button"
          onClick={() => onChange(true)}
          className="px-3 py-1.5 text-[11px] font-semibold border-none cursor-pointer transition-all"
          style={{
            background: value ? "var(--brand)" : "var(--bg-surface)",
            color: value ? "#fff" : "var(--text-muted)",
          }}
        >
          Yes
        </button>
        <button
          type="button"
          onClick={() => onChange(false)}
          className="px-3 py-1.5 text-[11px] font-semibold border-none cursor-pointer transition-all"
          style={{
            background: !value ? "var(--danger)" : "var(--bg-surface)",
            color: !value ? "#fff" : "var(--text-muted)",
            borderLeft: "1px solid var(--bg-border)",
          }}
        >
          No
        </button>
      </div>
    </div>
  );
}

/* ── Subscription Plan types & modal ── */

interface SubPlan {
  id: string;
  startDate: string;
  expiryDate: string;
  maxAccounts: number;
  status: "Active" | "Inactive";
}

function SubscriptionPlansModal({
  open,
  onClose,
  plans,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  plans: SubPlan[];
  onSave: (plans: SubPlan[]) => void;
}) {
  const [items, setItems] = useState<SubPlan[]>(plans);
  const [editModal, setEditModal] = useState<SubPlan | null>(null);
  const [isNew, setIsNew] = useState(false);

  // Sync local items with props only when modal opens, not on every render
  useEffect(() => {
    if (open) setItems(plans);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const [planErrors, setPlanErrors] = useState<Record<string, string>>({});

  const openNew = () => {
    setEditModal({
      id: `sp-${Date.now()}`,
      startDate: "",
      expiryDate: "",
      maxAccounts: 0,
      status: "Active",
    });
    setIsNew(true);
    setPlanErrors({});
  };

  const openEdit = (p: SubPlan) => {
    setEditModal({ ...p });
    setIsNew(false);
    setPlanErrors({});
  };

  const handleDelete = (id: string) => {
    const next = items.filter((i) => i.id !== id);
    setItems(next);
    onSave(next);
  };

  const validatePlan = (): boolean => {
    if (!editModal) return false;
    const e: Record<string, string> = {};
    if (!editModal.startDate) e.startDate = "Start date is required";
    if (!editModal.expiryDate) e.expiryDate = "Expiry date is required";
    if (editModal.startDate && editModal.expiryDate && editModal.expiryDate <= editModal.startDate) {
      e.expiryDate = "Expiry must be after start date";
    }
    if (editModal.maxAccounts < 1) e.maxAccounts = "Must be at least 1";
    setPlanErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSavePlan = () => {
    if (!editModal || !validatePlan()) return;
    let next: SubPlan[];
    if (isNew) {
      next = [...items, editModal];
    } else {
      next = items.map((i) => (i.id === editModal.id ? editModal : i));
    }
    setItems(next);
    onSave(next);
    setEditModal(null);
  };

  return (
    <Modal open={open} onClose={onClose} title="Subscription Plans">
      {/* Plans table */}
      <div className="card mb-4">
        <div className="overflow-x-auto">
          <table className="data-table" aria-label="Subscription plans">
            <thead>
              <tr>
                <th scope="col">Accounts Available</th>
                <th scope="col">Expiry Date</th>
                <th scope="col">Status</th>
                <th scope="col">Action</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={4} className="text-center py-10">
                    <FileText className="w-8 h-8 mx-auto mb-2" style={{ color: "var(--text-muted)" }} aria-hidden="true" />
                    <p className="text-[13px] font-semibold" style={{ color: "var(--text-primary)" }}>No Subscription Plans Found</p>
                    <p className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>Add a subscription plan to get started.</p>
                  </td>
                </tr>
              ) : (
                items.map((p) => (
                  <tr key={p.id}>
                    <td>{p.maxAccounts}</td>
                    <td>{p.expiryDate || "—"}</td>
                    <td>
                      <Badge variant={p.status === "Active" ? "green" : "gray"}>{p.status}</Badge>
                    </td>
                    <td>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => openEdit(p)}
                          className="p-1 rounded border-none cursor-pointer bg-transparent"
                          style={{ color: "var(--text-secondary)" }}
                          aria-label="Edit plan"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(p.id)}
                          className="p-1 rounded border-none cursor-pointer bg-transparent"
                          style={{ color: "var(--danger)" }}
                          aria-label="Delete plan"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex gap-3">
        <Button variant="primary" size="sm" icon={Plus} onClick={openNew}>New Subscription Plan</Button>
        <Button variant="secondary" size="sm" onClick={onClose}>Close</Button>
      </div>

      {/* New / Edit subscription modal */}
      {editModal && (
        <Modal open onClose={() => setEditModal(null)} title={isNew ? "New Subscription" : "Edit Subscription"}>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] font-medium mb-1.5" style={{ color: "var(--text-secondary)" }}>
                  Start date <span style={{ color: "var(--danger)" }}>*</span>
                </label>
                <input
                  type="date"
                  value={editModal.startDate}
                  onChange={(e) => setEditModal({ ...editModal, startDate: e.target.value })}
                  className="input"
                  style={planErrors.startDate ? { borderColor: "var(--danger)" } : undefined}
                />
                {planErrors.startDate && <p className="text-[11px] mt-1" style={{ color: "var(--danger)" }}>{planErrors.startDate}</p>}
              </div>
              <div>
                <label className="block text-[11px] font-medium mb-1.5" style={{ color: "var(--text-secondary)" }}>
                  Expiry date <span style={{ color: "var(--danger)" }}>*</span>
                </label>
                <input
                  type="date"
                  value={editModal.expiryDate}
                  onChange={(e) => setEditModal({ ...editModal, expiryDate: e.target.value })}
                  className="input"
                  style={planErrors.expiryDate ? { borderColor: "var(--danger)" } : undefined}
                />
                {planErrors.expiryDate && <p className="text-[11px] mt-1" style={{ color: "var(--danger)" }}>{planErrors.expiryDate}</p>}
              </div>
            </div>
            <div>
              <label className="block text-[11px] font-medium mb-1.5" style={{ color: "var(--text-secondary)" }}>
                Max accounts <span style={{ color: "var(--danger)" }}>*</span>
              </label>
              <input
                type="number"
                min={1}
                value={editModal.maxAccounts}
                onChange={(e) => setEditModal({ ...editModal, maxAccounts: Number(e.target.value) })}
                className="input"
                style={planErrors.maxAccounts ? { borderColor: "var(--danger)" } : undefined}
              />
              {planErrors.maxAccounts && <p className="text-[11px] mt-1" style={{ color: "var(--danger)" }}>{planErrors.maxAccounts}</p>}
            </div>
            <div>
              <span className="block text-[11px] font-medium mb-1.5" style={{ color: "var(--text-secondary)" }}>Status</span>
              <div className="flex gap-0 rounded-lg overflow-hidden" style={{ border: "1px solid var(--bg-border)", display: "inline-flex" }}>
                <button
                  type="button"
                  onClick={() => setEditModal({ ...editModal, status: "Active" })}
                  className="px-4 py-1.5 text-[12px] font-semibold border-none cursor-pointer transition-all"
                  style={{
                    background: editModal.status === "Active" ? "var(--brand)" : "var(--bg-surface)",
                    color: editModal.status === "Active" ? "#fff" : "var(--text-muted)",
                  }}
                >
                  Active
                </button>
                <button
                  type="button"
                  onClick={() => setEditModal({ ...editModal, status: "Inactive" })}
                  className="px-4 py-1.5 text-[12px] font-semibold border-none cursor-pointer transition-all"
                  style={{
                    background: editModal.status === "Inactive" ? "var(--danger)" : "var(--bg-surface)",
                    color: editModal.status === "Inactive" ? "#fff" : "var(--text-muted)",
                    borderLeft: "1px solid var(--bg-border)",
                  }}
                >
                  Inactive
                </button>
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <Button variant="primary" size="sm" icon={Save} onClick={handleSavePlan}>Save</Button>
              <Button variant="secondary" size="sm" onClick={() => setEditModal(null)}>Cancel</Button>
            </div>
          </div>
        </Modal>
      )}
    </Modal>
  );
}

/* ── Account form data ── */

interface AccountFormData {
  customerCode: string;
  customerName: string;
  username: string;
  email: string;
  language: string;
  timezone: string;
  active: boolean;
  newPassword: string;
  confirmPassword: string;
  subscriptionPlans: SubPlan[];
  logoFile: File | null;
}

function makeEmptyForm(): AccountFormData {
  return {
    customerCode: "",
    customerName: "",
    username: "",
    email: "",
    language: "English, United States",
    timezone: "Asia/Kolkata",
    active: true,
    newPassword: "",
    confirmPassword: "",
    subscriptionPlans: [],
    logoFile: null,
  };
}

/* ── Account Drawer (replaces nested modals) ── */

function AccountDrawer({
  open,
  onClose,
  onSave,
  initial,
  mode,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (data: AccountFormData) => void;
  initial: AccountFormData;
  mode: "create" | "edit";
}) {
  const [form, setForm] = useState<AccountFormData>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [subModalOpen, setSubModalOpen] = useState(false);
  const [subSnapshot, setSubSnapshot] = useState<SubPlan[] | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) { setForm(initial); setErrors({}); setSubModalOpen(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const set = <K extends keyof AccountFormData>(key: K, value: AccountFormData[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.customerName.trim()) e.customerName = "Required";
    if (!form.username.trim()) e.username = "Required";
    if (!form.email.trim()) e.email = "Required";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) e.email = "Enter a valid email";
    if (mode === "create") {
      if (!form.newPassword) e.newPassword = "Required";
      if (form.newPassword !== form.confirmPassword) e.confirmPassword = "Passwords do not match";
    } else if (form.newPassword && form.newPassword !== form.confirmPassword) {
      e.confirmPassword = "Passwords do not match";
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = () => { if (validate()) { onSave(form); onClose(); } };

  const handleFileDrop = (e: React.DragEvent) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f && (f.type === "image/png" || f.type === "image/jpeg")) set("logoFile", f); };
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => set("logoFile", e.target.files?.[0] ?? null);

  // Subscription helpers
  const activeSub = form.subscriptionPlans[0] ?? null;
  const updateSub = (patch: Partial<SubPlan>) => {
    if (activeSub) {
      set("subscriptionPlans", form.subscriptionPlans.map((p) => p.id === activeSub.id ? { ...p, ...patch } : p));
    }
  };
  const addSub = () => {
    set("subscriptionPlans", [{ id: `sp-${Date.now()}`, startDate: dayjs().format("YYYY-MM-DD"), expiryDate: dayjs().add(1, "year").format("YYYY-MM-DD"), maxAccounts: 15, status: "Active" }]);
  };

  const LABEL = "block text-[11px] font-medium mb-1" as const;

  if (!open) return null;

  const openSubModal = () => {
    setSubSnapshot(JSON.parse(JSON.stringify(form.subscriptionPlans)));
    setSubModalOpen(true);
  };
  const cancelSubModal = () => {
    if (subSnapshot) set("subscriptionPlans", subSnapshot);
    setSubSnapshot(null);
    setSubModalOpen(false);
  };
  const saveSubModal = () => {
    setSubSnapshot(null);
    setSubModalOpen(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" role="dialog" aria-modal="true" aria-label={mode === "create" ? "New Account" : "Edit Account"}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onClose} aria-hidden="true" />
      {/* Modal */}
      <div className="relative w-full max-w-lg max-h-[90vh] flex flex-col rounded-xl shadow-2xl mx-4" style={{ background: "var(--bg-surface)", border: "1px solid var(--bg-border)" }}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 shrink-0 rounded-t-xl" style={{ borderBottom: "1px solid var(--bg-border)" }}>
          <div>
            <h2 className="text-[16px] font-semibold" style={{ color: "var(--text-primary)" }}>{mode === "create" ? "Add Customer Account" : "Edit Account"}</h2>
            {mode === "edit" && <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>{form.customerName}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="p-1.5 rounded-md border-none cursor-pointer bg-transparent" style={{ color: "var(--text-muted)" }}>
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* ── ACCOUNT INFO ── */}
          <div>
            <h3 className="text-[11px] font-bold uppercase tracking-wider mb-3" style={{ color: "var(--text-muted)" }}>Account Information</h3>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div><label className={LABEL} style={{ color: "var(--text-secondary)" }}>Customer Code</label><input type="text" value={form.customerCode} disabled className="input opacity-60 cursor-not-allowed" /></div>
              <div><label className={LABEL} style={{ color: "var(--text-secondary)" }}>User Role</label><input type="text" value="Customer Administrator" disabled className="input opacity-60 cursor-not-allowed" /></div>
            </div>
            <div className="mb-3"><label className={LABEL} style={{ color: "var(--text-secondary)" }}>Customer Name <span style={{ color: "var(--danger)" }}>*</span></label><input type="text" value={form.customerName} onChange={(e) => set("customerName", e.target.value)} placeholder="Enter customer name" className="input" />{errors.customerName && <p className="text-[11px] mt-1" style={{ color: "var(--danger)" }}>{errors.customerName}</p>}</div>
            <div className="mb-3"><label className={LABEL} style={{ color: "var(--text-secondary)" }}>Username <span style={{ color: "var(--danger)" }}>*</span></label><input type="text" value={form.username} onChange={(e) => set("username", e.target.value)} placeholder="Enter username" className="input" />{errors.username && <p className="text-[11px] mt-1" style={{ color: "var(--danger)" }}>{errors.username}</p>}</div>
            <div className="mb-3"><label className={LABEL} style={{ color: "var(--text-secondary)" }}>Email <span style={{ color: "var(--danger)" }}>*</span></label><input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="Enter email address" className="input" />{errors.email && <p className="text-[11px] mt-1" style={{ color: "var(--danger)" }}>{errors.email}</p>}</div>
            <div><label className={LABEL} style={{ color: "var(--text-secondary)" }}>Upload Logo</label>
              <div onDragOver={(e) => e.preventDefault()} onDrop={handleFileDrop} onClick={() => fileRef.current?.click()} className="flex flex-col items-center justify-center gap-1.5 py-5 rounded-xl cursor-pointer" style={{ border: "2px dashed var(--bg-border)", background: "var(--bg-elevated)" }}>
                <Upload className="w-5 h-5" style={{ color: "var(--text-muted)" }} aria-hidden="true" /><p className="text-[11px]" style={{ color: "var(--text-secondary)" }}>Drag & drop or <span style={{ color: "var(--brand)", fontWeight: 500 }}>browse</span></p><p className="text-[10px]" style={{ color: "var(--text-muted)" }}>{form.logoFile ? form.logoFile.name : "PNG, JPG · Max 5MB"}</p>
                <input ref={fileRef} type="file" accept="image/png,image/jpeg" className="hidden" onChange={handleFileSelect} />
              </div>
            </div>
          </div>

          {/* ── SETTINGS ── */}
          <div>
            <h3 className="text-[11px] font-bold uppercase tracking-wider mb-3" style={{ color: "var(--text-muted)" }}>Settings</h3>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div><label className={LABEL} style={{ color: "var(--text-secondary)" }}>Language</label><select value={form.language} onChange={(e) => set("language", e.target.value)} className="select"><option>English, United States</option><option>English, United Kingdom</option><option>Hindi</option><option>Arabic</option></select></div>
              <div><label className={LABEL} style={{ color: "var(--text-secondary)" }}>Time Zone</label><select value={form.timezone} onChange={(e) => set("timezone", e.target.value)} className="select"><option value="Asia/Kolkata">Asia/Kolkata</option><option value="Asia/Qatar">Asia/Qatar</option><option value="America/New_York">America/New_York</option><option value="Europe/London">Europe/London</option><option value="Asia/Dubai">Asia/Dubai</option></select></div>
            </div>
            <YesNo label="Active" value={form.active} onChange={(v) => set("active", v)} />
          </div>

          {/* ── PASSWORD ── */}
          <div>
            <h3 className="text-[11px] font-bold uppercase tracking-wider mb-1" style={{ color: "var(--text-muted)" }}>Password</h3>
            {mode === "edit" && <p className="text-[10px] mb-3" style={{ color: "var(--text-muted)" }}>Leave blank to keep current password</p>}
            <div className="grid grid-cols-2 gap-3">
              <div><label className={LABEL} style={{ color: "var(--text-secondary)" }}>New Password{mode === "create" && <span style={{ color: "var(--danger)" }}> *</span>}</label><input type="password" value={form.newPassword} onChange={(e) => set("newPassword", e.target.value)} placeholder={mode === "edit" ? "••••••••" : "Enter password"} className="input" />{errors.newPassword && <p className="text-[11px] mt-1" style={{ color: "var(--danger)" }}>{errors.newPassword}</p>}</div>
              <div><label className={LABEL} style={{ color: "var(--text-secondary)" }}>Confirm{mode === "create" && <span style={{ color: "var(--danger)" }}> *</span>}</label><input type="password" value={form.confirmPassword} onChange={(e) => set("confirmPassword", e.target.value)} placeholder={mode === "edit" ? "••••••••" : "Confirm"} className="input" />{errors.confirmPassword && <p className="text-[11px] mt-1" style={{ color: "var(--danger)" }}>{errors.confirmPassword}</p>}</div>
            </div>
          </div>

          {/* ── SUBSCRIPTION (summary + modal trigger) ── */}
          <div>
            <h3 className="text-[11px] font-bold uppercase tracking-wider mb-3" style={{ color: "var(--text-muted)" }}>Subscription</h3>
            {activeSub ? (
              <div className="rounded-lg p-3 flex items-start justify-between" style={{ background: "var(--bg-elevated)", border: "1px solid var(--bg-border)" }}>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ background: activeSub.status === "Active" ? "var(--success-bg)" : "var(--danger-bg)", color: activeSub.status === "Active" ? "var(--success)" : "var(--danger)" }}>{activeSub.status}</span>
                    <span className="text-[11px]" style={{ color: "var(--text-secondary)" }}>&middot; {activeSub.maxAccounts === -1 ? "Unlimited" : activeSub.maxAccounts} accounts</span>
                  </div>
                  <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>Expires {activeSub.expiryDate ? dayjs(activeSub.expiryDate).format("MMM D, YYYY") : "\u2014"}</p>
                </div>
                <button type="button" onClick={openSubModal} className="text-[11px] font-medium border-none bg-transparent cursor-pointer shrink-0" style={{ color: "var(--brand)" }}>Edit Subscription</button>
              </div>
            ) : (
              <div className="rounded-lg p-4 flex items-center justify-between" style={{ background: "var(--warning-bg)", border: "1px solid var(--warning)" }}>
                <span className="text-[12px]" style={{ color: "var(--warning)" }}>No active subscription</span>
                <button type="button" onClick={() => { addSub(); openSubModal(); }} className="text-[11px] font-semibold border-none bg-transparent cursor-pointer" style={{ color: "var(--brand)" }}>+ Add Subscription</button>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 shrink-0 rounded-b-xl" style={{ borderTop: "1px solid var(--bg-border)" }}>
          <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
          <Button variant="primary" size="sm" icon={Save} onClick={handleSubmit}>{mode === "create" ? "Save Account" : "Save Changes"}</Button>
        </div>
      </div>

      {/* ── Subscription modal (Cancel reverts changes) ── */}
      {subModalOpen && activeSub && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center" role="dialog" aria-modal="true" aria-label="Subscription Plan">
          <div className="absolute inset-0 bg-black/50" onClick={cancelSubModal} aria-hidden="true" />
          <div className="relative w-full max-w-[420px] rounded-xl shadow-2xl mx-4" style={{ background: "var(--bg-surface)", border: "1px solid var(--bg-border)" }}>
            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid var(--bg-border)" }}>
              <h3 className="text-[14px] font-semibold" style={{ color: "var(--text-primary)" }}>Subscription Plan</h3>
              <button type="button" onClick={cancelSubModal} aria-label="Close" className="p-1 rounded border-none cursor-pointer bg-transparent" style={{ color: "var(--text-muted)" }}><X className="w-4 h-4" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div><label className={LABEL} style={{ color: "var(--text-secondary)" }}>Start date <span style={{ color: "var(--danger)" }}>*</span></label><input type="date" value={activeSub.startDate} onChange={(e) => updateSub({ startDate: e.target.value })} className="input text-[12px]" /></div>
                <div><label className={LABEL} style={{ color: "var(--text-secondary)" }}>Expiry date <span style={{ color: "var(--danger)" }}>*</span></label><input type="date" value={activeSub.expiryDate} onChange={(e) => updateSub({ expiryDate: e.target.value })} className="input text-[12px]" /></div>
              </div>
              <div><label className={LABEL} style={{ color: "var(--text-secondary)" }}>Max accounts <span style={{ color: "var(--danger)" }}>*</span></label><input type="number" min={1} value={activeSub.maxAccounts} onChange={(e) => updateSub({ maxAccounts: Number(e.target.value) })} className="input text-[12px]" /></div>
              <YesNo label="Status" value={activeSub.status === "Active"} onChange={(v) => updateSub({ status: v ? "Active" : "Inactive" })} />
            </div>
            <div className="flex justify-end gap-3 px-5 py-3" style={{ borderTop: "1px solid var(--bg-border)" }}>
              <Button variant="secondary" size="sm" onClick={cancelSubModal}>Cancel</Button>
              <Button variant="primary" size="sm" icon={Save} onClick={saveSubModal}>Save Plan</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════ */

interface CustomerAccountsPageProps {
  initialTenants?: Tenant[];
}

export function CustomerAccountsPage({ initialTenants }: CustomerAccountsPageProps = {}) {
  const dispatch = useAppDispatch();
  const tenants = useAppSelector((s) => s.auth.tenants);

  const [searchQuery, setSearchQuery] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTenant, setEditingTenant] = useState<Tenant | null>(null);
  const [deletingTenant, setDeletingTenant] = useState<Tenant | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  // Post-create subscription flow
  const [postCreateSubOpen, setPostCreateSubOpen] = useState(false);
  const [postCreateTenantId, setPostCreateTenantId] = useState<string | null>(null);
  const [postCreateSubData, setPostCreateSubData] = useState<{ startDate: string; expiryDate: string; maxAccounts: number; status: "Active" | "Inactive" }>({ startDate: dayjs().format("YYYY-MM-DD"), expiryDate: dayjs().add(1, "year").format("YYYY-MM-DD"), maxAccounts: 15, status: "Active" });
  const [savedPopup, setSavedPopup] = useState<string | null>(null);

  const router = useRouter();

  // Hydrate Redux from server-fetched tenants (provided by the async Server Component).
  // Falls back to client-side fetch only if initialTenants was not supplied.
  const initialSeeded = useRef(false);
  useEffect(() => {
    if (initialTenants && !initialSeeded.current) {
      dispatch(setTenants(initialTenants));
      initialSeeded.current = true;
      return;
    }
    if (initialSeeded.current) return;
    let cancelled = false;
    setSyncing(true);
    fetchTenants()
      .then((remote) => {
        if (cancelled) return;
        dispatch(setTenants(remote));
        setSyncError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        const msg = err?.message ?? "";
        if (msg.includes("Not authenticated")) {
          router.push("/login");
          return;
        }
        if (msg.includes("Insufficient permissions")) {
          router.push("/");
          return;
        }
        console.error("[admin] tenant sync failed", err);
        setSyncError(
          "Could not sync customers from the database. Showing local cache only.",
        );
      })
      .finally(() => { if (!cancelled) setSyncing(false); });
    return () => { cancelled = true; };
  }, [dispatch, initialTenants, router]);

  const filtered = tenants.filter(
    (t) =>
      t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.adminEmail.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const openCreate = () => {
    setEditingTenant(null);
    setModalOpen(true);
  };

  const openEdit = (tenant: Tenant) => {
    setEditingTenant(tenant);
    setModalOpen(true);
  };

  const handleSave = async (data: AccountFormData) => {
    if (editingTenant) {
      // Update existing admin user in the tenant's user list
      const updatedUsers = editingTenant.config.users.map((u) =>
        u.role === "customer_admin" || u.role === "super_admin"
          ? {
              ...u,
              name: data.customerName,
              email: data.email,
              username: data.username,
              // Only overwrite password if a new one was entered
              ...(data.newPassword ? { password: data.newPassword } : {}),
              status: data.active ? "Active" as const : "Inactive" as const,
            }
          : u,
      );
      const patch: Partial<Tenant> = {
        name: data.customerName,
        adminEmail: data.email,
        active: data.active,
        subscriptionPlans: data.subscriptionPlans.map((sp) => ({
          id: sp.id,
          startDate: sp.startDate,
          endDate: sp.expiryDate,
          maxAccounts: sp.maxAccounts,
          status: sp.status,
          createdAt: new Date().toISOString(),
        })),
        config: {
          ...editingTenant.config,
          org: {
            ...editingTenant.config.org,
            companyName: data.customerName,
            timezone: data.timezone,
          },
          users: updatedUsers,
        },
      };
      // Optimistic local update
      dispatch(updateTenant({ id: editingTenant.id, patch }));
      try {
        await updateTenantApi(editingTenant.id, patch);
      } catch (err) {
        console.error("[admin] failed to persist tenant update", err);
        setSyncError("Saved locally but failed to sync to the database.");
      }
    } else {
      const tenantId = `tenant-${Date.now()}`;
      const adminUserId = `u-ca-${Date.now()}`;
      const newTenant: Tenant = {
        id: tenantId,
        name: data.customerName,
        plan: "enterprise",
        adminEmail: data.email,
        createdAt: new Date().toISOString(),
        active: data.active,
        subscriptionPlans: data.subscriptionPlans.map((sp) => ({
          id: sp.id,
          startDate: sp.startDate,
          endDate: sp.expiryDate,
          maxAccounts: sp.maxAccounts,
          status: sp.status,
          createdAt: new Date().toISOString(),
        })),
        config: {
          org: {
            companyName: data.customerName,
            timezone: data.timezone,
            dateFormat: "DD/MM/YYYY",
            regulatoryRegion: "",
          },
          sites: [],
          users: [
            {
              id: adminUserId,
              name: data.customerName,
              email: data.email,
              username: data.username,
              password: data.newPassword,
              role: "customer_admin",
              gxpSignatory: true,
              status: "Active",
              assignedSites: [],
              allSites: true,
            },
          ],
        },
      };
      // Optimistic local insert
      dispatch(addTenant(newTenant));
      try {
        await createTenantApi(newTenant);
      } catch (err) {
        console.error("[admin] failed to persist new tenant", err);
        setSyncError("Saved locally but failed to sync to the database.");
      }

      // Auto-open subscription modal if no plan was added in the drawer
      if (data.subscriptionPlans.length === 0) {
        setPostCreateTenantId(tenantId);
        setPostCreateSubData({ startDate: dayjs().format("YYYY-MM-DD"), expiryDate: dayjs().add(1, "year").format("YYYY-MM-DD"), maxAccounts: 15, status: "Active" });
        setPostCreateSubOpen(true);
      } else {
        setSavedPopup("Account and subscription created");
      }
    }
  };

  const handleDelete = async () => {
    if (!deletingTenant) return;
    setDeleting(true);
    const id = deletingTenant.id;
    // Optimistic local removal
    dispatch(removeTenant(id));
    try {
      await deleteTenantApi(id);
      setDeletingTenant(null);
    } catch (err) {
      console.error("[admin] failed to delete tenant", err);
      setSyncError("Removed locally but failed to delete from the database.");
      setDeletingTenant(null);
    } finally {
      setDeleting(false);
    }
  };

  const getFormData = (): AccountFormData => {
    if (!editingTenant) return { ...makeEmptyForm(), customerCode: nextCustomerCode("New Customer", tenants) };
    const admin = editingTenant.config.users.find(
      (u) => u.role === "customer_admin" || u.role === "super_admin",
    );
    return {
      customerCode: editingTenant.id.replace("tenant-", "GP_"),
      customerName: editingTenant.name,
      username: admin?.username ?? admin?.email?.split("@")[0] ?? "",
      email: editingTenant.adminEmail,
      language: "English, United States",
      timezone: editingTenant.config.org.timezone,
      active: editingTenant.active,
      newPassword: "",
      confirmPassword: "",
      subscriptionPlans: (editingTenant.subscriptionPlans ?? []).map((sp) => ({
        id: sp.id,
        startDate: sp.startDate,
        expiryDate: sp.endDate,
        maxAccounts: sp.maxAccounts,
        status: sp.status,
      })),
      logoFile: null,
    };
  };

  return (
    <div className="w-full max-w-[1200px] mx-auto">
      {/* Page header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-[22px] font-bold" style={{ color: "var(--text-primary)" }}>
            Customer Accounts
          </h1>
          <p className="text-[13px] mt-1" style={{ color: "var(--text-secondary)" }}>
            Manage customer organizations and their admin accounts
          </p>
        </div>
        <Button variant="primary" icon={Plus} onClick={openCreate}>
          New Account
        </Button>
      </div>

      {/* Sync status banner */}
      {syncing && (
        <div
          role="status"
          className="mb-4 px-3 py-2 rounded-lg text-[12px]"
          style={{ background: "var(--brand-muted)", color: "var(--brand)", border: "1px solid var(--brand-border)" }}
        >
          Syncing customers from database…
        </div>
      )}
      {syncError && (
        <div
          role="alert"
          className="mb-4 px-3 py-2 rounded-lg text-[12px]"
          style={{ background: "var(--warning-bg)", color: "var(--warning)", border: "1px solid var(--warning)" }}
        >
          {syncError}
        </div>
      )}

      {/* Search */}
      <div className="mb-4 max-w-sm">
        <div className="relative">
          <Search
            className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
            style={{ color: "var(--text-muted)" }}
            aria-hidden="true"
          />
          <input
            type="search"
            placeholder="Search organizations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg py-2 pl-9 pr-3 text-[13px] outline-none transition-all"
            style={{
              background: "var(--bg-surface)",
              border: "1px solid var(--bg-border)",
              color: "var(--text-primary)",
            }}
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 border-none bg-transparent cursor-pointer"
              style={{ color: "var(--text-muted)" }}
              aria-label="Clear search"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: "Total Organizations", value: tenants.length, icon: Building2, color: "var(--brand)" },
          { label: "Total Users", value: tenants.reduce((sum, t) => sum + t.config.users.length, 0), icon: Users, color: "var(--success)" },
          { label: "Total Sites", value: tenants.reduce((sum, t) => sum + t.config.sites.length, 0), icon: MapPin, color: "var(--warning)" },
        ].map((stat) => (
          <div key={stat.label} className="stat-card flex items-center gap-4">
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
              style={{ background: stat.color + "15" }}
            >
              <stat.icon className="w-5 h-5" style={{ color: stat.color }} aria-hidden="true" />
            </div>
            <div>
              <p className="stat-label">{stat.label}</p>
              <p className="text-[24px] font-bold" style={{ color: "var(--card-text)" }}>{stat.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">Organizations</span>
          <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
            {filtered.length} of {tenants.length}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="data-table" aria-label="Customer accounts">
            <thead>
              <tr>
                <th scope="col">Organization</th>
                <th scope="col">Plan</th>
                <th scope="col">Users / Sites</th>
                <th scope="col">Status</th>
                <th scope="col">Created</th>
                <th scope="col"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((tenant) => {
                const effective = isTenantEffectivelyActive(tenant);
                const reason = getInactiveReason(tenant);
                const activeSub = (tenant.subscriptionPlans ?? []).find((p) => (p.status ?? "").toLowerCase() === "active");
                const expiry = activeSub ? ((activeSub as Record<string, unknown>).expiryDate ?? activeSub.endDate) as string | undefined : undefined;
                const initial = tenant.name.charAt(0).toUpperCase();
                return (
                  <tr key={tenant.id}>
                    {/* Organization */}
                    <td>
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 text-[14px] font-bold" style={{ background: "var(--brand-muted)", color: "var(--brand)" }}>{initial}</div>
                        <div className="min-w-0">
                          <Link href={`/admin/customer/${tenant.id}`} className="text-[13px] font-semibold hover:underline block truncate" style={{ color: "var(--text-primary)" }}>{tenant.name}</Link>
                          <p className="text-[11px] font-mono truncate" style={{ color: "var(--text-muted)" }}>{tenant.adminEmail}</p>
                        </div>
                      </div>
                    </td>
                    {/* Plan */}
                    <td>
                      <div className="text-[12px]">
                        <p className="font-medium capitalize" style={{ color: "var(--text-primary)" }}>{tenant.plan}</p>
                        {activeSub ? (
                          <>
                            <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>{activeSub.maxAccounts === -1 ? "Unlimited" : `${activeSub.maxAccounts} accounts`}</p>
                            {expiry && <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>Expires {dayjs(expiry).format("MMM D, YYYY")}</p>}
                          </>
                        ) : (
                          <p className="text-[10px]" style={{ color: "var(--danger)" }}>No plan</p>
                        )}
                      </div>
                    </td>
                    {/* Users / Sites */}
                    <td>
                      <span className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
                        {tenant.config.users.length} users &middot; {tenant.config.sites.length} sites
                      </span>
                    </td>
                    {/* Status */}
                    <td>
                      <Badge variant={effective ? "green" : "red"}>{effective ? "Active" : "Inactive"}</Badge>
                      {!effective && reason && (
                        <span className="block text-[10px] mt-0.5 max-w-[120px] truncate" style={{ color: "var(--text-muted)" }} title={reason}>
                          {reason.includes("expired") ? "Subscription expired" : reason.includes("deactivated") ? "Deactivated" : "No subscription"}
                        </span>
                      )}
                    </td>
                    {/* Created */}
                    <td>
                      <span className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
                        {dayjs(tenant.createdAt).format("MMM D, YYYY")}
                      </span>
                    </td>
                    {/* Actions */}
                    <td>
                      <div className="flex items-center gap-1">
                        <Link href={`/admin/customer/${tenant.id}`}>
                          <Button variant="ghost" size="xs" aria-label={`View ${tenant.name}`}>View</Button>
                        </Link>
                        <Button variant="ghost" size="xs" icon={Pencil} onClick={() => openEdit(tenant)} aria-label={`Edit ${tenant.name}`} />
                        <button
                          type="button"
                          onClick={() => setDeletingTenant(tenant)}
                          aria-label={`Delete ${tenant.name}`}
                          className="p-1.5 rounded border-none cursor-pointer transition-colors"
                          style={{ background: "transparent", color: "var(--danger)" }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = "var(--danger-bg)"; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                        >
                          <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center py-10">
                    <Building2 className="w-10 h-10 mx-auto mb-3" style={{ color: "var(--text-muted)" }} aria-hidden="true" />
                    <p className="text-[13px] font-medium mb-1" style={{ color: "var(--text-primary)" }}>
                      {searchQuery ? "No organizations match your search" : "No customer accounts yet"}
                    </p>
                    <p className="text-[12px] mb-3" style={{ color: "var(--text-muted)" }}>
                      {searchQuery ? "Try a different search term." : "Add your first customer to get started."}
                    </p>
                    {!searchQuery && <Button variant="primary" size="sm" icon={Plus} onClick={openCreate}>Add Customer</Button>}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Account modal */}
      <AccountDrawer
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditingTenant(null);
        }}
        onSave={handleSave}
        initial={getFormData()}
        mode={editingTenant ? "edit" : "create"}
      />

      {/* Delete confirmation modal */}
      {deletingTenant && (
        <Modal
          open
          onClose={() => !deleting && setDeletingTenant(null)}
          title="Delete Customer Account"
        >
          <div className="space-y-4">
            <div
              className="flex items-start gap-3 p-3 rounded-lg"
              style={{ background: "var(--danger-bg)", border: "1px solid var(--danger)" }}
            >
              <Trash2 className="w-5 h-5 shrink-0 mt-0.5" style={{ color: "var(--danger)" }} aria-hidden="true" />
              <div>
                <p className="text-[13px] font-semibold" style={{ color: "var(--danger)" }}>
                  This action cannot be undone
                </p>
                <p className="text-[12px] mt-1" style={{ color: "var(--text-secondary)" }}>
                  All sites, users, and subscription plans for this account will be permanently deleted from the database.
                </p>
              </div>
            </div>

            <div>
              <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
                You are about to delete:
              </p>
              <p className="text-[15px] font-semibold mt-1" style={{ color: "var(--text-primary)" }}>
                {deletingTenant.name}
              </p>
              <p className="text-[12px] font-mono mt-0.5" style={{ color: "var(--text-muted)" }}>
                {deletingTenant.adminEmail}
              </p>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setDeletingTenant(null)}
                disabled={deleting}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="danger"
                size="sm"
                icon={Trash2}
                onClick={handleDelete}
                loading={deleting}
              >
                Delete Permanently
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Post-create subscription modal */}
      {postCreateSubOpen && postCreateTenantId && (
        <Modal
          open
          onClose={() => { setPostCreateSubOpen(false); setPostCreateTenantId(null); setSavedPopup("Account created (no subscription)"); }}
          title="Add Subscription Plan"
        >
          <p className="text-[12px] mb-4" style={{ color: "var(--text-secondary)" }}>
            Set up a subscription so users can log in.
          </p>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Start date <span style={{ color: "var(--danger)" }}>*</span></label>
                <input type="date" value={postCreateSubData.startDate} onChange={(e) => setPostCreateSubData((p) => ({ ...p, startDate: e.target.value }))} className="input text-[12px]" />
              </div>
              <div>
                <label className="block text-[11px] font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Expiry date <span style={{ color: "var(--danger)" }}>*</span></label>
                <input type="date" value={postCreateSubData.expiryDate} onChange={(e) => setPostCreateSubData((p) => ({ ...p, expiryDate: e.target.value }))} className="input text-[12px]" />
              </div>
            </div>
            <div>
              <label className="block text-[11px] font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Max accounts <span style={{ color: "var(--danger)" }}>*</span></label>
              <input type="number" min={1} value={postCreateSubData.maxAccounts} onChange={(e) => setPostCreateSubData((p) => ({ ...p, maxAccounts: Number(e.target.value) }))} className="input text-[12px]" />
            </div>
            <YesNo label="Status" value={postCreateSubData.status === "Active"} onChange={(v) => setPostCreateSubData((p) => ({ ...p, status: v ? "Active" : "Inactive" }))} />
          </div>
          <div className="flex items-center justify-between mt-4 pt-3" style={{ borderTop: "1px solid var(--bg-border)" }}>
            <button
              type="button"
              onClick={() => { setPostCreateSubOpen(false); setPostCreateTenantId(null); setSavedPopup("Account created \u2014 no subscription added"); }}
              className="text-[11px] font-medium border-none bg-transparent cursor-pointer" style={{ color: "var(--text-muted)" }}
            >
              Skip for now
            </button>
            <Button variant="primary" size="sm" icon={Save} onClick={async () => {
              const tenant = tenants.find((t) => t.id === postCreateTenantId);
              if (!tenant) return;
              const plan = { id: `sp-${Date.now()}`, startDate: postCreateSubData.startDate, endDate: postCreateSubData.expiryDate, maxAccounts: postCreateSubData.maxAccounts, status: postCreateSubData.status, createdAt: new Date().toISOString() };
              const patch: Partial<Tenant> = { subscriptionPlans: [...(tenant.subscriptionPlans ?? []), plan] };
              dispatch(updateTenant({ id: postCreateTenantId, patch }));
              try { await updateTenantApi(postCreateTenantId, patch); } catch { setSyncError("Saved locally but failed to sync."); }
              setPostCreateSubOpen(false);
              setPostCreateTenantId(null);
              setSavedPopup("Account and subscription created");
            }}>Save Plan</Button>
          </div>
        </Modal>
      )}

      {/* Success toast */}
      {savedPopup && (
        <div
          role="status"
          className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg"
          style={{ background: "var(--success-bg)", border: "1px solid var(--success)", color: "var(--success)" }}
        >
          <span className="text-[13px] font-semibold">{savedPopup}</span>
          <button type="button" onClick={() => setSavedPopup(null)} className="ml-2 border-none bg-transparent cursor-pointer" style={{ color: "var(--success)" }} aria-label="Dismiss"><X className="w-4 h-4" /></button>
        </div>
      )}
    </div>
  );
}
