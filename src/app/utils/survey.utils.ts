/**
 * @fileoverview Pure helper functions for survey filtering, date calculations,
 * and vote percentage computations. All functions are side-effect-free.
 */

import { Survey, SurveyQuestion, SurveyOption } from '../models/surveys.models';

/**
 * Determines whether a survey's voting window has closed.
 *
 * The end-of-day boundary (23:59:59.999) is used so that surveys
 * expiring "today" remain accessible for the entire calendar day.
 *
 * @param survey - The survey to evaluate.
 * @returns `true` when the end date is set and lies in the past.
 */
export function isSurveyExpired(survey: Survey): boolean {
  if (!survey.end_date) return false;
  const end = new Date(survey.end_date);
  end.setHours(23, 59, 59, 999);
  return end < new Date();
}

/**
 * Filters a list to only surveys whose voting window is still open.
 *
 * @param surveys - Full survey list.
 * @returns Surveys that have not yet expired.
 */
export function getActiveSurveys(surveys: Survey[]): Survey[] {
  return surveys
    .filter((s) => !isSurveyExpired(s))
    .sort((a, b) => {
      const aEnd = a.end_date ? new Date(a.end_date).getTime() : Number.POSITIVE_INFINITY;
      const bEnd = b.end_date ? new Date(b.end_date).getTime() : Number.POSITIVE_INFINITY;
      if (aEnd === bEnd) {
        return new Date(a.created_at ?? 0).getTime() - new Date(b.created_at ?? 0).getTime();
      }
      return aEnd - bEnd;
    });
}

/**
 * Filters a list to only surveys whose voting window has closed.
 *
 * @param surveys - Full survey list.
 * @returns Surveys that have expired.
 */
export function getPastSurveys(surveys: Survey[]): Survey[] {
  return surveys.filter((s) => isSurveyExpired(s));
}

/**
 * Returns up to three active surveys sorted by their end date ascending
 * (soonest deadline first). Surveys without an end date are excluded.
 *
 * @param surveys - Full survey list.
 * @returns Up to 3 surveys ending soonest.
 */
export function getEndingSoonSurveys(surveys: Survey[]): Survey[] {
  return surveys
    .filter((s) => s.end_date && !isSurveyExpired(s))
    .sort((a, b) => new Date(a.end_date!).getTime() - new Date(b.end_date!).getTime())
    .slice(0, 3);
}

/** @internal Number of days a survey without an explicit end date is assumed to be active. */
const DEFAULT_LIFETIME_DAYS = 30;

/**
 * Parses a plain `YYYY-MM-DD` string into a local {@link Date} without
 * introducing timezone offset artefacts.
 *
 * @param s - Date string in `YYYY-MM-DD` format.
 * @returns Corresponding local-time `Date`.
 */
function parseLocalDate(s: string): Date {
  const [y, m, d] = s.split('-').map((v) => parseInt(v, 10));
  return new Date(y, m - 1, d);
}

/**
 * Produces a human-readable countdown string for a survey's end date.
 *
 * @param endDate   - ISO date string, `YYYY-MM-DD` string, `Date` object, or nullish.
 * @param createdAt - ISO timestamp of survey creation; used as fallback when `endDate` is absent.
 * @returns Localised label such as `"3 days remaining"`, `"Ends today"`, or `"Expired"`.
 */
export function getDaysRemaining(
  endDate: string | Date | undefined | null,
  createdAt?: string | Date | undefined | null,
): string {
  let end: Date;

  if (endDate) {
    end =
      typeof endDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(endDate)
        ? parseLocalDate(endDate)
        : new Date(endDate as string | Date);
  } else if (createdAt) {
    end = new Date(new Date(createdAt).getTime() + DEFAULT_LIFETIME_DAYS * 86_400_000);
  } else {
    end = new Date(Date.now() + DEFAULT_LIFETIME_DAYS * 86_400_000);
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);

  const diffDays = Math.ceil((end.getTime() - today.getTime()) / 86_400_000);

  if (diffDays < 0) return 'Expired';
  if (diffDays === 0) return 'Ends today';
  if (diffDays === 1) return '1 day remaining';
  return `${diffDays} days remaining`;
}

/**
 * Sums the votes across all options of a single question.
 *
 * @param question - The question whose options are summed.
 * @returns Total vote count, or `0` when the question has no options.
 */
export function getQuestionTotal(question: SurveyQuestion): number {
  if (!question?.options) return 0;
  return question.options.reduce((sum: number, o: SurveyOption) => sum + (o.votes ?? 0), 0);
}

/**
 * Sums the votes across all questions of a survey.
 *
 * @param survey - The survey to aggregate.
 * @returns Total vote count across every question and option.
 */
export function getTotalVotesForSurvey(survey: Survey): number {
  if (!survey?.questions) return 0;
  return survey.questions.reduce((sum: number, q: SurveyQuestion) => sum + getQuestionTotal(q), 0);
}

/**
 * Computes the integer percentage of votes for a single option.
 *
 * @param votes - Votes for this specific option.
 * @param total - Total votes cast for the parent question.
 * @returns Integer between `0` and `100`, or `0` when `total` is `0`.
 */
export function getPercentage(votes: number, total: number): number {
  if (!total) return 0;
  return Math.round((votes / total) * 100);
}
