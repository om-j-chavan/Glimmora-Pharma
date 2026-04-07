import { useNavigate } from "react-router";
import { Popup } from "@/components/ui/Popup";

interface NoSitesPopupProps {
  isOpen: boolean;
  onClose: () => void;
  feature?: string;
}

export function NoSitesPopup({
  isOpen,
  onClose,
  feature = "this feature",
}: NoSitesPopupProps) {
  const navigate = useNavigate();

  return (
    <Popup
      isOpen={isOpen}
      variant="warning"
      title="No sites configured"
      description={`Add at least one site in Settings before using ${feature}. Sites help track compliance by location.`}
      onDismiss={onClose}
      actions={[
        {
          label: "Go to Settings",
          style: "primary",
          onClick: () => {
            onClose();
            navigate("/settings");
          },
        },
        {
          label: "Cancel",
          style: "ghost",
          onClick: onClose,
        },
      ]}
    />
  );
}
