export function installNativeDialogFocusRecovery() {
  const originalConfirm = window.confirm.bind(window);
  const originalAlert = window.alert.bind(window);

  function recoverFocus() {
    window.setTimeout(() => {
      window.focus();
      if (!(document.activeElement instanceof HTMLInputElement) && !(document.activeElement instanceof HTMLTextAreaElement)) {
        document.body?.focus({ preventScroll: true });
      }
    }, 0);
  }

  window.confirm = (message) => {
    try {
      return originalConfirm(message);
    } finally {
      recoverFocus();
    }
  };

  window.alert = (message) => {
    try {
      return originalAlert(message);
    } finally {
      recoverFocus();
    }
  };
}
