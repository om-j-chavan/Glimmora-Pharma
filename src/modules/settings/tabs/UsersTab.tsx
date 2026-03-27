import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Pencil, Users, UserPlus, Save } from "lucide-react";
import { useAppDispatch } from "@/hooks/useAppDispatch";
import { useAppSelector } from "@/hooks/useAppSelector";
import { addUser, updateUser } from "@/store/settings.slice";
import type { UserConfig } from "@/store/settings.slice";
import { Popup } from "@/components/ui/Popup";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Dropdown } from "@/components/ui/Dropdown";
import { Modal } from "@/components/ui/Modal";
import { Toggle } from "@/components/ui/Toggle";

const ROLES = [
  { value: "super_admin", label: "Super Admin" },
  { value: "qa_head", label: "QA Head" },
  { value: "qc_lab_director", label: "QC/Lab Director" },
  { value: "regulatory_affairs", label: "Regulatory Affairs" },
  { value: "csv_val_lead", label: "CSV/Val Lead" },
  { value: "it_cdo", label: "IT/CDO" },
  { value: "operations_head", label: "Operations Head" },
  { value: "viewer", label: "Viewer" },
] as const;

const roleChip: Record<string, string> = {
  super_admin: "bg-(--danger-bg) text-(--danger)",
  qa_head: "bg-(--info-bg) text-(--info)",
  qc_lab_director: "bg-(--success-bg) text-(--success)",
  regulatory_affairs: "bg-pink-500/12 text-pink-400",
  csv_val_lead: "bg-(--brand-muted) text-(--brand)",
  it_cdo: "bg-teal-500/12 text-teal-400",
  operations_head: "bg-(--warning-bg) text-(--warning)",
  viewer: "bg-(--bg-elevated) text-(--text-secondary) border border-(--bg-border)",
};

const userSchema = z.object({
  name: z.string().min(2, "Name is required"),
  email: z.string().email("Valid email is required"),
  role: z.string().min(1, "Role is required"),
  gxpSignatory: z.boolean(),
  status: z.enum(["Active", "Inactive"]),
});

type UserFormValues = z.infer<typeof userSchema>;

const ROLE_OPTIONS = ROLES.map((r) => ({ value: r.value, label: r.label }));
const STATUS_OPTIONS = [
  { value: "Active", label: "Active" },
  { value: "Inactive", label: "Inactive" },
];

