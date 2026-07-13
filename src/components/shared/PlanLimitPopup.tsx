import { Popup } from "@/components/ui/Popup";

interface PlanLimitPopupProps {
  isOpen: boolean;
  onClose: () => void;
  resource: string;
  /** Plan tier label, or null when no plan is assigned. */
  plan: string | null;
  limit: number;
  count?: number;
}

export function PlanLimitPopup({ isOpen, onClose, resource, plan: planArg, limit, count }: PlanLimitPopupProps) {
  const plan = planArg ?? "current";
  const desc = count !== undefined
    ? `Your ${plan} plan allows up to ${limit} ${resource}${limit !== 1 ? "s" : ""}. You currently have ${count}. Contact Pharma Glimmora to increase your limit.`
    : `Your ${plan} plan allows up to ${limit} ${resource}${limit !== 1 ? "s" : ""}. Contact Pharma Glimmora to increase your limit.`;

  return (
    <Popup
      isOpen={isOpen}
      variant="warning"
      title={`${resource.charAt(0).toUpperCase() + resource.slice(1)} limit reached \u2014 ${plan} plan`}
      description={desc}
      onDismiss={onClose}
      actions={[
        { label: "Dismiss", style: "primary", onClick: onClose },
      ]}
    />
  );
}
