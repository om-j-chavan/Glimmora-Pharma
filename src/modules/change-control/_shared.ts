import type {
  CAPAChangeControlLink as PrismaCAPALink,
  CAPA as PrismaCAPA,
  ChangeControl as PrismaChangeControl,
} from "@prisma/client";

/**
 * Shared types for the ChangeControlDetailModal split. Lives in a regular
 * module so the modal shell, tabs, modals, and the reciprocal-banner
 * component all import from one place.
 */

export type LinkedCAPA = Pick<
  PrismaCAPA,
  "id" | "reference" | "description" | "risk" | "status"
>;

export type LinkRow = PrismaCAPALink & { capa: LinkedCAPA };

export type CCDetail = PrismaChangeControl & {
  capaLinks: LinkRow[];
};

export type LinkableCAPA = LinkedCAPA;
