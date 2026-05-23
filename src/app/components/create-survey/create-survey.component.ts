/**
 * @fileoverview Modal dialog for creating and publishing a new survey.
 */

import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from '@angular/core';
import { NgFor, NgIf } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NewSurveyDraft, PublishStatus } from '../../models/surveys.models';
import { getLetterPrefix, createEmptyQuestion } from '../../utils/survey-builder.utils';

/**
 * Full-screen modal overlay for composing a new survey.
 * The parent is responsible for validation logic and persistence;
 * this component only handles form interactions and emits events.
 *
 * @example
 * ```html
 * <app-create-survey
 * [draft]="newSurvey"
 * [publishStatus]="status"
 * [publishError]="error"
 * (cancelled)="cancel()"
 * (published)="publish()"
 * />
 * ```
 */
@Component({
  selector: 'app-create-survey',
  standalone: true,
  imports: [NgFor, NgIf, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './create-survey.component.html',
})
export class CreateSurveyComponent {
  /** The mutable survey draft bound to the form controls. */
  @Input({ required: true }) draft!: NewSurveyDraft;

  /** Current publish-flow state used to drive error highlighting. */
  @Input() publishStatus: PublishStatus = 'idle';

  /** Error message shown when {@link publishStatus} is `"error"`. */
  @Input() publishError = '';

  /** Emits when the user cancels or clicks outside the modal. */
  @Output() cancelled = new EventEmitter<void>();

  /** Emits when the user clicks the Publish button. */
  @Output() published = new EventEmitter<void>();

  /** Available category options. */
  readonly categories: ReadonlyArray<string> = [
    'Team Activities',
    'Health & Wellness',
    'Gaming & Entertainment',
    'Education & Learning',
    'Lifestyle & Preferences',
    'Technology & Innovation',
  ];

  /** Whether the category dropdown is open. */
  categoryDropdownOpen = false;

  /** Today's date in `YYYY-MM-DD` format, used as the `min` for the date input. */
  get todayString(): string {
    return new Date().toISOString().split('T')[0];
  }

  /** Exposes the letter-prefix utility to the template. */
  readonly getLetterPrefix = getLetterPrefix;

  /**
   * Opens or closes the category dropdown.
   */
  toggleCategoryDropdown(): void {
    this.categoryDropdownOpen = !this.categoryDropdownOpen;
  }

  /**
   * Selects a category and closes the dropdown.
   *
   * @param category - The selected category label.
   */
  selectCategory(category: string): void {
    this.draft.category = category;
    this.categoryDropdownOpen = false;
  }

  /**
   * Appends a blank answer option to the specified question.
   *
   * @param questionIndex - Zero-based question index.
   */
  addAnswerOption(questionIndex: number): void {
    this.draft.questions[questionIndex].options.push({ label: '', votes: 0 });
  }

  /**
   * Removes an answer option from the specified question.
   * A minimum of two options is enforced.
   *
   * @param questionIndex - Zero-based question index.
   * @param optionIndex   - Zero-based option index to remove.
   */
  removeAnswerOption(questionIndex: number, optionIndex: number): void {
    if (this.draft.questions[questionIndex].options.length > 2) {
      this.draft.questions[questionIndex].options.splice(optionIndex, 1);
    }
  }

  /**
   * Appends a new blank question to the draft.
   */
  addQuestion(): void {
    this.draft.questions.push(createEmptyQuestion());
  }

  /**
   * Removes the question at the given index from the draft.
   *
   * @param questionIndex - Zero-based index of the question to remove.
   */
  removeQuestion(questionIndex: number): void {
    this.draft.questions.splice(questionIndex, 1);
  }
}
