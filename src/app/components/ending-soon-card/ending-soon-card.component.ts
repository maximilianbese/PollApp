/**
 * @fileoverview Grid card displayed in the "Ending soon" section of the dashboard.
 */

import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from '@angular/core';
import { Survey } from '../../models/surveys.models';
import { getDaysRemaining } from '../../utils/survey.utils';

/**
 * Compact card showing a survey's title, category, and time remaining.
 * Emits a {@link selected} event when the user clicks the card.
 */
@Component({
  selector: 'app-ending-soon-card',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="ending-card" (click)="selected.emit(survey)">
      <div class="card-top">
        <span class="card-category">{{ survey.category || 'General' }}</span>
        <h4>{{ survey.title }}</h4>
        <p class="card-description">{{ survey.description }}</p>
      </div>
      <div class="card-bottom">
        <span class="badge-time" [class.urgent]="daysLabel.includes('days remaining')">
          {{ daysLabel }}
        </span>
      </div>
    </div>
  `,
})
export class EndingSoonCardComponent {
  /** Survey data to render. */
  @Input({ required: true }) survey!: Survey;

  /** Emits the clicked survey so the parent can open the detail view. */
  @Output() selected = new EventEmitter<Survey>();

  /** Human-readable countdown label derived from the survey's end date. */
  get daysLabel(): string {
    return getDaysRemaining(this.survey.end_date, this.survey.created_at);
  }
}
