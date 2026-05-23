/**
 * @fileoverview Domain models for the Poll App.
 * All interfaces represent data shapes flowing between the UI, local state, and Supabase.
 */

/**
 * A single answer option within a poll question.
 */
export interface SurveyOption {
  /** Display letter prefix (e.g. `"A"`, `"B"`). */
  letter: string;
  /** Visible answer text. */
  text: string;
  /** Accumulated vote count for this option. */
  votes: number;
}

/**
 * A single question belonging to a survey, including its answer options.
 */
export interface SurveyQuestion {
  /** Body text of the question. */
  question_text: string;
  /** Whether voters may select more than one answer. */
  allow_multiple: boolean;
  /** Ordered list of answer options. */
  options: SurveyOption[];
}

/**
 * A persisted survey record as returned from Supabase.
 * The `id` is prefixed with `"local-"` for optimistically saved drafts.
 */
export interface Survey {
  /** Unique identifier. */
  id: number | string;
  /** Survey headline. */
  title: string;
  /** Optional descriptive text shown below the title. */
  description?: string;
  /** Optional topic category label. */
  category?: string;
  /** ISO date string marking when voting closes (inclusive). */
  end_date?: string;
  /** ISO timestamp of record creation. */
  created_at: string;
  /** Ordered list of questions. */
  questions: SurveyQuestion[];
}

/**
 * Transient draft shape used during survey creation,
 * before being mapped to the Supabase insert payload.
 */
export interface NewSurveyDraft {
  title: string;
  description: string;
  /** Date string in `YYYY-MM-DD` format, as produced by an HTML date input. */
  endDate: string;
  category: string;
  questions: NewQuestionDraft[];
}

/**
 * Transient draft shape for a question while building a new survey.
 */
export interface NewQuestionDraft {
  questionText: string;
  allowMultiple: boolean;
  options: NewOptionDraft[];
}

/**
 * Transient draft shape for an answer option while building a new survey.
 */
export interface NewOptionDraft {
  label: string;
  votes: number;
}

/**
 * Publish-flow states used to drive UI feedback.
 *
 * - `idle`    – no action in progress
 * - `loading` – async save in progress
 * - `error`   – validation or network failure
 */
export type PublishStatus = 'idle' | 'loading' | 'error';

/**
 * Filter tab options available on the survey dashboard.
 */
export type SurveyFilter = 'active' | 'past';

/**
 * Per-survey, per-question vote tracking stored in local storage.
 * Single-choice questions store the selected option index; multi-choice
 * questions store a map of option index → checked state.
 */
export type SelectedOptionsMap = {
  [surveyId: string | number]: {
    [questionIndex: number]: number | { [optionIndex: number]: boolean };
  };
};
