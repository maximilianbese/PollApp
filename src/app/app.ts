/**
 * @fileoverview Root application component.
 * Orchestrates top-level navigation between the dashboard, the survey creation
 * modal, and the single-survey detail view. Owns all reactive state and
 * delegates persistence to {@link SupabaseService}.
 */

import { Component, OnInit, ViewEncapsulation } from '@angular/core';
import { AsyncPipe, NgIf } from '@angular/common';
import { Observable, BehaviorSubject } from 'rxjs';

import { SupabaseService } from './services/supabase.service';
import {
  Survey,
  NewSurveyDraft,
  PublishStatus,
  SurveyFilter,
  SelectedOptionsMap,
} from './models/surveys.models';
import {
  createEmptySurveyDraft,
  buildSurveyPayload,
  validateSurveyDraft,
} from './utils/survey-builder.utils';

import { DashboardComponent } from './components/dashboard/dashboard.component';
import { CreateSurveyComponent } from './components/create-survey/create-survey.component';
import { SurveyDetailComponent } from './components/survey-detail/survey-detail.component';
import { ToastComponent } from './components/toast/toast.component';

/** @internal Key used to persist vote selections in `localStorage`. */
const VOTES_STORAGE_KEY = 'poll_app_user_votes';

/**
 * Shell component that manages view state and delegates rendering to
 * specialised child components.
 *
 * **View hierarchy:**
 * - {@link DashboardComponent} — default view showing all surveys
 * - {@link CreateSurveyComponent} — modal overlay for new surveys
 * - {@link SurveyDetailComponent} — full-page voting form for one survey
 * - {@link ToastComponent} — transient success / error banners
 */
@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    AsyncPipe,
    NgIf,
    DashboardComponent,
    CreateSurveyComponent,
    SurveyDetailComponent,
    ToastComponent,
  ],
  templateUrl: './app.html',
  styleUrls: ['./app.scss'],
  encapsulation: ViewEncapsulation.None,
})
export class AppComponent implements OnInit {
  private readonly _localSurveys = new BehaviorSubject<Survey[]>([]);

  /** Observable survey list consumed by child components via the async pipe. */
  surveys$!: Observable<Survey[]>;

  /** Survey currently open in the detail view, or `null` when not selected. */
  selectedSurvey: Survey | null = null;

  /** Active dashboard filter tab. */
  currentFilter: SurveyFilter = 'active';

  /** Whether the survey creation modal is visible. */
  isCreating = false;

  /** Mutable draft bound to the creation form. */
  newSurvey: NewSurveyDraft = createEmptySurveyDraft();

  /** Publish-flow state used to drive toast and error UI. */
  publishStatus: PublishStatus = 'idle';

  /** Error message shown when {@link publishStatus} is `"error"`. */
  publishError = '';

  /** Whether the success toast is visible. */
  showToast = false;

  /** Whether the error toast (from validation) is visible. */
  showErrorToast = false;

  /**
   * Stores the user's vote selections keyed by survey ID and question index.
   * Persisted to `localStorage` on every change.
   */
  selectedOptions: SelectedOptionsMap = {};

  constructor(private readonly supabaseService: SupabaseService) {}

  ngOnInit(): void {
    this.surveys$ = this._localSurveys.asObservable();

    this.supabaseService.surveys$.subscribe({
      next: (data) => {
        const normalized = (data ?? []).map((s) => {
          const fallbackEndDate = (s as unknown as { endDate?: string }).endDate;
          return {
            ...s,
            end_date: s.end_date ?? fallbackEndDate ?? null,
          };
        }) as Survey[];
        this.mergeRemoteSurveys(normalized);
      },
    });

    try {
      const saved = localStorage.getItem(VOTES_STORAGE_KEY);
      if (saved) this.selectedOptions = JSON.parse(saved);
    } catch {
      /* Silently ignore corrupted storage entries. */
    }
  }

  /**
   * Merges remote survey data into the local stream, preferring whichever
   * version has more votes to protect against stale overwrites.
   *
   * @param remoteData - Latest survey array from Supabase.
   */
  private mergeRemoteSurveys(remoteData: Survey[]): void {
    if (!Array.isArray(remoteData)) return;
    const current = this._localSurveys.getValue();

    const merged = remoteData.map((remote) => {
      const local = current.find((s) => s.id === remote.id);
      if (!local) return remote;
      return this.countTotalVotes(local) >= this.countTotalVotes(remote) ? local : remote;
    });

    const onlyLocal = current.filter((s) => typeof s.id === 'string' && s.id.startsWith('local-'));
    this._localSurveys.next([...merged, ...onlyLocal]);
  }

