/**
 * @file app.ts
 * @description Root Angular component for the Poll App.
 *
 * Responsibilities are split across focused utility files:
 * - {@link survey.models}        – TypeScript interfaces
 * - {@link survey.utils}         – Filter / date / vote helpers
 * - {@link survey-builder.utils} – Draft creation, validation, payload building
 * - {@link app.filter.ts}        – Filter-tab logic
 * - {@link app.create.ts}        – Survey creation logic
 * - {@link app.vote.ts}          – Voting logic
 *
 * This file owns only component metadata, DI wiring and Angular lifecycle.
 */

import { Component, OnInit, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Observable, BehaviorSubject } from 'rxjs';

import { SupabaseService } from './services/supabase';
import { Survey, NewSurveyDraft, PublishStatus, SurveyFilter } from './models/surveys.models';
import {
  isSurveyExpired,
  getActiveSurveys,
  getPastSurveys,
  getEndingSoonSurveys,
  getDaysRemaining,
  getQuestionTotal,
  getTotalVotesForSurvey,
  getPercentage,
} from './utils/survey.utils';
import {
  createEmptySurveyDraft,
  createEmptyQuestion,
  getLetterPrefix,
  buildSurveyPayload,
  validateSurveyDraft,
} from './utils/survey-builder.utils';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './app.html',
  styleUrls: ['./app.scss'],
  encapsulation: ViewEncapsulation.None,
})
export class AppComponent implements OnInit {
  /** Internal state store that merges Supabase surveys with local drafts. */
  private _localSurveys = new BehaviorSubject<Survey[]>([]);

  /** Public observable consumed by the template via `async` pipe. */
  surveys$!: Observable<Survey[]>;

  /** Currently open survey detail view, or `null` when on the dashboard. */
  selectedSurvey: Survey | null = null;

  /** Active tab on the dashboard survey list. */
  currentFilter: SurveyFilter = 'active';

  /** Whether the create-survey form is currently visible. */
  isCreating: boolean = false;

  /** Working draft for the survey creation form. */
  newSurvey: NewSurveyDraft = createEmptySurveyDraft();

  /** Current publish-flow status used to drive loading/error UI. */
  publishStatus: PublishStatus = 'idle';

  /** Error message displayed when {@link publishStatus} is `"error"`. */
  publishError: string = '';

  /** Whether the success toast notification is visible. */
  showToast: boolean = false;

  /** Maps question index → selected option index for single-answer questions. */
  selectedOptions: { [qi: number]: number } = {};

  /** Whether the category dropdown in the creation form is open. */
  categoryDropdownOpen: boolean = false;

  /** Available category labels shown in the creation form dropdown. */
  readonly categories: string[] = [
    'Team Activities',
    'Health & Wellness',
    'Gaming & Entertainment',
    'Education & Learning',
    'Lifestyle & Preferences',
    'Technology & Innovation',
  ];

  /** Re-exported pure helpers so the template can call them directly. */
  readonly isSurveyExpired = isSurveyExpired;
  readonly getActiveSurveys = getActiveSurveys;
  readonly getPastSurveys = getPastSurveys;
  readonly getEndingSoonSurveys = getEndingSoonSurveys;
  readonly getDaysRemaining = getDaysRemaining;
  readonly getQuestionTotal = getQuestionTotal;
  readonly getTotalVotesForSurvey = getTotalVotesForSurvey;
  readonly getPercentage = getPercentage;
  readonly getLetterPrefix = getLetterPrefix;

  /** Heutiges Datum als ISO-String (YYYY-MM-DD) für das min-Attribut des Date-Inputs. */
  get todayString(): string {
    return new Date().toISOString().split('T')[0];
  }

  constructor(private supabaseService: SupabaseService) {}

  /**
   * Wires the local BehaviorSubject to the Supabase stream, preserving any
   * optimistically-added local drafts on each remote update.
   */
  ngOnInit(): void {
    this.surveys$ = this._localSurveys.asObservable();
    this.supabaseService.surveys$.subscribe({
      next: (data: Survey[]) => this.mergeRemoteSurveys(data),
    });
  }

