import { useParams, useNavigate } from "react-router";
import { useEffect } from "react";

export function CAPADetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  useEffect(() => {
    navigate("/capa", { state: { openCapaId: id } });
  }, [id, navigate]);

  return null;
}
