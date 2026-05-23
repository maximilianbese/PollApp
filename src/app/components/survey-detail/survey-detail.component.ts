import {
  Component,
  Input,
  Output,
  EventEmitter,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  OnChanges,
} from '@angular/core';
import { NgFor, NgIf } from '@angular/common';
import { Survey, SelectedOptionsMap } from '../../models/surveys.models';
import { SurveyResultsComponent } from '../survey-results/survey-results.component';
import { getDaysRemaining } from '../../utils/survey.utils';

@Component({
  selector: 'app-survey-detail',
  standalone: true,
  imports: [NgFor, NgIf, SurveyResultsComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './survey-detail.component.html',
})
export class SurveyDetailComponent implements OnChanges {
  @Input({ required: true }) survey!: Survey;
  @Input({ required: true }) selectedOptions!: SelectedOptionsMap;

  @Output() voteRegistered = new EventEmitter<{
    questionIndex: number;
    optionIndex: number;
    event: Event;
  }>();
  @Output() completed = new EventEmitter<void>();
  @Output() createClicked = new EventEmitter<void>();
  @Output() backClicked = new EventEmitter<void>();

  constructor(private readonly cdr: ChangeDetectorRef) {}

  ngOnChanges(): void {
    this.cdr.markForCheck();
  }

  get daysLabel(): string {
    return getDaysRemaining(this.survey.end_date, this.survey.created_at);
  }

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
