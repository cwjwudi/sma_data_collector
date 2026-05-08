/** 隐藏 input 与一组 data-choice-target / data-choice-value 按钮同步 */

export function bindHiddenBackedChoiceButtons(root: ParentNode | null): void {
  if (!root) return;
  root.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>(
      "[data-choice-target][data-choice-value]",
    );
    if (!btn || btn.disabled) return;
    const targetId = btn.dataset.choiceTarget;
    const val = btn.dataset.choiceValue;
    if (!targetId || val === undefined) return;
    const hidden = document.getElementById(targetId) as HTMLInputElement | null;
    if (!hidden) return;
    if (hidden.value === val) return;
    hidden.value = val;
    syncChoiceButtonVisual(root, targetId, val);
    hidden.dispatchEvent(new Event("input", { bubbles: true }));
    hidden.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

export function syncChoiceButtonVisual(root: ParentNode, hiddenId: string, value: string): void {
  const sel = `[data-choice-target="${hiddenId}"]`;
  root.querySelectorAll<HTMLButtonElement>(sel).forEach((b) => {
    const active = b.dataset.choiceValue === value;
    b.classList.toggle("is-active", active);
    b.setAttribute("aria-pressed", active ? "true" : "false");
  });
}

export function syncAllChoiceButtonsFromHiddens(root: ParentNode | null): void {
  if (!root) return;
  const ids = new Set<string>();
  root.querySelectorAll<HTMLButtonElement>("[data-choice-target]").forEach((b) => {
    const id = b.dataset.choiceTarget;
    if (id) ids.add(id);
  });
  for (const id of ids) {
    const hidden = document.getElementById(id) as HTMLInputElement | null;
    if (!hidden) continue;
    syncChoiceButtonVisual(root, id, hidden.value);
  }
}
