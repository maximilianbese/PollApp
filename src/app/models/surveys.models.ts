/**
 * @file survey.models.ts
 * @description Shared TypeScript interfaces for surveys, questions and answer options.
 */

/** Represents a single answer option within a question. */
export interface SurveyOption {
  /** Display letter prefix (e.g. "A", "B"). */
  letter: string;
  /** The visible answer text. */
  text: string;
  /** Accumulated vote count for this option. */
  votes: number;
}

/** Represents a single question with its answer options. */
export interface SurveyQuestion {
  /** The question body text. */
  question_text: string;
  /** Whether voters may select more than one answer. */
  allow_multiple: boolean;
  /** Ordered list of answer options. */
  options: SurveyOption[];
}

/** Represents a persisted survey record returned from Supabase. */
export interface Survey {
  /** Unique identifier – prefixed with `"local-"` for optimistically saved drafts. */
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
 * Draft shape used during survey creation before it is mapped to
 * the Supabase payload format.
 */
export interface NewSurveyDraft {
  title: string;
  description: string;
  endDate: string;
  category: string;
  questions: NewQuestionDraft[];
}

/** Draft shape of a question while building a new survey. */
export interface NewQuestionDraft {
  questionText: string;
  allowMultiple: boolean;
  options: NewOptionDraft[];
}

/** Draft shape of an answer option while building a new survey. */
export interface NewOptionDraft {
  label: string;
  votes: number;
}

/**
 * Possible publish-flow states used to drive UI feedback.
 * - `idle`    – nothing happening
 * - `loading` – async save in progress
 * - `error`   – validation or network failure
 */
export type PublishStatus = 'idle' | 'loading' | 'error';

/** Filter tab options shown on the dashboard. */
export type SurveyFilter = 'active' | 'past';
