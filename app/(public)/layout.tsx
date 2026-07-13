/**
 * Layout for public routes (signup, etc.)
 * No authentication required.
 */

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
