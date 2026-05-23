import {
  Component,
  Input,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  OnChanges,
} from '@angular/core';
import { NgFor, NgIf } from '@angular/common';
import { Survey } from '../../models/surveys.models';
import { getQuestionTotal, getTotalVotesForSurvey, getPercentage } from '../../utils/survey.utils';

@Component({
  selector: 'app-survey-results',
  standalone: true,
  imports: [NgFor, NgIf],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    `
      .bar-fill {
        transition: width 0.6s cubic-bezier(0.4, 0, 0.2, 1);
      }
      .percentage-label {
        transition: opacity 0.3s ease;
      }
    `,
  ],
  template: `
    <div class="survey-results-side">
      <h3>Survey results <span class="live-indicator">LIVE</span></h3>

      <ng-container *ngIf="totalVotes === 0">
        <p class="no-results-text">Results will be shown here after the first vote.</p>
        <p class="no-results-subtext">There are no answers yet.</p>
      </ng-container>

      <ng-container *ngIf="totalVotes > 0">
        <div
          class="result-block"
          *ngFor="let q of survey.questions; let qIdx = index; trackBy: trackByIndex"
        >
          <h4>{{ qIdx + 1 }}. {{ q.question_text }}</h4>
          <div class="result-bars-container">
            <div class="result-bar-row" *ngFor="let opt of q.options; trackBy: trackByLetter">
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
export class SurveyResultsComponent implements OnChanges {
  @Input({ required: true }) survey!: Survey;

  readonly getPercentage = getPercentage;

  constructor(private readonly cdr: ChangeDetectorRef) {}

  ngOnChanges(): void {
    this.cdr.markForCheck();
  }

  get totalVotes(): number {
    return getTotalVotesForSurvey(this.survey);
  }

  questionTotal(questionIndex: number): number {
    return getQuestionTotal(this.survey.questions[questionIndex]);
  }

  trackByIndex(index: number): number {
    return index;
  }

  trackByLetter(_: number, opt: { letter: string }): string {
    return opt.letter;
  }
}
