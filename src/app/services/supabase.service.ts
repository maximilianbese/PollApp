/**
 * @fileoverview Angular service wrapping the Supabase client.
 * Handles fetching surveys, inserting new records, submitting votes,
 * and subscribing to real-time database changes.
 */

import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { BehaviorSubject, Observable } from 'rxjs';
import { Survey } from '../models/surveys.models';
import { environment } from '../../environments/environment';

/**
 * @internal
 * Column presence flags determined after the first successful fetch.
 * Used to conditionally build insert payloads for databases that may
 * not yet have all optional columns.
 */
interface ColumnFlags {
  hasEndDate: boolean;
  hasDescription: boolean;
  hasCategory: boolean;
}

/**
 * @internal
 * Normalised result returned by write operations.
 */
interface ServiceResult<T = unknown> {
  data: T | null;
  error: { message: string } | null;
}

/**
 * Provides reactive access to the Supabase `polls` table.
 * Exposes an observable stream of surveys and methods for
 * creating records and submitting votes.
 */
@Injectable({ providedIn: 'root' })
export class SupabaseService {
  private readonly supabase: SupabaseClient;
  private readonly _surveys = new BehaviorSubject<Survey[]>([]);

  /** Emits the latest survey list whenever the underlying data changes. */
  public readonly surveys$: Observable<Survey[]> = this._surveys.asObservable();

  private columns: ColumnFlags = {
    hasEndDate: false,
    hasDescription: false,
    hasCategory: false,
  };

  constructor() {
    this.supabase = createClient(environment.supabaseUrl, environment.supabaseKey);
    this.fetchSurveys();
    this.setupRealtime();
  }

  /**
   * Loads all surveys from the `polls` table ordered by creation date
   * (newest first) and pushes the result into {@link surveys$}.
   *
   * Also detects which optional columns exist so that subsequent inserts
   * can conditionally include them.
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

      if (data) {
        this.detectColumns(data);
        this._surveys.next(data as Survey[]);
      }
    } catch (e) {
      console.warn('Network error while loading surveys:', e);
    }
  }

  /**
   * Inserts a new survey record built by {@link buildSurveyPayload}.
   * On a column-mismatch error it falls back to a minimal payload containing
   * only `title` and `questions`.
   *
   * @param survey - Pre-built payload from `buildSurveyPayload`.
   * @returns Normalised result with `data` and `error` fields.
   */
  async addSurvey(survey: Record<string, unknown>): Promise<ServiceResult> {
    const payload = this.buildInsertPayload(survey);
    try {
      const result = await this.tryInsert(payload);
      if (!result.error) {
        await this.fetchSurveys();
        return result;
      }
      return await this.tryMinimalInsert(survey['title'] as string, survey['questions']);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Network error';
      console.warn('Network error in addSurvey:', e);
      return { data: null, error: { message } };
    }
  }

  /**
   * Persists updated vote counts for all questions of a survey.
   *
   * @param id               - Supabase row ID of the survey.
   * @param updatedQuestions - Full question array with refreshed vote counts.
   */
  async submitVote(id: number, updatedQuestions: unknown[]): Promise<void> {
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
   * Subscribes to Postgres change events on the `polls` table and triggers
   * a full re-fetch on any `INSERT`, `UPDATE`, or `DELETE` event.
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
   * Inspects the column names present in the first returned row and updates
   * {@link columns}. When the table is empty a single-row probe is performed.
   *
   * @param data - Raw rows returned from Supabase.
   */
  private detectColumns(data: Record<string, unknown>[]): void {
    if (data.length === 0) {
      this.supabase
        .from('polls')
        .select('*')
        .limit(1)
        .then(({ data: probe }) => {
          if (probe && probe.length > 0) {
            this.applyColumnFlags(Object.keys(probe[0]));
          } else {
            this.columns = { hasEndDate: true, hasDescription: true, hasCategory: true };
          }
        });
      return;
    }
    this.applyColumnFlags(Object.keys(data[0]));
  }

  /**
   * Sets {@link columns} from a list of column name strings.
   *
   * @param cols - Column names present in the database response.
   */
  private applyColumnFlags(cols: string[]): void {
    this.columns = {
      hasEndDate: cols.includes('end_date'),
      hasDescription: cols.includes('description'),
      hasCategory: cols.includes('category'),
    };
  }

  /**
   * Assembles the insert payload, including optional columns only when
   * they are confirmed to exist in the database schema.
   *
   * @param survey - Pre-built survey payload.
   * @returns Payload object for Supabase insertion.
   */
  private buildInsertPayload(survey: Record<string, unknown>): Record<string, unknown> {
    const payload: Record<string, unknown> = {
      title: survey['title'],
      questions: survey['questions'],
    };
    if (this.columns.hasDescription) payload['description'] = survey['description'] ?? '';
    if (this.columns.hasCategory) payload['category'] = survey['category'];
    if (this.columns.hasEndDate) payload['end_date'] = survey['end_date'] ?? null;
    return payload;
  }

  /**
   * Performs a Supabase insert and returns a normalised result.
   *
   * @param payload - Row data to insert.
   * @returns Normalised {@link ServiceResult}.
   */
  private async tryInsert(payload: Record<string, unknown>): Promise<ServiceResult> {
    const { data, error } = await this.supabase.from('polls').insert([payload]).select();
    return { data: data ?? null, error: error ?? null };
  }

  /**
   * Retries a failed insert using only the required `title` and `questions`
   * columns. Used as a fallback when optional columns are unavailable.
   *
   * @param title     - Survey title.
   * @param questions - Mapped question array.
   * @returns Normalised {@link ServiceResult}.
   */
  private async tryMinimalInsert(title: string, questions: unknown): Promise<ServiceResult> {
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
