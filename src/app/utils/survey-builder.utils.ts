/**
 * @file survey-builder.utils.ts
 * @description Factory functions for creating empty survey drafts and for
 * converting draft shapes into Supabase-compatible insert payloads.
 */

import { NewOptionDraft, NewQuestionDraft, NewSurveyDraft } from '../models/survey.models';

/**
 * Returns a letter prefix string for an answer option index.
 *
 * @param index - Zero-based option index.
 * @returns A string like `"A."`, `"B."`, etc.
 *
 * @example
 * getLetterPrefix(0); // → "A."
 * getLetterPrefix(2); // → "C."
 */
export function getLetterPrefix(index: number): string {
  return String.fromCharCode(65 + index) + '.';
}

/**
 * Creates a blank two-option question draft.
 *
 * @returns A new {@link NewQuestionDraft} with two empty options.
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
 * @returns A fresh {@link NewSurveyDraft} ready for the creation form.
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
 * Maps a {@link NewOptionDraft} to the Supabase option format.
 *
 * @param option - Draft option to map.
 * @param index  - Position index used to derive the letter label.
 * @returns Supabase-ready option object.
 */
function mapOption(option: NewOptionDraft, index: number) {
  return {
    letter: String.fromCharCode(65 + index),
    text: option.label,
    votes: 0,
  };
}

/**
 * Maps a {@link NewQuestionDraft} to the Supabase question format.
 *
 * @param question - Draft question to map.
 * @returns Supabase-ready question object.
 */
function mapQuestion(question: NewQuestionDraft) {
  return {
    question_text: question.questionText,
    allow_multiple: question.allowMultiple,
    options: question.options.map(mapOption),
  };
}

/**
 * Builds the insert payload sent to Supabase from a survey draft.
 *
 * @param survey - The completed draft gathered from the creation form.
 * @returns A plain object matching the `polls` table schema.
 */
export function buildSurveyPayload(survey: NewSurveyDraft) {
  return {
    title: survey.title,
    description: survey.description || '',
    category: survey.category,
    end_date: survey.endDate || null,
    questions: survey.questions.map(mapQuestion),
  };
}

/**
 * Validates a survey draft and returns the first error message found,
 * or `null` when the draft is valid.
 *
 * Rules enforced:
 * - Title must not be blank.
 * - Every question must have non-blank text.
 * - Every answer option must have non-blank text.
 *
 * @param survey - Draft to validate.
 * @returns Human-readable error string, or `null` if the draft is valid.
 */
export function validateSurveyDraft(survey: NewSurveyDraft): string | null {
  if (!survey.title.trim()) return 'Survey name is required.';

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
