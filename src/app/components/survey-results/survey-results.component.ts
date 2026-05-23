/**
 * @fileoverview Live results sidebar shown alongside the survey voting form.
 */

import { Component, Input, ChangeDetectionStrategy } from '@angular/core';
import { NgFor, NgIf } from '@angular/common';
import { Survey } from '../../models/surveys.models';
import { getQuestionTotal, getTotalVotesForSurvey, getPercentage } from '../../utils/survey.utils';

/**
 * Displays live voting results as animated percentage bars for each question.
 * Shows a placeholder message when no votes have been cast yet.
 *
 * @example
 * ```html
 * <app-survey-results [survey]="selectedSurvey" />
 * ```
 */
@Component({
  selector: 'app-survey-results',
  standalone: true,
  imports: [NgFor, NgIf],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="survey-results-side">
      <h3>Survey results <span class="live-indicator">LIVE</span></h3>

      <ng-container *ngIf="totalVotes === 0">
        <p class="no-results-text">Results will be shown here after the first vote.</p>
        <p class="no-results-subtext">There are no answers yet.</p>
      </ng-container>

      <ng-container *ngIf="totalVotes > 0">
        <div class="result-block" *ngFor="let q of survey.questions; let qIdx = index">
          <h4>{{ qIdx + 1 }}. {{ q.question_text }}</h4>
          <div class="result-bars-container">
            <div class="result-bar-row" *ngFor="let opt of q.options">
              <span class="letter-label">{{ opt.letter }}</span>
              <div class="bar-wrapper">
                <div
                  class="bar-fill"
                  [style.width.%]="getPercentage(opt.votes, questionTotal(qIdx))"
                ></div>
              </div>
              <span class="percentage-label">
                {{ getPercentage(opt.votes, questionTotal(qIdx)) }}%
              </span>
            </div>
          </div>
          <p class="total-votes">Total: {{ questionTotal(qIdx) }} votes</p>
        </div>
      </ng-container>
    </div>
  `,
})
export class SurveyResultsComponent {
  /** The survey whose results are being displayed. */
  @Input({ required: true }) survey!: Survey;

  /** Exposes the percentage utility to the template. */
  readonly getPercentage = getPercentage;

  /** Total votes across all questions. */
  get totalVotes(): number {
    return getTotalVotesForSurvey(this.survey);
  }

  /**
   * Returns the total vote count for the question at the given index.
   *
   * @param questionIndex - Zero-based question index.
   * @returns Total votes cast for that question.
   */
  questionTotal(questionIndex: number): number {
    return getQuestionTotal(this.survey.questions[questionIndex]);
  }
}
