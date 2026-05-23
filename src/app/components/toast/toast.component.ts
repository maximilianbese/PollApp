/**
 * @fileoverview Reusable toast / overlay notification component.
 * Displays a dismissible banner at the bottom of the viewport.
 */

import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from '@angular/core';

/**
 * Displays a transient notification banner with an optional dismiss button.
 *
 * @example
 * ```html
 * <app-toast
 *   message="Your survey is now published"
 *   [isError]="false"
 *   (dismissed)="showToast = false"
 * />
 * ```
 */
@Component({
  selector: 'app-toast',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="publish-overlay" [class.error-overlay]="isError">
      <span>{{ isError ? '⚠️' : '✓' }} {{ message }}</span>
      <button class="overlay-close" (click)="dismissed.emit()">✕</button>
    </div>
  `,
})
export class ToastComponent {
  /** Text to display inside the banner. */
  @Input({ required: true }) message!: string;

  /** When `true` the banner renders in the error colour scheme. */
  @Input() isError = false;

  /** Emits when the user clicks the dismiss button. */
  @Output() dismissed = new EventEmitter<void>();
}
