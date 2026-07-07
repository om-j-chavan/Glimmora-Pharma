"use client";

import { MoreVertical, Eye, Pencil, SlidersHorizontal } from "lucide-react";
import { Dropdown, type DropdownOption } from "@/components/ui/Dropdown";
import { type Tenant } from "@/store/auth.slice";

/**
 * Per-row overflow (⋮) menu — View / Edit / Manage status. "Manage status" opens
 * a STATUS-DRIVEN chooser in the parent (Suspend/Soft-delete for an ACTIVE
 * tenant; Reactivate/Soft-delete for a SUSPENDED one). Permanent delete is never
 * here — it lives in the Restore modal. Soft-deleted tenants don't appear in the
 * main table at all. The wrapper stops click propagation so opening the menu
 * does not also trigger the row's navigation.
 */
interface AccountRowMenuProps {
  tenant: Tenant;
  onView: (tenant: Tenant) => void;
  onEdit: (tenant: Tenant) => void;
  /** Opens the status-driven manage-status chooser in the parent. */
  onSuspend: (tenant: Tenant) => void;
}

export function AccountRowMenu({ tenant, onView, onEdit, onSuspend }: AccountRowMenuProps) {
  const options: DropdownOption[] = [
    { value: "view", label: "View", icon: Eye, onClick: () => onView(tenant) },
    { value: "edit", label: "Edit", icon: Pencil, onClick: () => onEdit(tenant) },
    { value: "manage", label: "Manage status", icon: SlidersHorizontal, onClick: () => onSuspend(tenant) },
  ];

  return (
    <div onClick={(e) => e.stopPropagation()}>
      <Dropdown
        actionMode
        hideCaret
        options={options}
        width="w-auto"
        menuWidth="w-44"
        triggerLabel={
          <>
            <MoreVertical className="w-4 h-4" aria-hidden="true" />
            <span className="sr-only">Actions for {tenant.name}</span>
          </>
        }
      />
    </div>
  );
}
