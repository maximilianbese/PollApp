/**
 * @file survey.utils.ts
 * @description Pure helper functions for survey filtering, date calculations and
 * vote percentage computations.  All functions are side-effect-free.
 */

import { Survey, SurveyQuestion, SurveyOption } from '../models/survey.models';

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
 * @returns Surveys that are not yet expired.
 */
export function getActiveSurveys(surveys: Survey[]): Survey[] {
  return surveys.filter((s) => !isSurveyExpired(s));
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
 * (soonest deadline first).  Surveys without an end date are excluded.
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

/**
 * Produces a human-readable countdown string for a survey's end date.
 *
 * @param endDate - ISO date string.  Pass an empty string or undefined for
 *                  surveys with no deadline.
 * @returns Localised label such as "Ends in 3 days" or "No end date".
 */
export function getDaysRemaining(endDate: string | undefined): string {
  if (!endDate) return 'No end date';
  const end = new Date(endDate);
  const diff = Math.ceil((end.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
  if (diff < 0) return 'Ended ' + end.toLocaleDateString('de-DE');
  if (diff === 0) return 'Ends today';
  if (diff === 1) return 'Ends in 1 day';
  return `Ends in ${diff} days`;
}

/**
 * Sums the votes across all options of a single question.
 *
 * @param question - The question whose options are summed.
 * @returns Total vote count, or `0` when the question has no options.
 */
export function getQuestionTotal(question: SurveyQuestion): number {
  if (!question?.options) return 0;
  return question.options.reduce((sum: number, o: SurveyOption) => sum + (o.votes || 0), 0);
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
 * @returns Value between 0 and 100 (rounded), or `0` when total is 0.
 */
export function getPercentage(votes: number, total: number): number {
  if (!total) return 0;
  return Math.round((votes / total) * 100);
}
