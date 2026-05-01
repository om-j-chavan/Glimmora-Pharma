"use client";

import { useState } from "react";
import { CreditCard, Plus } from "lucide-react";
import dayjs from "@/lib/dayjs";
import { useAppDispatch } from "@/hooks/useAppDispatch";
import { useAppSelector } from "@/hooks/useAppSelector";
import { addSubscriptionPlan, updateSubscriptionPlan } from "@/store/auth.slice";
import { auditLog } from "@/lib/audit";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Popup } from "@/components/ui/Popup";
import { EmptyState } from "./EmptyState";
import { AddSubscriptionPlanModal } from "./AddSubscriptionPlanModal";

interface SubscriptionPlansPopupProps {
  isOpen: boolean;
  onClose: () => void;
  tenantId: string;
}

export function SubscriptionPlansPopup({ isOpen, onClose, tenantId }: SubscriptionPlansPopupProps) {
  const dispatch = useAppDispatch();
  const tenants = useAppSelector((s) => s.auth.tenants);
  const tenant = tenants.find((t) => t.id === tenantId);
  const plans = tenant?.subscriptionPlans ?? [];

  const [addPlanOpen, setAddPlanOpen] = useState(false);
  const [planAddedPopup, setPlanAddedPopup] = useState(false);

  return (
    <Modal open={isOpen} onClose={onClose} title="Subscription plans">
      {plans.length === 0 ? (
        <EmptyState
          icon={CreditCard}
          title="No subscription plans found"
          description="Add a subscription plan to set account limits and validity."
          actionLabel="New subscription plan"
          onAction={() => setAddPlanOpen(true)}
        />
      ) : (
        <>
          <div className="overflow-x-auto mb-4">
            <table className="data-table" aria-label="Subscription plans">
              <caption className="sr-only">Subscription plans for this tenant</caption>
              <thead>
                <tr>
                  <th scope="col">Accounts</th>
                  <th scope="col">Start date</th>
                  <th scope="col">Expiry date</th>
                  <th scope="col">Status</th>
                  <th scope="col"><span className="sr-only">Action</span></th>
                </tr>
              </thead>
              <tbody>
                {plans.map((plan) => {
                  const expired = dayjs().isAfter(dayjs.utc(plan.endDate));
                  return (
                    <tr key={plan.id}>
                      <td className="text-[13px] font-semibold" style={{ color: "var(--text-primary)" }}>
                        {plan.maxAccounts === -1 ? "Unlimited" : plan.maxAccounts}
                      </td>
                      <td className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
                        {dayjs.utc(plan.startDate).format("DD-MM-YYYY")}
                      </td>
                      <td className="text-[12px]" style={{ color: expired ? "#ef4444" : "var(--text-secondary)" }}>
                        {dayjs.utc(plan.endDate).format("DD-MM-YYYY")}
                        {expired && <span className="text-[10px] text-[#ef4444] ml-1">Expired</span>}
                      </td>
                      <td>
                        <Badge variant={plan.status === "Active" ? "green" : "gray"}>{plan.status}</Badge>
                      </td>
                      <td className="text-right">
                        <Button
                          variant="ghost"
                          size="xs"
                          onClick={() => {
                            dispatch(
                              updateSubscriptionPlan({
                                tenantId,
                                planId: plan.id,
                                patch: { status: plan.status === "Active" ? "Inactive" : "Active" },
                              }),
                            );
                            auditLog({
                              action: plan.status === "Active" ? "SUBSCRIPTION_PLAN_DEACTIVATED" : "SUBSCRIPTION_PLAN_ACTIVATED",
                              module: "settings",
                              recordId: plan.id,
                            });
                          }}
                        >
                          {plan.status === "Active" ? "Deactivate" : "Activate"}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <Button variant="primary" size="sm" icon={Plus} onClick={() => setAddPlanOpen(true)}>
            New subscription plan
          </Button>
        </>
      )}

      <AddSubscriptionPlanModal
        isOpen={addPlanOpen}
        onClose={() => setAddPlanOpen(false)}
        onSave={(data) => {
          const newPlan = {
            ...data,
            id: crypto.randomUUID(),
            createdAt: dayjs().toISOString(),
          };
          dispatch(addSubscriptionPlan({ tenantId, plan: newPlan }));
          auditLog({
            action: "SUBSCRIPTION_PLAN_ADDED",
            module: "settings",
            recordId: tenantId,
            newValue: data,
          });
          setAddPlanOpen(false);
          setPlanAddedPopup(true);
        }}
      />

      <Popup
        isOpen={planAddedPopup}
        variant="success"
        title="Subscription plan added"
        description="Plan is now active. Account limits updated."
        onDismiss={() => setPlanAddedPopup(false)}
      />
    </Modal>
  );
}