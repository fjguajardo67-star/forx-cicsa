/* @vitest-environment jsdom */
import { beforeEach, describe, expect, test } from 'vitest';
import { captureReviewViewport, restoreReviewViewport } from '../src/ui/review-viewport.js';

function reviewMarkup() {
  return `<main id="workspace"><section class="queue"><table><tbody>
    <tr data-review-row="item-12" tabindex="0"><td><input type="checkbox" data-bulk="item-12"></td></tr>
  </tbody></table></section><aside class="evidence-chain"></aside></main>`;
}

describe('posición de la cola de revisión', () => {
  beforeEach(() => { document.body.innerHTML = reviewMarkup(); });

  test('restaura desplazamiento y foco después de volver a dibujar al marcar un checkbox', () => {
    const workspace = document.querySelector('#workspace');
    const queue = document.querySelector('.queue');
    const checkbox = document.querySelector('[data-bulk="item-12"]');
    workspace.scrollTop = 180;
    workspace.scrollLeft = 8;
    queue.scrollTop = 912;
    queue.scrollLeft = 164;
    document.querySelector('.evidence-chain').scrollTop = 275;
    checkbox.focus();

    const position = captureReviewViewport();
    document.body.innerHTML = reviewMarkup();
    restoreReviewViewport(position);

    expect(document.querySelector('.queue').scrollTop).toBe(912);
    expect(document.querySelector('.queue').scrollLeft).toBe(164);
    expect(document.querySelector('.evidence-chain').scrollTop).toBe(275);
    expect(document.querySelector('#workspace').scrollTop).toBe(180);
    expect(document.querySelector('#workspace').scrollLeft).toBe(8);
    expect(document.activeElement).toBe(document.querySelector('[data-bulk="item-12"]'));
  });

  test('conserva el foco de teclado sobre la fila seleccionada', () => {
    const row = document.querySelector('[data-review-row="item-12"]');
    document.querySelector('.queue').scrollTop = 640;
    row.focus();

    const position = captureReviewViewport();
    document.body.innerHTML = reviewMarkup();
    restoreReviewViewport(position);

    expect(document.querySelector('.queue').scrollTop).toBe(640);
    expect(document.activeElement).toBe(document.querySelector('[data-review-row="item-12"]'));
  });
});
