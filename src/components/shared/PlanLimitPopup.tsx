import { useNavigate } from "react-router";
import { Popup } from "@/components/ui/Popup";

interface PlanLimitPopupProps {
  isOpen: boolean;
  onClose: () => void;
  resource: string;
  plan: string;
  limit: number;
  count?: number;
}

export function PlanLimitPopup({ isOpen, onClose, resource, plan, limit, count }: PlanLimitPopupProps) {
  const navigate = useNavigate();
  const desc = count !== undefined
    ? `Your ${plan} plan allows up to ${limit} ${resource}${limit !== 1 ? "s" : ""}. You currently have ${count}. Upgrade your plan to add more.`
    : `Your ${plan} plan allows up to ${limit} ${resource}${limit !== 1 ? "s" : ""}. Upgrade to add more.`;

  return (
    <Popup
      isOpen={isOpen}
      variant="warning"
      title={`${resource.charAt(0).toUpperCase() + resource.slice(1)} limit reached \u2014 ${plan} plan`}
      description={desc}
      onDismiss={onClose}
      actions={[
        { label: "View plans", style: "primary", onClick: () => { onClose(); navigate("/subscription"); } },
        { label: "Cancel", style: "ghost", onClick: onClose },
      ]}
    />
  );
}
