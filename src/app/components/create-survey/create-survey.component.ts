import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from '@angular/core';
import { NgFor, NgIf } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NewSurveyDraft, PublishStatus } from '../../models/surveys.models';
import { SurveyBuilderService } from '../../services/survey-builder.service';

@Component({
  selector: 'app-create-survey',
  standalone: true,
  imports: [NgFor, NgIf, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './create-survey.component.html',
})
export class CreateSurveyComponent {
  @Input({ required: true }) draft!: NewSurveyDraft;
  @Input() publishStatus: PublishStatus = 'idle';
  @Input() publishError = '';

  @Output() cancelled = new EventEmitter<void>();
  @Output() published = new EventEmitter<void>();

  readonly categories: ReadonlyArray<string> = [
    'Team Activities',
    'Health & Wellness',
    'Gaming & Entertainment',
    'Education & Learning',
    'Lifestyle & Preferences',
    'Technology & Innovation',
  ];

  categoryDropdownOpen = false;

  constructor(private readonly surveyBuilder: SurveyBuilderService) {}

  get todayString(): string {
    return new Date().toISOString().split('T')[0];
  }

  get canAddQuestion(): boolean {
    return this.draft.questions.length < this.surveyBuilder.MAX_QUESTIONS;
  }

  getLetterPrefix(index: number): string {
    return this.surveyBuilder.getLetterPrefix(index);
  }

  toggleCategoryDropdown(): void {
    this.categoryDropdownOpen = !this.categoryDropdownOpen;
  }

  selectCategory(category: string): void {
    this.draft.category = category;
    this.categoryDropdownOpen = false;
  }

  addAnswerOption(questionIndex: number): void {
    this.draft.questions[questionIndex].options.push({ label: '', votes: 0 });
  }

  removeAnswerOption(questionIndex: number, optionIndex: number): void {
    if (this.draft.questions[questionIndex].options.length > 2) {
      this.draft.questions[questionIndex].options.splice(optionIndex, 1);
    }
  }

  addQuestion(): void {
    if (!this.canAddQuestion) return;
    this.draft.questions.push(this.surveyBuilder.createEmptyQuestion());
  }

  removeQuestion(questionIndex: number): void {
    this.draft.questions.splice(questionIndex, 1);
  }
}
