/**
 * @fileoverview Full-page detail view for casting votes on a single survey.
 */

import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from '@angular/core';
import { NgFor, NgIf } from '@angular/common';
import { Survey, SelectedOptionsMap } from '../../models/surveys.models';
import { SurveyResultsComponent } from '../survey-results/survey-results.component';
import { getDaysRemaining } from '../../utils/survey.utils';

/**
 * Displays a survey's questions as an interactive voting form alongside
 * a live results panel.
 *
 * The parent component owns all vote state mutations; this component only
 * emits events when user interactions occur.
 *
 * @example
 * ```html
 * <app-survey-detail
 *   [survey]="selectedSurvey"
 *   [selectedOptions]="selectedOptions"
 *   (voteRegistered)="registerVote($event)"
 *   (completed)="goBack()"
 *   (createClicked)="openCreateMode()"
 *   (backClicked)="goBack()"
 * />
 * ```
 */
@Component({
  selector: 'app-survey-detail',
  standalone: true,
  imports: [NgFor, NgIf, SurveyResultsComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './survey-detail.component.html',
})
export class SurveyDetailComponent {
  /** The survey to render. */
  @Input({ required: true }) survey!: Survey;

  /** Current vote selections keyed by survey ID and question index. */
  @Input({ required: true }) selectedOptions!: SelectedOptionsMap;

  /** Emits `{ questionIndex, optionIndex, event }` when the user interacts with an option. */
  @Output() voteRegistered = new EventEmitter<{
    questionIndex: number;
    optionIndex: number;
    event: Event;
  }>();

  /** Emits when the user clicks "Complete survey". */
  @Output() completed = new EventEmitter<void>();

  /** Emits when the user clicks "Create survey" in the top navigation bar. */
  @Output() createClicked = new EventEmitter<void>();

  /** Emits when the user clicks the logo to navigate back to the dashboard. */
  @Output() backClicked = new EventEmitter<void>();

  /** Human-readable countdown label for this survey's end date. */
  get daysLabel(): string {
    return getDaysRemaining(this.survey.end_date, this.survey.created_at);
  }

  /**
   * Determines whether a specific option is in the checked state.
   *
   * For single-choice questions, the stored value is the selected option index.
   * For multi-choice questions, the stored value is a map of index → boolean.
   *
   * @param questionIndex - Zero-based question index.
   * @param optionIndex   - Zero-based option index.
   * @returns `true` when the option is currently selected.
   */
  isChecked(questionIndex: number, optionIndex: number): boolean {
    const q = this.survey.questions[questionIndex];
    const surveyState = this.selectedOptions[this.survey.id];
    if (!surveyState) return false;

    const qState = surveyState[questionIndex];
    if (q.allow_multiple) {
      return typeof qState === 'object' && !!qState[optionIndex];
    }
    return qState === optionIndex;
  }
}