  /**
   * Counts all votes across every question and option of a survey.
   *
   * @param survey - Survey to aggregate.
   * @returns Total vote count.
   */
  private countTotalVotes(survey: Survey): number {
    return (survey.questions ?? []).reduce(
      (sum: number, q: Survey['questions'][number]) =>
        sum +
        (q.options ?? []).reduce(
          (s: number, o: Survey['questions'][number]['options'][number]) => s + (o.votes ?? 0),
          0,
        ),
      0,
    );
  }

  /**
   * Switches the active dashboard filter tab.
   *
   * @param filter - New filter value.
   */
  setFilter(filter: SurveyFilter): void {
    this.currentFilter = filter;
  }

  /**
   * Opens the detail view for the given survey.
   * Expired surveys are ignored. The cached local version is preferred to
   * preserve optimistic vote updates.
   *
   * @param survey - Survey to open.
   */
  selectSurvey(survey: Survey): void {
    const cached = this._localSurveys.getValue().find((s) => s.id === survey.id);
    const source = cached ?? survey;
    this.isCreating = false;
    this.selectedSurvey = JSON.parse(JSON.stringify(source)) as Survey;

    if (this.selectedSurvey) {
      const fallbackEndDate = (
        this.selectedSurvey as unknown as {
          endDate?: string;
        }
      ).endDate;

      this.selectedSurvey.end_date = this.selectedSurvey.end_date ?? fallbackEndDate ?? undefined;
    }
  }

  /** Closes the detail view and returns to the dashboard. */
  goBack(): void {
    this.selectedSurvey = null;
  }

  /** Opens the survey creation modal with a fresh empty draft. */
  openCreateMode(): void {
    this.newSurvey = createEmptySurveyDraft();
    this.isCreating = true;
    this.selectedSurvey = null;
    this.publishStatus = 'idle';
    this.publishError = '';
  }

  /** Closes the creation modal and resets publish state. */
  cancelCreation(): void {
    this.isCreating = false;
    this.publishStatus = 'idle';
  }

  /**
   * Validates the current draft and initiates persistence when valid.
   * Sets error state on the creation form when validation fails.
   */
  publishSurvey(): void {
    const error = validateSurveyDraft(this.newSurvey);
    if (error) {
      this.publishError = error;
      this.publishStatus = 'error';
      this.showErrorToast = true;
      return;
    }
    this.persistSurvey();
  }

  /**
   * Builds the Supabase payload, optimistically adds a local preview,
   * and dispatches the insert. On success the local preview is removed.
   */
  private persistSurvey(): void {
    const payload = buildSurveyPayload(this.newSurvey);
    const localId = this.addLocalPreview(payload);

    this.resetAfterPublish();

    this.supabaseService
      .addSurvey(payload as unknown as Record<string, unknown>)
      .then((r) => {
        if (!r?.error) this.removeLocalSurvey(localId);
      })
      .catch(() => {
        /* Network error: keep the local preview so the user can retry. */
      });
  }

  /** Resets creation state and triggers the success toast for 3 seconds. */
  private resetAfterPublish(): void {
    this.isCreating = false;
    this.selectedSurvey = null;
    this.publishStatus = 'idle';
    this.newSurvey = createEmptySurveyDraft();
    this.showToast = true;
    setTimeout(() => (this.showToast = false), 3000);
  }

  /**
   * Inserts a temporary local-only survey into the reactive stream so the
   * dashboard reflects the new record instantly before Supabase confirms.
   *
   * @param payload - Built survey payload.
   * @returns The generated local ID string.
   */
  private addLocalPreview(payload: ReturnType<typeof buildSurveyPayload>): string {
    let endVal: string | null = payload.end_date ?? null;
    if (typeof endVal === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(endVal)) {
      const [y, m, d] = endVal.split('-').map((v) => parseInt(v, 10));
      endVal = new Date(y, m - 1, d).toISOString();
    }

    const local: Survey = {
      ...(payload as unknown as Survey),
      id: `local-${Date.now()}`,
      end_date: endVal ?? undefined,
      created_at: new Date().toISOString(),
    };

    this._localSurveys.next([local, ...this._localSurveys.getValue()]);
    return local.id as string;
  }

