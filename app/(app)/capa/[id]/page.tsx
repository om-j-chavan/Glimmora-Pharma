import { ErrorBoundary } from "@/components/errors";
import { CAPAPage } from "@/modules/capa/CAPAPage";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function CAPADetailRoute({ params }: PageProps) {
  const { id } = await params;

  return (
    <ErrorBoundary moduleName="CAPA Tracker">
      <CAPAPage openCapaId={id} />
    </ErrorBoundary>
  );
}