function UserForm({
  defaultValues,
  onSubmit,
  onCancel,
  submitLabel,
  submitIcon,
}: {
  defaultValues: UserFormValues;
  onSubmit: (data: UserFormValues) => void;
  onCancel: () => void;
  submitLabel: string;
  submitIcon: typeof Plus;
}) {
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<UserFormValues>({
    resolver: zodResolver(userSchema),
    defaultValues,
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <Input
          id="user-name"
          label="Full Name"
          required
          placeholder="e.g. Dr. Priya Sharma"
          error={errors.name?.message}
          {...register("name")}
        />
        <Input
          id="user-email"
          label="Email"
          type="email"
          required
          placeholder="priya@company.com"
          error={errors.email?.message}
          {...register("email")}
        />
        <div>
          <p className="text-[11px] font-medium text-(--text-secondary) mb-1.5">
            Role <span className="text-(--danger)" aria-hidden="true">*</span>
          </p>
          <Dropdown
            options={ROLE_OPTIONS}
            value={watch("role")}
            onChange={(v) => setValue("role", v, { shouldValidate: true })}
            placeholder="Select role"
            width="w-full"
          />
          {errors.role && (
            <p role="alert" className="text-[11px] text-(--danger) mt-1">{errors.role.message}</p>
          )}
        </div>
        <div>
          <p className="text-[11px] font-medium text-(--text-secondary) mb-1.5">Status</p>
          <Dropdown
            options={STATUS_OPTIONS}
            value={watch("status")}
            onChange={(v) => setValue("status", v as UserFormValues["status"])}
            width="w-full"
          />
        </div>
      </div>

      {/* GxP Signatory toggle */}
      <div className="py-3 border-t border-(--bg-border)">
        <Toggle
          id="form-gxp-sig"
          checked={watch("gxpSignatory")}
          onChange={(v) => setValue("gxpSignatory", v)}
          label="GxP Signatory Authority"
          description="Enables Sign & Approve buttons"
        />
      </div>

      <div className="flex justify-end gap-2 pt-3 border-t border-(--bg-border)">
        <Button variant="secondary" onClick={onCancel}>Cancel</Button>
        <Button icon={submitIcon} type="submit" loading={isSubmitting}>{submitLabel}</Button>
      </div>
    </form>
  );
}

export function UsersTab({ readOnly = false }: { readOnly?: boolean }) {
  const dispatch = useAppDispatch();
  const users = useAppSelector((s) => s.settings.users);

  const [addModal, setAddModal] = useState(false);
  const [editModal, setEditModal] = useState(false);
  const [editingUser, setEditingUser] = useState<UserConfig | null>(null);

  const [addedPopup, setAddedPopup] = useState(false);
  const [savedPopup, setSavedPopup] = useState(false);
  const [deactivatePopup, setDeactivatePopup] = useState(false);
  const [userToDeactivate, setUserToDeactivate] = useState<string | null>(null);

  const getRoleLabel = (value: string) =>
    ROLES.find((r) => r.value === value)?.label ?? value;

  const handleAdd = (data: UserFormValues) => {
    dispatch(addUser({ ...data, id: crypto.randomUUID() }));
    setAddModal(false);
    setAddedPopup(true);
  };

  const openEdit = (user: UserConfig) => {
    setEditingUser(user);
    setEditModal(true);
  };

  const handleEdit = (data: UserFormValues) => {
    if (editingUser) {
      dispatch(updateUser({ id: editingUser.id, patch: data }));
    }
    setEditModal(false);
    setEditingUser(null);
    setSavedPopup(true);
  };

  const handleStatusChange = (userId: string, value: string) => {
    if (value === "Inactive") {
      setUserToDeactivate(userId);
      setDeactivatePopup(true);
    } else {
      dispatch(updateUser({ id: userId, patch: { status: "Active" } }));
    }
  };

  return (
    <section aria-labelledby="users-heading" className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center">
          <h2 id="users-heading" className="text-[15px] font-semibold text-(--text-primary)">Users</h2>
          <span className="ml-2 text-[11px] bg-(--brand-muted) text-(--brand) px-2 py-0.5 rounded-full font-semibold">
            {users.length}
          </span>
        </div>
        {!readOnly && <Button icon={Plus} size="sm" onClick={() => setAddModal(true)}>Add user</Button>}
      </div>

      {/* Table card */}
      <div className="bg-(--card-bg) border border-(--bg-border) rounded-xl overflow-hidden">
        {users.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <Users className="w-8 h-8 text-(--bg-border)" aria-hidden="true" />
            <p className="text-[13px] text-(--card-muted)">No users configured yet</p>
            <p className="text-[12px] text-(--text-muted)">Add your first platform user above</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse table-fixed" aria-label="Configured platform users">
              <caption className="sr-only">List of users with roles, signatory status, and account status</caption>
              <colgroup>
                <col className="w-[22%]" />
                <col className="w-[18%]" />
                <col className="w-[16%]" />
                <col className="w-[18%]" />
                <col className="w-[14%]" />
                <col className="w-[12%]" />
              </colgroup>
              <thead>
                <tr className="border-b border-(--bg-border)">
                  <th scope="col" className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-(--text-muted)">Name</th>
                  <th scope="col" className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-(--text-muted)">Role</th>
                  <th scope="col" className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-(--text-muted)">GxP Signatory</th>
                  <th scope="col" className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-(--text-muted)">Status</th>
                  <th scope="col" className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-(--text-muted)">Email</th>
                  {!readOnly && <th scope="col" className="px-4 py-3 text-right"><span className="sr-only">Actions</span></th>}
                </tr>
              </thead>
              <tbody>
                {users.map((user: UserConfig, i: number) => (
                  <tr
                    key={user.id}
                    className={`hover:bg-(--bg-surface) transition-colors ${
                      i < users.length - 1 ? "border-b border-(--bg-border)" : ""
                    }`}
                  >
                    <td className="px-4 py-3 text-[12px] font-semibold text-(--text-primary) truncate">{user.name}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold ${roleChip[user.role] ?? "bg-(--bg-elevated) text-(--text-secondary)"}`}>
                        {getRoleLabel(user.role)}
                      </span>
                    </td>
                    <td className="px-4 py-3 align-middle">
                      <Toggle
                        id={`sig-${user.id}`}
                        checked={user.gxpSignatory}
                        onChange={() => dispatch(updateUser({ id: user.id, patch: { gxpSignatory: !user.gxpSignatory } }))}
                        label={`GxP Signatory for ${user.name}`}
                        disabled={readOnly}
                        hideLabel
                      />
                    </td>
                    <td className="px-4 py-3 align-middle">
                      <Dropdown
                        options={STATUS_OPTIONS}
                        value={user.status}
                        onChange={(v) => handleStatusChange(user.id, v)}
                        width="w-28"
                      />
                    </td>
                    <td className="px-4 py-3 text-[12px] text-(--text-secondary) truncate">{user.email}</td>
                    {!readOnly && (
                      <td className="px-4 py-3 text-right">
                        <Button variant="ghost" size="sm" icon={Pencil} aria-label={`Edit ${user.name}`} onClick={() => openEdit(user)} />
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add modal */}
      <Modal open={addModal} onClose={() => setAddModal(false)} title="Add New User">
        <UserForm
          defaultValues={{ name: "", email: "", role: "viewer", gxpSignatory: true, status: "Active" }}
          onSubmit={handleAdd}
          onCancel={() => setAddModal(false)}
          submitLabel="Add user"
          submitIcon={UserPlus}
        />
      </Modal>

      {/* Edit modal */}
      <Modal open={editModal} onClose={() => { setEditModal(false); setEditingUser(null); }} title="Edit User">
        {editingUser && (
          <UserForm
            key={editingUser.id}
            defaultValues={{
              name: editingUser.name,
              email: editingUser.email,
              role: editingUser.role,
              gxpSignatory: editingUser.gxpSignatory,
              status: editingUser.status,
            }}
            onSubmit={handleEdit}
            onCancel={() => { setEditModal(false); setEditingUser(null); }}
            submitLabel="Save changes"
            submitIcon={Save}
          />
        )}
      </Modal>

      {/* Popups */}
      <Popup isOpen={addedPopup} variant="success" title="User added" description="New user can now be assigned as owner in CAPAs and findings." onDismiss={() => setAddedPopup(false)} />
      <Popup isOpen={savedPopup} variant="success" title="User updated" description="Changes saved successfully." onDismiss={() => setSavedPopup(false)} />
      <Popup
        isOpen={deactivatePopup}
        variant="confirmation"
        title="Deactivate this user?"
        description="They will be removed from all owner dropdowns. Open CAPAs must be reassigned. Past records are preserved."
        onDismiss={() => { setDeactivatePopup(false); setUserToDeactivate(null); }}
        actions={[
          { label: "Cancel", style: "ghost", onClick: () => { setDeactivatePopup(false); setUserToDeactivate(null); } },
          { label: "Yes, deactivate", style: "primary", onClick: () => { if (userToDeactivate) dispatch(updateUser({ id: userToDeactivate, patch: { status: "Inactive" } })); setDeactivatePopup(false); setUserToDeactivate(null); } },
        ]}
      />
    </section>
  );
}