  /**
   * Merges freshly fetched remote surveys with local vote state.
   * Surveys that have been voted on locally keep their local vote counts,
   * so that votes are not lost when Supabase re-fetches.
   *
   * @param data - Latest survey array emitted by {@link SupabaseService.surveys$}.
   */
  private mergeRemoteSurveys(data: Survey[]): void {
    if (!Array.isArray(data)) return;
    const current = this._localSurveys.getValue();

    // Merge: für jede Remote-Survey prüfen ob es eine lokale Version mit
    // höherer Vote-Anzahl gibt → dann lokale Version bevorzugen
    const merged = data.map((remote: Survey) => {
      const local = current.find((s: Survey) => s.id === remote.id);
      if (!local) return remote;
      // Lokale Votes beibehalten wenn sie höher sind (User hat abgestimmt)
      const remoteVotes = this.countTotalVotes(remote);
      const localVotes = this.countTotalVotes(local);
      return localVotes >= remoteVotes ? local : remote;
    });

    // Rein lokale Drafts (local-*) anhängen
    const onlyLocal = current.filter(
      (s: Survey) => typeof s.id === 'string' && s.id.startsWith('local-'),
    );
    this._localSurveys.next([...merged, ...onlyLocal]);
  }

  /** Zählt alle Stimmen einer Survey zusammen (Hilfsfunktion für Merge). */
  private countTotalVotes(survey: Survey): number {
    if (!survey?.questions) return 0;
    return survey.questions.reduce((sum: number, q: any) => {
      const qVotes = (q.options ?? []).reduce((s: number, o: any) => s + (o.votes ?? 0), 0);
      return sum + qVotes;
    }, 0);
  }

  // ── FILTER ────────────────────────────────────────────────────────────────

  /**
   * Returns the survey list matching the currently selected filter tab.
   *
   * @param surveys - Full list to filter.
   * @returns Active or past surveys depending on {@link currentFilter}.
   */
  getFilteredSurveys(surveys: Survey[]): Survey[] {
    return this.currentFilter === 'past' ? getPastSurveys(surveys) : getActiveSurveys(surveys);
  }

  /**
   * Switches the active filter tab.
   *
   * @param f - The tab to activate.
   */
  setFilter(f: SurveyFilter): void {
    this.currentFilter = f;
  }

  // ── NAVIGATION ────────────────────────────────────────────────────────────

  /**
   * Opens a survey detail view.  Expired surveys are not clickable (US4).
   *
   * @param survey - Survey the user clicked.
   */
  selectSurvey(survey: Survey): void {
    if (isSurveyExpired(survey)) return;
    // Stimmen aus dem lokalen Cache laden, damit abgegebene Votes erhalten bleiben
    const cached = this._localSurveys.getValue().find((s: Survey) => s.id === survey.id);
    const source = cached ?? survey;
    this.isCreating = false;
    this.selectedSurvey = JSON.parse(JSON.stringify(source));
    this.selectedOptions = {};
  }

  /** Closes the detail view and returns to the dashboard. */
  goBack(): void {
    this.selectedSurvey = null;
    this.selectedOptions = {};
  }

  // ── CATEGORY DROPDOWN ─────────────────────────────────────────────────────

  /** Toggles the category dropdown open/closed state. */
  toggleCategoryDropdown(): void {
    this.categoryDropdownOpen = !this.categoryDropdownOpen;
  }

  /**
   * Sets the selected category on the draft and closes the dropdown.
   *
   * @param cat - Category label chosen by the user.
   */
  selectCategory(cat: string): void {
    this.newSurvey.category = cat;
    this.categoryDropdownOpen = false;
  }

  // ── CREATE SURVEY ─────────────────────────────────────────────────────────

  /** Resets the creation form and shows it. */
  openCreateMode(): void {
    this.newSurvey = createEmptySurveyDraft();
    this.isCreating = true;
    this.selectedSurvey = null;
    this.publishStatus = 'idle';
    this.publishError = '';
  }

  /** Hides the creation form without saving. */
  cancelCreation(): void {
    this.isCreating = false;
    this.publishStatus = 'idle';
  }

  /**
   * Appends a new blank answer option to a question.
   *
   * @param qi - Index of the target question.
   */
  addAnswerOption(qi: number): void {
    this.newSurvey.questions[qi].options.push({ label: '', votes: 0 });
  }

  /**
   * Removes an answer option from a question.  Requires at least 2 options
   * to remain after removal.
   *
   * @param qi - Index of the parent question.
   * @param oi - Index of the option to remove.
   */
  removeAnswerOption(qi: number, oi: number): void {
    if (this.newSurvey.questions[qi].options.length > 2) {
      this.newSurvey.questions[qi].options.splice(oi, 1);
    }
  }

  /** Appends a new blank question to the draft. */
  addNextQuestion(): void {
    this.newSurvey.questions.push(createEmptyQuestion());
  }

  /**
   * Removes a question from the draft.
   *
   * @param qi - Index of the question to remove.
   */
  removeQuestion(qi: number): void {
    this.newSurvey.questions.splice(qi, 1);
  }

