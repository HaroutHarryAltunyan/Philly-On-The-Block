"use client";

import { useState } from "react";
import { getInstallPrompt, isIOS } from "../../lib/install-pwa";

export default function InstallAppButton() {
  const [help, setHelp] = useState(false);

  async function install() {
    const prompt = getInstallPrompt();
    if (prompt) {
      await prompt.prompt();
      await prompt.userChoice;
      return;
    }
    setHelp(true);
  }

  return (
    <div style={{ textAlign: "center", marginTop: "0.8rem" }}>
      <button
        className="install-app-button"
        type="button"
        onClick={install}
      >
        Download the app <span>↓</span>
      </button>
      {help && (
        <small className="install-app-help" role="note">
          {isIOS()
            ? "On iPhone or iPad: open this page in Safari, tap the Share button, then “Add to Home Screen”."
            : "Open your browser menu (⋮) and choose “Install app” or “Add to Home Screen”."}
        </small>
      )}
    </div>
  );
}