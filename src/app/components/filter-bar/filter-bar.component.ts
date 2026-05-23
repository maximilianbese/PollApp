/**
 * @fileoverview Filter bar component for switching between active and past surveys.
 */

import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from '@angular/core';
import { SurveyFilter } from '../../models/surveys.models';

/**
 * Renders a tab strip for toggling between `"active"` and `"past"` survey lists.
 *
 * @example
 * ```html
 * <app-filter-bar [currentFilter]="filter" (filterChange)="filter = $event" />
 * ```
 */
@Component({
  selector: 'app-filter-bar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="filter-bar">
      <div class="tabs">
        <button [class.active]="currentFilter === 'active'" (click)="filterChange.emit('active')">
          Active surveys
        </button>
        <button [class.active]="currentFilter === 'past'" (click)="filterChange.emit('past')">
          Past surveys
        </button>
      </div>
    </div>
  `,
})
export class FilterBarComponent {
  /** Currently active filter tab. */
  @Input({ required: true }) currentFilter!: SurveyFilter;

  /** Emits the newly selected filter when the user clicks a tab. */
  @Output() filterChange = new EventEmitter<SurveyFilter>();
}
