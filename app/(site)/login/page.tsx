import type { Metadata } from "next";
import LoginForm from "./login-form";
import { SITE_NAME } from "../../../lib/site";

export const metadata: Metadata = {
  title: { absolute: `Log in or sign up | ${SITE_NAME}` },
  description: "Sign in to Philly on the Block with a one-time email link to see your orders and rewards.",
  alternates: { canonical: "/login" },
  robots: { index: false, follow: true },
};

export default function LoginPage() {
  return (
    <section className="auth-shell">
      <div className="auth-art" aria-hidden="true">
        <img src="/images/otb-mascot-left.png" alt="" width={1056} height={1400} />
      </div>
      <div className="auth-card panel">
        <p className="eyebrow">Your account</p>
        <h1 className="display-lg">Log in or sign up.</h1>
        <p className="muted">
          No password. Enter your email and we’ll send a one-time sign-in link. New here? The same link creates your
          account.
        </p>
        <LoginForm />
        <p className="field-note">
          You can always order without an account. Points follow the phone number on your orders either way.
        </p>
      </div>
    </section>
  );
}
