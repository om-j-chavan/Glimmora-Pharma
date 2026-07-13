import { Metadata } from "next";
import { SignupPageClient } from "./SignupPageClient";

export const metadata: Metadata = {
  title: "Sign Up",
  description: "Create your Glimmora Pharma account and start your GxP compliance journey.",
};

export default function SignupPage() {
  return <SignupPageClient />;
}