  /**
   * Validates the draft, optimistically navigates back to the dashboard,
   * shows a success toast and persists the survey in the background.
   * Falls back to local-only storage if Supabase is unavailable.
   */
  publishSurvey(): void {
    const error = validateSurveyDraft(this.newSurvey);
    if (error) {
      this.publishError = error;
      this.publishStatus = 'error';
      return;
    }
    this.persistSurvey();
  }

  /**
   * Builds the payload, resets UI state and initiates the background save.
   * Extracted from {@link publishSurvey} to keep each method within the
   * 14-line limit.
   */
  private persistSurvey(): void {
    const payload = buildSurveyPayload(this.newSurvey);
    // Use the built payload (mapped to DB shape) when calling the service.
    // If persistence fails, fall back to saving the same payload locally.
    this.resetAfterPublish();
    this.supabaseService
      .addSurvey(payload)
      .then((r) => {
        if (r?.error) this.saveLocally(payload);
      })
      .catch(() => this.saveLocally(payload));
  }

  /**
   * Resets component state to the idle dashboard after a publish action and
   * schedules the success toast to auto-dismiss after 3 seconds.
   */
  private resetAfterPublish(): void {
    this.isCreating = false;
    this.selectedSurvey = null;
    this.publishStatus = 'idle';
    this.newSurvey = createEmptySurveyDraft();
    this.showToast = true;
    setTimeout(() => (this.showToast = false), 3000);
  }

  /**
   * Stores a survey payload locally when Supabase is unreachable, using a
   * temporary `"local-"` prefixed ID.
   *
   * @param payload - Built survey payload to store locally.
   */
  private saveLocally(payload: any): void {
    const local: Survey = {
      ...payload,
      id: 'local-' + Date.now(),
      created_at: new Date().toISOString(),
    };
    this._localSurveys.next([local, ...this._localSurveys.getValue()]);
  }

  // ── VOTING ────────────────────────────────────────────────────────────────

  /**
   * Handles a checkbox or radio change event and updates vote counts
   * both locally (for instant UI feedback) and in Supabase.
   *
   * @param qi    - Index of the question that received the vote.
   * @param oi    - Index of the option that was toggled.
   * @param event - The native DOM change event from the input element.
   */
  registerVote(qi: number, oi: number, event: Event): void {
    const q = this.selectedSurvey!.questions[qi];
    const checked = (event.target as HTMLInputElement).checked;
    const changed = q.allow_multiple
      ? (this.applyMultipleChoiceVote(q, oi, checked), true)
      : this.applySingleChoiceVote(q, qi, oi);
    if (!changed) return;
    this.updateLocalSurveyCache();
    this.persistVoteToSupabase();
  }

  /**
   * Submits the updated questions of the currently selected survey to
   * Supabase, skipping local-only drafts.
   */
  private persistVoteToSupabase(): void {
    if (String(this.selectedSurvey!.id).startsWith('local-')) return;
    this.supabaseService.submitVote(
      this.selectedSurvey!.id as number,
      this.selectedSurvey!.questions,
    );
  }

  /**
   * Applies a vote change for a multiple-choice question.
   *
   * @param q       - The question being voted on.
   * @param oi      - Option index that was toggled.
   * @param checked - Whether the option was checked or unchecked.
   */
  private applyMultipleChoiceVote(q: any, oi: number, checked: boolean): void {
    if (checked) {
      q.options[oi].votes = (q.options[oi].votes || 0) + 1;
    } else {
      q.options[oi].votes = Math.max(0, (q.options[oi].votes || 1) - 1);
    }
  }

  /**
   * Applies a vote change for a single-choice (radio) question.
   * Deducts from the previously selected option if one existed.
   *
   * @param q  - The question being voted on.
   * @param qi - Question index used to track the selected option.
   * @param oi - Newly selected option index.
   * @returns `false` when the same option was re-selected (no-op), `true` otherwise.
   */
  private applySingleChoiceVote(q: any, qi: number, oi: number): boolean {
    const prev = this.selectedOptions[qi];
    if (prev === oi) return false;
    if (prev !== undefined) {
      q.options[prev].votes = Math.max(0, (q.options[prev].votes || 1) - 1);
    }
    q.options[oi].votes = (q.options[oi].votes || 0) + 1;
    this.selectedOptions[qi] = oi;
    return true;
  }

  /**
   * Replaces the matching entry in the local survey cache with the
   * current {@link selectedSurvey} state to keep the list in sync.
   */
  private updateLocalSurveyCache(): void {
    const updated = this._localSurveys
      .getValue()
      .map((s: Survey) => (s.id === this.selectedSurvey!.id ? { ...this.selectedSurvey! } : s));
    this._localSurveys.next(updated);
  }
}
