/**
 * Role-aware logout confirmation copy. Kept out of the shells so the same
 * message table feeds every logout entry point (customer sidebar + admin
 * console) and the ConfirmModal receives its text via props rather than a
 * hardcoded string.
 */

/** The confirmation message shown in the logout dialog, tailored to the actor's
 *  role (Super Admin / Customer Admin / everyone else). */
export function logoutMessage(role: string): string {
  if (role === "super_admin") {
    return "You'll be signed out of the Glimmora platform console. You'll need to sign in again to manage tenants and platform settings.";
  }
  if (role === "customer_admin") {
    return "You'll be signed out of your organisation's workspace and returned to the login screen.";
  }
  return "You'll be returned to the login screen and will need to sign in again to continue.";
}
