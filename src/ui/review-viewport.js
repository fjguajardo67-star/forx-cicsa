function focusedReviewControl(root) {
  const active = root.activeElement;
  if (active?.matches?.('[data-bulk]')) return { type: 'bulk', id: active.dataset.bulk };
  if (active?.matches?.('[data-review-row]')) return { type: 'row', id: active.dataset.reviewRow };
  return null;
}

export function captureReviewViewport(root = document) {
  const queue = root.querySelector('.queue');
  const evidence = root.querySelector('.evidence-chain');
  const workspace = root.querySelector('#workspace');
  return {
    queue: queue ? { top: queue.scrollTop, left: queue.scrollLeft } : null,
    evidence: evidence ? { top: evidence.scrollTop, left: evidence.scrollLeft } : null,
    workspace: workspace ? { top: workspace.scrollTop, left: workspace.scrollLeft } : null,
    focus: focusedReviewControl(root)
  };
}

export function restoreReviewViewport(position, root = document) {
  if (!position) return;
  let focusTarget = null;
  if (position.focus?.type === 'bulk') {
    focusTarget = [...root.querySelectorAll('[data-bulk]')].find(element => element.dataset.bulk === position.focus.id);
  } else if (position.focus?.type === 'row') {
    focusTarget = [...root.querySelectorAll('[data-review-row]')].find(element => element.dataset.reviewRow === position.focus.id);
  }
  focusTarget?.focus({ preventScroll: true });

  const queue = root.querySelector('.queue');
  if (queue && position.queue) {
    queue.scrollTop = position.queue.top;
    queue.scrollLeft = position.queue.left;
  }
  const evidence = root.querySelector('.evidence-chain');
  if (evidence && position.evidence) {
    evidence.scrollTop = position.evidence.top;
    evidence.scrollLeft = position.evidence.left;
  }
  const workspace = root.querySelector('#workspace');
  if (workspace && position.workspace) {
    workspace.scrollTop = position.workspace.top;
    workspace.scrollLeft = position.workspace.left;
  }
}
