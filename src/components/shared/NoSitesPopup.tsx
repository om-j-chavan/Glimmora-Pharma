import { useRouter } from "next/navigation";
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
  const router = useRouter();

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
            router.push("/settings");
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
