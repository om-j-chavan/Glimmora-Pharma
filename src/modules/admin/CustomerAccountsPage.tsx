import { useState, useEffect, useRef } from "react";
import { Link } from "react-router";
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
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Badge } from "@/components/ui/Badge";
import dayjs from "@/lib/dayjs";

/* ── Helpers ── */

function nextCustomerCode(existingTenants: { id: string }[]) {
  const existingCodes = new Set(existingTenants.map((t) => t.id));
  let seq = existingTenants.length + 1;
  let code = `GP_${String(seq).padStart(3, "0")}`;
  while (existingCodes.has(code)) {
    seq++;
    code = `GP_${String(seq).padStart(3, "0")}`;
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

/* ── Account Modal ── */

function AccountModal({
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
  const fileRef = useRef<HTMLInputElement>(null);

  // Only reset form when the modal transitions from closed → open, NOT on every render.
  // Re-rendering the parent (e.g. when a subscription plan is added) was wiping form state
  // because `initial` is a fresh object reference on every parent render.
  useEffect(() => {
    if (open) {
      setForm(initial);
      setErrors({});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const set = <K extends keyof AccountFormData>(key: K, value: AccountFormData[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.customerName.trim()) e.customerName = "Required";
    if (!form.username.trim()) e.username = "Required";
    if (!form.email.trim()) {
      e.email = "Required";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      e.email = "Enter a valid email address";
    }
    if (mode === "create") {
      if (!form.newPassword) e.newPassword = "Password is required";
      if (form.newPassword !== form.confirmPassword) e.confirmPassword = "Passwords do not match";
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = () => {
    if (!validate()) return;
    onSave(form);
    onClose();
  };

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && (file.type === "image/png" || file.type === "image/jpeg")) {
      set("logoFile", file);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    set("logoFile", file);
  };

  return (
    <>
      <Modal open={open && !subModalOpen} onClose={onClose} title={mode === "create" ? "New Account" : "Edit Account"} persistent>
        <div className="space-y-5 max-h-[60vh] overflow-y-auto pr-1 pb-16">
          {/* ── ACCOUNT INFORMATION ── */}
          <div>
            <h3 className="text-[12px] font-bold uppercase tracking-wider mb-3" style={{ color: "var(--text-primary)" }}>
              Account Information
            </h3>

            <div className="grid grid-cols-2 gap-4 mb-3">
              {/* Customer Code */}
              <div>
                <label className="block text-[11px] font-medium mb-1.5" style={{ color: "var(--text-secondary)" }}>Customer Code</label>
                <input
                  type="text"
                  value={form.customerCode}
                  disabled
                  className="input opacity-60 cursor-not-allowed"
                />
              </div>
              {/* User Role */}
              <div>
                <label className="block text-[11px] font-medium mb-1.5" style={{ color: "var(--text-secondary)" }}>User Role</label>
                <input
                  type="text"
                  value="CustomerAdministrator"
                  disabled
                  className="input opacity-60 cursor-not-allowed"
                />
              </div>
            </div>

            {/* Customer Name */}
            <div className="mb-3">
              <label className="block text-[11px] font-medium mb-1.5" style={{ color: "var(--text-secondary)" }}>
                Customer Name <span style={{ color: "var(--danger)" }}>*</span>
              </label>
              <input
                type="text"
                value={form.customerName}
                onChange={(e) => set("customerName", e.target.value)}
                placeholder="Enter customer name"
                className="input"
              />
              {errors.customerName && <p className="text-[11px] mt-1" style={{ color: "var(--danger)" }}>{errors.customerName}</p>}
            </div>

            {/* Username */}
            <div className="mb-3">
              <label className="block text-[11px] font-medium mb-1.5" style={{ color: "var(--text-secondary)" }}>
                Username <span style={{ color: "var(--danger)" }}>*</span>
              </label>
              <input
                type="text"
                value={form.username}
                onChange={(e) => set("username", e.target.value)}
                placeholder="Enter username"
                className="input"
              />
              {errors.username && <p className="text-[11px] mt-1" style={{ color: "var(--danger)" }}>{errors.username}</p>}
            </div>

            {/* Email */}
            <div className="mb-3">
              <label className="block text-[11px] font-medium mb-1.5" style={{ color: "var(--text-secondary)" }}>
                Email <span style={{ color: "var(--danger)" }}>*</span>
              </label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => set("email", e.target.value)}
                placeholder="Enter email address"
                className="input"
              />
              {errors.email && <p className="text-[11px] mt-1" style={{ color: "var(--danger)" }}>{errors.email}</p>}
            </div>

            {/* Upload Logo */}
            <div className="mb-3">
              <label className="block text-[11px] font-medium mb-1.5" style={{ color: "var(--text-secondary)" }}>Upload Logo</label>
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleFileDrop}
                onClick={() => fileRef.current?.click()}
                className="flex flex-col items-center justify-center gap-2 py-6 rounded-xl cursor-pointer transition-all"
                style={{
                  border: "2px dashed var(--bg-border)",
                  background: "var(--bg-elevated)",
                }}
              >
                <Upload className="w-6 h-6" style={{ color: "var(--text-muted)" }} aria-hidden="true" />
                <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
                  Drag and Drop or <span style={{ color: "var(--brand)", fontWeight: 500 }}>Click to upload</span>
                </p>
                <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                  {form.logoFile ? form.logoFile.name : "Supported formats: PNG, JPG. Max Size: 5MB"}
                </p>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/png,image/jpeg"
                  className="hidden"
                  onChange={handleFileSelect}
                />
              </div>
            </div>
          </div>

          {/* ── SETTINGS ── */}
          <div>
            <h3 className="text-[12px] font-bold uppercase tracking-wider mb-3" style={{ color: "var(--text-primary)" }}>
              Settings
            </h3>

            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-[11px] font-medium mb-1.5" style={{ color: "var(--text-secondary)" }}>Language</label>
                <select
                  value={form.language}
                  onChange={(e) => set("language", e.target.value)}
                  className="select"
                >
                  <option>English, United States</option>
                  <option>English, United Kingdom</option>
                  <option>Hindi</option>
                  <option>Arabic</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-medium mb-1.5" style={{ color: "var(--text-secondary)" }}>Time Zone</label>
                <select
                  value={form.timezone}
                  onChange={(e) => set("timezone", e.target.value)}
                  className="select"
                >
                  <option value="Asia/Kolkata">Asia/Kolkata</option>
                  <option value="Asia/Qatar">Asia/Qatar</option>
                  <option value="America/New_York">America/New_York</option>
                  <option value="Europe/London">Europe/London</option>
                  <option value="Asia/Dubai">Asia/Dubai</option>
                </select>
              </div>
            </div>

            <div className="flex">
              <YesNo label="Active" value={form.active} onChange={(v) => set("active", v)} />
            </div>
          </div>

          {/* ── PASSWORD ── */}
          <div>
            <h3 className="text-[12px] font-bold uppercase tracking-wider mb-3" style={{ color: "var(--text-primary)" }}>
              Password
            </h3>

            <div className="mb-3">
              <label className="block text-[11px] font-medium mb-1.5" style={{ color: "var(--text-secondary)" }}>
                New Password <span style={{ color: "var(--danger)" }}>*</span>
              </label>
              <input
                type="password"
                value={form.newPassword}
                onChange={(e) => set("newPassword", e.target.value)}
                placeholder="Enter password"
                className="input"
              />
              {errors.newPassword && <p className="text-[11px] mt-1" style={{ color: "var(--danger)" }}>{errors.newPassword}</p>}
            </div>

            <div>
              <label className="block text-[11px] font-medium mb-1.5" style={{ color: "var(--text-secondary)" }}>
                Confirm Password <span style={{ color: "var(--danger)" }}>*</span>
              </label>
              <input
                type="password"
                value={form.confirmPassword}
                onChange={(e) => set("confirmPassword", e.target.value)}
                placeholder="Confirm password"
                className="input"
              />
              {errors.confirmPassword && <p className="text-[11px] mt-1" style={{ color: "var(--danger)" }}>{errors.confirmPassword}</p>}
            </div>
          </div>
        </div>

        {/* ── Sticky Footer ── */}
        <div
          className="flex items-center justify-between px-5 py-3 -mx-5 -mb-5"
          style={{
            borderTop: "1px solid var(--bg-border)",
            background: "var(--bg-surface)",
            position: "sticky",
            bottom: -20,
            zIndex: 10,
          }}
        >
          <Button type="button" variant="secondary" size="sm" onClick={() => setSubModalOpen(true)}>
            Subscription Plan
          </Button>
          <div className="flex gap-3">
            <Button type="button" variant="primary" size="sm" icon={Save} onClick={handleSubmit}>Save</Button>
            <Button type="button" variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
          </div>
        </div>
      </Modal>

      {/* Subscription Plans nested modal */}
      <SubscriptionPlansModal
        open={subModalOpen}
        onClose={() => setSubModalOpen(false)}
        plans={form.subscriptionPlans}
        onSave={(plans) => set("subscriptionPlans", plans)}
      />
    </>
  );
}

/* ══════════════════════════════════════ */

export function CustomerAccountsPage() {
  const dispatch = useAppDispatch();
  const tenants = useAppSelector((s) => s.auth.tenants);

  const [searchQuery, setSearchQuery] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTenant, setEditingTenant] = useState<Tenant | null>(null);
  const [deletingTenant, setDeletingTenant] = useState<Tenant | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  // On mount: pull tenants from the backend so all browsers see the same data
  useEffect(() => {
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
        console.error("[admin] tenant sync failed", err);
        setSyncError(
          "Could not sync customers from the database. Showing local cache only.",
        );
      })
      .finally(() => { if (!cancelled) setSyncing(false); });
    return () => { cancelled = true; };
  }, [dispatch]);

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
        subscriptionPlans: [],
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
    if (!editingTenant) return { ...makeEmptyForm(), customerCode: nextCustomerCode(tenants) };
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
      subscriptionPlans: [],
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
          <span className="card-title">Customer Accounts</span>
          <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
            {filtered.length} of {tenants.length}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="data-table" aria-label="Customer accounts">
            <thead>
              <tr>
                <th scope="col">Customer Name</th>
                <th scope="col">Admin Email</th>
                <th scope="col">Sites</th>
                <th scope="col">Users</th>
                <th scope="col">Status</th>
                <th scope="col">Last Login</th>
                <th scope="col">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((tenant) => (
                <tr key={tenant.id}>
                  <td>
                    <Link
                      to={`/admin/customer/${tenant.id}`}
                      className="flex items-center gap-2 hover:underline"
                      style={{ color: "var(--brand)" }}
                    >
                      <Building2 className="w-4 h-4 shrink-0" style={{ color: "var(--text-muted)" }} aria-hidden="true" />
                      <span className="font-medium">{tenant.name}</span>
                    </Link>
                  </td>
                  <td>
                    <span className="text-[12px] font-mono" style={{ color: "var(--text-secondary)" }}>
                      {tenant.adminEmail}
                    </span>
                  </td>
                  <td>{tenant.config.sites.length}</td>
                  <td>{tenant.config.users.length}</td>
                  <td>
                    <Badge variant={tenant.active ? "green" : "gray"}>
                      {tenant.active ? "Active" : "Inactive"}
                    </Badge>
                  </td>
                  <td>
                    <span className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
                      {dayjs(tenant.createdAt).format("M/D/YYYY")}
                    </span>
                  </td>
                  <td>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="xs" icon={Pencil} onClick={() => openEdit(tenant)} aria-label={`Edit ${tenant.name}`}>
                        Edit
                      </Button>
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
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center py-8">
                    <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>
                      {searchQuery ? "No organizations match your search." : "No customer accounts yet."}
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Account modal */}
      <AccountModal
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
    </div>
  );
}
