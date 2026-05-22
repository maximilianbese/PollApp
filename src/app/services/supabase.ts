/**
 * @file supabase.ts
 * @description Angular service that wraps the Supabase client.
 * Handles fetching surveys, inserting new ones, submitting votes and
 * subscribing to real-time database changes.
 */

import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { BehaviorSubject, Observable } from 'rxjs';
import { Survey } from '../models/surveys.models';
import { environment } from '../../environments/environment';

/** @internal Column presence flags determined after the first successful fetch. */
interface ColumnFlags {
  hasEndDate: boolean;
  hasDescription: boolean;
  hasCategory: boolean;
}

/** @internal Result shape returned by insert operations. */
interface ServiceResult<T = unknown> {
  data: T | null;
  error: { message: string } | null;
}

/**
 * Provides reactive access to the Supabase `polls` table and exposes
 * methods for creating and voting on surveys.
 */
@Injectable({
  providedIn: 'root',
})
export class SupabaseService {
  private supabase: SupabaseClient;
  private _surveys = new BehaviorSubject<Survey[]>([]);

  /** Emits the latest list of surveys whenever the database changes. */
  public surveys$: Observable<Survey[]> = this._surveys.asObservable();

  private readonly url = environment.supabaseUrl;
  private readonly key = environment.supabaseKey;

  private columns: ColumnFlags = {
    hasEndDate: false,
    hasDescription: false,
    hasCategory: false,
  };

  constructor() {
    this.supabase = createClient(this.url, this.key);
    this.fetchSurveys();
    this.setupRealtime();
  }

  /**
   * Loads all surveys from the `polls` table ordered by creation date
   * (newest first) and pushes the result into {@link surveys$}.
   *
   * Also detects which optional columns exist in the first returned row
   * so that subsequent inserts can conditionally include them.
   */
  async fetchSurveys(): Promise<void> {
    try {
      const { data, error } = await this.supabase
        .from('polls')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) {
        console.warn('Supabase fetchSurveys error:', error.message);
        return;
      }
      if (data) this.handleFetchedData(data);
    } catch (e) {
      console.warn('Network error while loading surveys:', e);
    }
  }

  /**
   * Processes a successful fetch result: detects available columns and
   * pushes the data into the reactive stream.
   *
   * @param data - Raw rows returned from the `polls` table.
   */
  private handleFetchedData(data: any[]): void {
    this.detectColumns(data);
    this._surveys.next(data as Survey[]);
  }

  /**
   * Inserts a new survey record.  Tries a full payload first; if Supabase
   * rejects it (e.g. missing columns), falls back to the minimal required
   * fields (`title` and `questions` only).
   *
   * @param survey - Raw draft object from the creation form.
   * @returns The inserted record and error state.
   */
  async addSurvey(survey: any): Promise<ServiceResult> {
    // survey is already a built payload from buildSurveyPayload()
    const payload = this.buildInsertPayload(survey, survey.questions);
    try {
      const result = await this.tryInsert(payload);
      if (!result.error) {
        await this.fetchSurveys();
        return result;
      }
      return await this.tryMinimalInsert(survey.title, survey.questions);
    } catch (e: any) {
      console.warn('Network error in addSurvey:', e);
      return { data: null, error: { message: e?.message ?? 'Network error' } };
    }
  }

  /**
   * Persists updated vote counts for all questions of a survey.
   *
   * @param id               - Supabase row ID of the survey.
   * @param updatedQuestions - Full question array with refreshed vote counts.
   */
  async submitVote(id: number, updatedQuestions: any[]): Promise<void> {
    try {
      const { error } = await this.supabase
        .from('polls')
        .update({ questions: updatedQuestions })
        .eq('id', id);
      if (error) {
        console.warn('Error submitting vote:', error.message);
        return;
      }
      await this.fetchSurveys();
    } catch (e) {
      console.warn('Network error in submitVote:', e);
    }
  }

  /**
   * Subscribes to Postgres change events on the `polls` table and
   * triggers a full re-fetch on any insert, update or delete.
   */
  private setupRealtime(): void {
    this.supabase
      .channel('polls-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'polls' }, () => {
        this.fetchSurveys();
      })
      .subscribe();
  }

  /**
   * Updates internal flags based on column names present in the first row
   * of the fetched dataset.
   *
   * @param data - Raw rows returned from Supabase.
   */
  private detectColumns(data: any[]): void {
    if (data.length === 0) {
      // Try fetching one row to detect columns even when the table is empty
      this.supabase
        .from('polls')
        .select('*')
        .limit(1)
        .then(({ data: probe }) => {
          if (probe && probe.length > 0) {
            const cols = Object.keys(probe[0]);
            this.columns = {
              hasEndDate: cols.includes('end_date'),
              hasDescription: cols.includes('description'),
              hasCategory: cols.includes('category'),
            };
          } else {
            // Assume all optional columns exist as a safe default
            this.columns = { hasEndDate: true, hasDescription: true, hasCategory: true };
          }
        });
      return;
    }
    const cols = Object.keys(data[0]);
    this.columns = {
      hasEndDate: cols.includes('end_date'),
      hasDescription: cols.includes('description'),
      hasCategory: cols.includes('category'),
    };
  }

  /**
   * Converts form question drafts into the Supabase question array format.
   *
   * @param questions - Question drafts from the form.
   * @returns Mapped array ready for database insertion.
   */
  private mapQuestionsForInsert(questions: any[]) {
    return questions.map((q: any) => ({
      question_text: q.questionText,
      allow_multiple: q.allowMultiple,
      options: q.options.map((o: any, i: number) => ({
        letter: String.fromCharCode(65 + i),
        text: o.label,
        votes: 0,
      })),
    }));
  }

  /**
   * Assembles the insert payload, conditionally including optional columns
   * only when they are known to exist in the database.
   *
   * @param survey    - Raw survey draft.
   * @param questions - Already-mapped question array.
   * @returns Payload object for Supabase insertion.
   */
  private buildInsertPayload(survey: any, questions: any[]) {
    const payload: any = { title: survey.title, questions };
    if (this.columns.hasDescription) payload.description = survey.description || '';
    if (this.columns.hasCategory) payload.category = survey.category;
    if (this.columns.hasEndDate) payload.end_date = survey.endDate || null;
    return payload;
  }

  /**
   * Performs a Supabase insert and returns a normalised result.
   *
   * @param payload - Row data to insert.
   * @returns Normalised {@link ServiceResult}.
   */
  private async tryInsert(payload: any): Promise<ServiceResult> {
    const { data, error } = await this.supabase.from('polls').insert([payload]).select();
    return { data: data ?? null, error: error ?? null };
  }

  /**
   * Retries a failed insert using only the required `title` and `questions`
   * columns.  Used as a fallback when optional columns are unavailable.
   *
   * @param title     - Survey title.
   * @param questions - Mapped question array.
   * @returns Normalised {@link ServiceResult}.
   */
  private async tryMinimalInsert(title: string, questions: any[]): Promise<ServiceResult> {
    console.warn('Retrying with minimal payload (title + questions only)…');
    const { data, error } = await this.supabase
      .from('polls')
      .insert([{ title, questions }])
      .select();
    if (error) {
      console.warn('Minimal insert also failed:', error.message);
      return { data: null, error };
    }
    await this.fetchSurveys();
    return { data, error: null };
  }
}