  /**
   * Removes a local-only survey from the reactive stream by ID.
   *
   * @param localId - The `"local-..."` ID string to remove.
   */
  private removeLocalSurvey(localId: string): void {
    const updated = this._localSurveys.getValue().filter((s) => s.id !== localId);
    this._localSurveys.next(updated);
  }

  /**
   * Handles a vote interaction emitted by {@link SurveyDetailComponent}.
   * Dispatches to single- or multi-choice handlers based on the question type.
   *
   * @param questionIndex - Zero-based question index.
   * @param optionIndex   - Zero-based option index.
   * @param event         - The DOM change event from the input element.
   */
  registerVote(questionIndex: number, optionIndex: number, event: Event): void {
    const q = this.selectedSurvey!.questions[questionIndex];
    const checked = (event.target as HTMLInputElement).checked;

    const changed = q.allow_multiple
      ? (this.applyMultipleChoiceVote(q, questionIndex, optionIndex, checked), true)
      : this.applySingleChoiceVote(q, questionIndex, optionIndex);

    if (!changed) return;

    this.updateLocalSurveyCache();
    this.persistVoteToSupabase();
    localStorage.setItem(VOTES_STORAGE_KEY, JSON.stringify(this.selectedOptions));
  }

  /**
   * Persists the current question state to Supabase.
   * Skipped for local-only surveys (those with a `"local-"` prefixed ID).
   */
  private persistVoteToSupabase(): void {
    if (String(this.selectedSurvey!.id).startsWith('local-')) return;
    this.supabaseService.submitVote(
      this.selectedSurvey!.id as number,
      this.selectedSurvey!.questions,
    );
  }

  /**
   * Applies a multi-choice vote change to the selected survey's question state.
   *
   * @param q             - The question being voted on.
   * @param questionIndex - Zero-based question index.
   * @param optionIndex   - Zero-based option index.
   * @param checked       - Whether the checkbox was just checked or unchecked.
   */
  private applyMultipleChoiceVote(
    q: Survey['questions'][number],
    questionIndex: number,
    optionIndex: number,
    checked: boolean,
  ): void {
    const sId = this.selectedSurvey!.id;
    this.selectedOptions[sId] ??= {};

    if (typeof this.selectedOptions[sId][questionIndex] !== 'object') {
      this.selectedOptions[sId][questionIndex] = {};
    }

    const state = this.selectedOptions[sId][questionIndex] as Record<number, boolean>;

    if (checked) {
      q.options[optionIndex].votes = (q.options[optionIndex].votes ?? 0) + 1;
      state[optionIndex] = true;
    } else {
      q.options[optionIndex].votes = Math.max(0, (q.options[optionIndex].votes ?? 1) - 1);
      state[optionIndex] = false;
    }
  }

  /**
   * Applies a single-choice vote to the selected survey's question state.
   * Decrements the previously selected option if one exists.
   *
   * @param q             - The question being voted on.
   * @param questionIndex - Zero-based question index.
   * @param optionIndex   - Zero-based option index.
   * @returns `true` when the selection changed; `false` when it was unchanged.
   */
  private applySingleChoiceVote(
    q: Survey['questions'][number],
    questionIndex: number,
    optionIndex: number,
  ): boolean {
    const sId = this.selectedSurvey!.id;
    this.selectedOptions[sId] ??= {};

    const prev = this.selectedOptions[sId][questionIndex];
    if (prev === optionIndex) return false;

    if (typeof prev === 'number' && q.options[prev]) {
      q.options[prev].votes = Math.max(0, (q.options[prev].votes ?? 1) - 1);
    }

    q.options[optionIndex].votes = (q.options[optionIndex].votes ?? 0) + 1;
    this.selectedOptions[sId][questionIndex] = optionIndex;
    return true;
  }

  /**
   * Replaces the cached copy of the current survey in the local stream
   * with the latest in-memory version (including updated vote counts).
   */
  private updateLocalSurveyCache(): void {
    const updated = this._localSurveys
      .getValue()
      .map((s) => (s.id === this.selectedSurvey!.id ? { ...this.selectedSurvey! } : s));
    this._localSurveys.next(updated);
  }
}
