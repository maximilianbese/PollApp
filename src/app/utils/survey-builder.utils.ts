/**
 * @fileoverview Factory and mapping functions used during survey creation.
 * Converts form-bound draft objects into Supabase-compatible insert payloads.
 */

import { NewOptionDraft, NewQuestionDraft, NewSurveyDraft } from '../models/surveys.models';

/**
 * Returns a letter-prefixed string for a zero-based answer option index.
 *
 * @param index - Zero-based option index.
 * @returns A string such as `"A."`, `"B."`, `"C."`, etc.
 *
 * @example
 * getLetterPrefix(0); // → "A."
 * getLetterPrefix(2); // → "C."
 */
export function getLetterPrefix(index: number): string {
  return `${String.fromCharCode(65 + index)}.`;
}

/**
 * Creates a blank two-option question draft ready for the creation form.
 *
 * @returns A new {@link NewQuestionDraft} pre-populated with two empty options.
 */
export function createEmptyQuestion(): NewQuestionDraft {
  return {
    questionText: '',
    allowMultiple: false,
    options: [
      { label: '', votes: 0 },
      { label: '', votes: 0 },
    ],
  };
}

/**
 * Creates an empty survey draft with one blank question pre-populated.
 *
 * @returns A fresh {@link NewSurveyDraft} ready for binding to the creation form.
 */
export function createEmptySurveyDraft(): NewSurveyDraft {
  return {
    title: '',
    description: '',
    endDate: '',
    category: 'Team activities',
    questions: [createEmptyQuestion()],
  };
}

/**
 * Maps a {@link NewOptionDraft} to the Supabase-compatible option format.
 *
 * @param option - Draft option from the creation form.
 * @param index  - Zero-based position index used to derive the letter label.
 * @returns Object conforming to the `SurveyOption` database schema.
 */
function mapOption(option: NewOptionDraft, index: number) {
  return {
    letter: String.fromCharCode(65 + index),
    text: option.label,
    votes: 0,
  };
}

/**
 * Maps a {@link NewQuestionDraft} to the Supabase-compatible question format.
 *
 * @param question - Draft question from the creation form.
 * @returns Object conforming to the `SurveyQuestion` database schema.
 */
function mapQuestion(question: NewQuestionDraft) {
  return {
    question_text: question.questionText,
    allow_multiple: question.allowMultiple,
    options: question.options.map(mapOption),
  };
}

/**
 * Converts a plain-date string (`YYYY-MM-DD`) produced by an HTML date input
 * into a full ISO 8601 timestamp, preserving local midnight.
 *
 * @param dateString - String in `YYYY-MM-DD` format.
 * @returns ISO timestamp string.
 */
function toIsoTimestamp(dateString: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
    const [y, m, d] = dateString.split('-').map((v) => parseInt(v, 10));
    return new Date(y, m - 1, d).toISOString();
  }
  return new Date(dateString).toISOString();
}

/**
 * Builds the insert payload sent to Supabase from a completed survey draft.
 *
 * @param survey - Validated draft gathered from the creation form.
 * @returns Plain object matching the `polls` table schema.
 */
export function buildSurveyPayload(survey: NewSurveyDraft) {
  return {
    title: survey.title,
    description: survey.description || '',
    category: survey.category,
    end_date:
      survey.endDate && survey.endDate.trim() !== '' ? toIsoTimestamp(survey.endDate) : null,
    questions: survey.questions.map(mapQuestion),
  };
}

/**
 * Validates a survey draft and returns the first error message found,
 * or `null` when the draft is valid.
 *
 * **Rules enforced:**
 * - Title must not be blank.
 * - End date, when provided, must not lie in the past.
 * - Every question must have non-blank text.
 * - Every answer option must have non-blank text.
 *
 * @param survey - Draft to validate.
 * @returns Human-readable error string, or `null` if the draft is valid.
 */
export function validateSurveyDraft(survey: NewSurveyDraft): string | null {
  if (!survey.title.trim()) return 'Survey name is required.';

  if (survey.endDate && survey.endDate.trim() !== '') {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const end = new Date(survey.endDate);
    end.setHours(0, 0, 0, 0);
    if (end < today) return 'The end date cannot be in the past.';
  }

  for (let qi = 0; qi < survey.questions.length; qi++) {
    const q = survey.questions[qi];
    if (!q.questionText.trim()) return `Question ${qi + 1} text is required.`;

    for (let oi = 0; oi < q.options.length; oi++) {
      if (!q.options[oi].label.trim()) {
        return `Question ${qi + 1}: Answer ${getLetterPrefix(oi)} text is required.`;
      }
    }
  }

  return null;
}
