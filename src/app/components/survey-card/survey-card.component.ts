/**
 * @fileoverview List-item card shown in the main surveys grid on the dashboard.
 */

import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from '@angular/core';
import { NgIf } from '@angular/common';
import { Survey } from '../../models/surveys.models';
import { isSurveyExpired, getDaysRemaining } from '../../utils/survey.utils';

/**
 * Dark-themed list card representing a single survey in the dashboard grid.
 * Expired surveys are visually dimmed and are not clickable.
 *
 * @example
 * ```html
 * <app-survey-card [survey]="s" (selected)="onSelect($event)" />
 * ```
 */
@Component({
  selector: 'app-survey-card',
  standalone: true,
  imports: [NgIf],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="survey-list-item" [class.expired]="expired" (click)="handleClick()">
      <div class="item-content">
        <span class="item-category">{{ survey.category || 'General' }}</span>
        <h4>{{ survey.title }}</h4>
        <p class="item-description" *ngIf="survey.description">{{ survey.description }}</p>
      </div>
      <div class="item-meta">
        <span class="badge-time" [class.badge-expired]="expired">{{ daysLabel }}</span>
        <span class="badge-closed" *ngIf="expired">Closed</span>
      </div>
    </div>
  `,
})
export class SurveyCardComponent {
  /** Survey data to render. */
  @Input({ required: true }) survey!: Survey;

  /** Emits when the user clicks an active (non-expired) card. */
  @Output() selected = new EventEmitter<Survey>();

  /** Whether the survey's voting window has passed. */
  get expired(): boolean {
    return isSurveyExpired(this.survey);
  }

  /** Human-readable countdown label derived from the survey's end date. */
  get daysLabel(): string {
    return getDaysRemaining(this.survey.end_date, this.survey.created_at);
  }

  /**
   * Emits {@link selected} only for surveys that are still open.
   */
  handleClick(): void {
    if (!this.expired) this.selected.emit(this.survey);
  }
}
