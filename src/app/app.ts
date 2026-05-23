import { Component, OnInit, ViewEncapsulation } from '@angular/core';
import { AsyncPipe, NgIf } from '@angular/common';
import { Observable, BehaviorSubject } from 'rxjs';

import { SupabaseService } from './services/supabase.service';
import { SurveyBuilderService } from './services/survey-builder.service';
import {
  Survey,
  NewSurveyDraft,
  PublishStatus,
  SurveyFilter,
  SelectedOptionsMap,
} from './models/surveys.models';

import { DashboardComponent } from './components/dashboard/dashboard.component';
import { CreateSurveyComponent } from './components/create-survey/create-survey.component';
import { SurveyDetailComponent } from './components/survey-detail/survey-detail.component';
import { ToastComponent } from './components/toast/toast.component';

const VOTES_STORAGE_KEY = 'poll_app_user_votes';

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

  surveys$!: Observable<Survey[]>;
  selectedSurvey: Survey | null = null;
  currentFilter: SurveyFilter = 'active';
  isCreating = false;
  newSurvey!: NewSurveyDraft;
  publishStatus: PublishStatus = 'idle';
  publishError = '';
  showToast = false;
  showErrorToast = false;
  selectedOptions: SelectedOptionsMap = {};

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly surveyBuilder: SurveyBuilderService,
  ) {
    this.newSurvey = this.surveyBuilder.createEmptySurveyDraft();
  }

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
      // Silently ignore corrupted storage entries.
    }
  }

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

    if (this.selectedSurvey) {
      const updated = this._localSurveys.getValue().find((s) => s.id === this.selectedSurvey!.id);
      if (updated) {
        this.selectedSurvey = { ...updated };
      }
    }
  }

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

  setFilter(filter: SurveyFilter): void {
    this.currentFilter = filter;
  }

  selectSurvey(survey: Survey): void {
    const cached = this._localSurveys.getValue().find((s) => s.id === survey.id);
    const source = cached ?? survey;
    this.isCreating = false;
    this.selectedSurvey = JSON.parse(JSON.stringify(source)) as Survey;

    if (this.selectedSurvey) {
      const fallbackEndDate = (this.selectedSurvey as unknown as { endDate?: string }).endDate;
      this.selectedSurvey.end_date = this.selectedSurvey.end_date ?? fallbackEndDate ?? undefined;
    }
  }

  goBack(): void {
    this.selectedSurvey = null;
  }

  openCreateMode(): void {
    this.newSurvey = this.surveyBuilder.createEmptySurveyDraft();
    this.isCreating = true;
    this.selectedSurvey = null;
    this.publishStatus = 'idle';
    this.publishError = '';
  }

  cancelCreation(): void {
    this.isCreating = false;
    this.publishStatus = 'idle';
  }

  publishSurvey(): void {
    const error = this.surveyBuilder.validateSurveyDraft(this.newSurvey);
    if (error) {
      this.publishError = error;
      this.publishStatus = 'error';
      this.showErrorToast = true;
      return;
    }
    this.persistSurvey();
  }

  private persistSurvey(): void {
    const payload = this.surveyBuilder.buildSurveyPayload(this.newSurvey);
    const localId = this.addLocalPreview(payload);

    this.resetAfterPublish();

    this.supabaseService
      .addSurvey(payload as unknown as Record<string, unknown>)
      .then((r) => {
        if (!r?.error) this.removeLocalSurvey(localId);
      })
      .catch(() => {
        // Network error: keep the local preview so the user can retry.
      });
  }

  private resetAfterPublish(): void {
    this.isCreating = false;
    this.selectedSurvey = null;
    this.publishStatus = 'idle';
    this.newSurvey = this.surveyBuilder.createEmptySurveyDraft();
    this.showToast = true;
    setTimeout(() => (this.showToast = false), 3000);
  }

  private addLocalPreview(payload: ReturnType<SurveyBuilderService['buildSurveyPayload']>): string {
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

  private removeLocalSurvey(localId: string): void {
    const updated = this._localSurveys.getValue().filter((s) => s.id !== localId);
    this._localSurveys.next(updated);
  }

  registerVote(questionIndex: number, optionIndex: number, event: Event): void {
    const q = this.selectedSurvey!.questions[questionIndex];
    const checked = (event.target as HTMLInputElement).checked;

    const changed = q.allow_multiple
      ? (this.applyMultipleChoiceVote(q, questionIndex, optionIndex, checked), true)
      : this.applySingleChoiceVote(q, questionIndex, optionIndex);

    if (!changed) return;

    // Neue Referenz erzeugen, damit OnPush-Komponenten die Änderung erkennen
    this.selectedSurvey = JSON.parse(JSON.stringify(this.selectedSurvey!)) as Survey;

    this.updateLocalSurveyCache();
    this.persistVoteToSupabase();
    localStorage.setItem(VOTES_STORAGE_KEY, JSON.stringify(this.selectedOptions));
  }

  private persistVoteToSupabase(): void {
    if (String(this.selectedSurvey!.id).startsWith('local-')) return;
    this.supabaseService.submitVote(
      this.selectedSurvey!.id as number,
      this.selectedSurvey!.questions,
    );
  }

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

  private updateLocalSurveyCache(): void {
    const updated = this._localSurveys
      .getValue()
      .map((s) => (s.id === this.selectedSurvey!.id ? { ...this.selectedSurvey! } : s));
    this._localSurveys.next(updated);
  }
}
