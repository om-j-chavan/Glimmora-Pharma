"use client";

import { CreditCard } from "lucide-react";
import dayjs from "@/lib/dayjs";
import { useAppSelector } from "@/hooks/useAppSelector";
import { Modal } from "@/components/ui/Modal";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "./EmptyState";
import { planLabel } from "@/lib/plans";

interface SubscriptionPlansPopupProps {
  isOpen: boolean;
  onClose: () => void;
  tenantId: string;
}

/**
 * Subscription Phase A — read-only view of the tenant's single plan.
 *
 * A tenant has exactly one plan, assigned by a super_admin in the admin
 * console. customer_admin can view it here but cannot edit it (plan/cap
 * management is a platform-admin responsibility).
 */
export function SubscriptionPlansPopup({ isOpen, onClose, tenantId }: SubscriptionPlansPopupProps) {
  const tenants = useAppSelector((s) => s.auth.tenants);
  const tenant = tenants.find((t) => t.id === tenantId);
  const plan = tenant?.plan ?? null;
  const expired = plan ? dayjs().isAfter(dayjs.utc(plan.expiryDate)) : false;

  return (
    <Modal open={isOpen} onClose={onClose} title="Subscription plan">
      {!plan ? (
        <EmptyState
          icon={CreditCard}
          title="No plan assigned"
          description="Contact Pharma Glimmora to assign a plan to this account."
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="data-table" aria-label="Subscription plan">
            <caption className="sr-only">Assigned plan for this tenant</caption>
            <tbody>
              <tr>
                <th scope="row">Plan</th>
                <td>{planLabel(plan.tier, plan.displayName)}</td>
              </tr>
              <tr>
                <th scope="row">Max users</th>
                <td>{plan.maxUsers}</td>
              </tr>
              <tr>
                <th scope="row">Max sites</th>
                <td>{plan.maxSites}</td>
              </tr>
              <tr>
                <th scope="row">Min retention</th>
                <td>{plan.minRetentionYears} year{plan.minRetentionYears !== 1 ? "s" : ""}</td>
              </tr>
              <tr>
                <th scope="row">Start date</th>
                <td>{dayjs.utc(plan.startDate).format("DD MMM YYYY")}</td>
              </tr>
              <tr>
                <th scope="row">Expiry date</th>
                <td style={{ color: expired ? "var(--danger)" : undefined }}>
                  {dayjs.utc(plan.expiryDate).format("DD MMM YYYY")}{" "}
                  {expired && <Badge variant="red">Expired</Badge>}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}
