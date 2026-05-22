/**
 * @file app.ts
 * @description Root Angular component for the Poll App.
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
  private _localSurveys = new BehaviorSubject<Survey[]>([]);
  surveys$!: Observable<Survey[]>;

  selectedSurvey: Survey | null = null;
  currentFilter: SurveyFilter = 'active';
  isCreating: boolean = false;
  newSurvey: NewSurveyDraft = createEmptySurveyDraft();
  publishStatus: PublishStatus = 'idle';
  publishError: string = '';
  showToast: boolean = false;

  selectedOptions: {
    [surveyId: string | number]: {
      [qi: number]: number | { [oi: number]: boolean };
    };
  } = {};

  categoryDropdownOpen: boolean = false;
  readonly categories: string[] = [
    'Team Activities',
    'Health & Wellness',
    'Gaming & Entertainment',
    'Education & Learning',
    'Lifestyle & Preferences',
    'Technology & Innovation',
  ];

  readonly isSurveyExpired = isSurveyExpired;
  readonly getActiveSurveys = getActiveSurveys;
  readonly getPastSurveys = getPastSurveys;
  readonly getEndingSoonSurveys = getEndingSoonSurveys;
  readonly getDaysRemaining = getDaysRemaining;
  readonly getQuestionTotal = getQuestionTotal;
  readonly getTotalVotesForSurvey = getTotalVotesForSurvey;
  readonly getPercentage = getPercentage;
  readonly getLetterPrefix = getLetterPrefix;

  get todayString(): string {
    return new Date().toISOString().split('T')[0];
  }

  constructor(private supabaseService: SupabaseService) {}

  ngOnInit(): void {
    this.surveys$ = this._localSurveys.asObservable();
    this.supabaseService.surveys$.subscribe({
      next: (data: any[]) => {
        // 💡 RADIKALER FIX 1: Jedes reinkommende Datenbankobjekt wird hier knallhart normalisiert
        const normalized = (data || []).map((s) => ({
          ...s,
          end_date: s.end_date || s.endDate || null,
        }));
        this.mergeRemoteSurveys(normalized);
      },
    });

    try {
      const savedVotes = localStorage.getItem('poll_app_user_votes');
      if (savedVotes) {
        this.selectedOptions = JSON.parse(savedVotes);
      }
    } catch (e) {
      console.error('Konnte Auswahlen nicht aus LocalStorage laden', e);
    }
  }

  private mergeRemoteSurveys(data: Survey[]): void {
    if (!Array.isArray(data)) return;
    const current = this._localSurveys.getValue();

    const merged = data.map((remote: Survey) => {
      const local = current.find((s: Survey) => s.id === remote.id);
      if (!local) return remote;
      const remoteVotes = this.countTotalVotes(remote);
      const localVotes = this.countTotalVotes(local);
      return localVotes >= remoteVotes ? local : remote;
    });

    const onlyLocal = current.filter(
      (s: Survey) => typeof s.id === 'string' && s.id.startsWith('local-'),
    );
    this._localSurveys.next([...merged, ...onlyLocal]);
  }

  private countTotalVotes(survey: Survey): number {
    if (!survey?.questions) return 0;
    return survey.questions.reduce((sum: number, q: any) => {
      const qVotes = (q.options ?? []).reduce((s: number, o: any) => s + (o.votes ?? 0), 0);
      return sum + qVotes;
    }, 0);
  }

  getFilteredSurveys(surveys: Survey[]): Survey[] {
    return this.currentFilter === 'past' ? getPastSurveys(surveys) : getActiveSurveys(surveys);
  }

  setFilter(f: SurveyFilter): void {
    this.currentFilter = f;
  }

  selectSurvey(survey: Survey): void {
    if (isSurveyExpired(survey)) return;
    const cached = this._localSurveys.getValue().find((s: Survey) => s.id === survey.id);
    const source = cached ?? survey;
    this.isCreating = false;
    this.selectedSurvey = JSON.parse(JSON.stringify(source));
    // 💡 RADIKALER FIX 2: Auch in der Detailansicht das Feld absichern
    if (this.selectedSurvey) {
      this.selectedSurvey.end_date =
        this.selectedSurvey.end_date || (this.selectedSurvey as any).endDate || null;
    }
  }

  goBack(): void {
    this.selectedSurvey = null;
  }

  toggleCategoryDropdown(): void {
    this.categoryDropdownOpen = !this.categoryDropdownOpen;
  }

  selectCategory(cat: string): void {
    this.newSurvey.category = cat;
    this.categoryDropdownOpen = false;
  }

  openCreateMode(): void {
    this.newSurvey = createEmptySurveyDraft();
    this.isCreating = true;
    this.selectedSurvey = null;
    this.publishStatus = 'idle';
    this.publishError = '';
  }

  cancelCreation(): void {
    this.isCreating = false;
    this.publishStatus = 'idle';
  }

  addAnswerOption(qi: number): void {
    this.newSurvey.questions[qi].options.push({ label: '', votes: 0 });
  }

  removeAnswerOption(qi: number, oi: number): void {
    if (this.newSurvey.questions[qi].options.length > 2) {
      this.newSurvey.questions[qi].options.splice(oi, 1);
    }
  }

  addNextQuestion(): void {
    this.newSurvey.questions.push(createEmptyQuestion());
  }

  removeQuestion(qi: number): void {
    this.newSurvey.questions.splice(qi, 1);
  }

  publishSurvey(): void {
    const error = validateSurveyDraft(this.newSurvey);
    if (error) {
      this.publishError = error;
      this.publishStatus = 'error';
      return;
    }
    this.persistSurvey();
  }

  private persistSurvey(): void {
    const payload = buildSurveyPayload(this.newSurvey);
    // `end_date` wird bereits in `buildSurveyPayload` in ISO konvertiert.
    // Fügt eine lokale Vorschau hinzu, damit die UI sofort die verbleibenden Tage anzeigt.
    const localId = this.saveLocally(payload);

    this.resetAfterPublish();
    this.supabaseService
      .addSurvey(payload)
      .then((r) => {
        // Wenn das Insert erfolgreich war, entferne die temporäre lokale Kopie.
        if (!r?.error) {
          this.removeLocalSurvey(localId);
        }
      })
      .catch(() => {
        // Network error: leave the local preview in place so user can retry.
      });
  }

  private resetAfterPublish(): void {
    this.isCreating = false;
    this.selectedSurvey = null;
    this.publishStatus = 'idle';
    this.newSurvey = createEmptySurveyDraft();
    this.showToast = true;
    setTimeout(() => (this.showToast = false), 3000);
  }

  private saveLocally(payload: any): string {
    // Ensure `end_date` stored locally is an ISO string when possible so
    // the UI calculates remaining days correctly.
    let endVal = payload.end_date || payload.endDate || null;
    if (typeof endVal === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(endVal)) {
      const [y, m, d] = endVal.split('-').map((v: string) => parseInt(v, 10));
      endVal = new Date(y, m - 1, d).toISOString();
    }

    const local: Survey = {
      ...payload,
      id: 'local-' + Date.now(),
      end_date: endVal,
      created_at: new Date().toISOString(),
    };
    this._localSurveys.next([local, ...this._localSurveys.getValue()]);
    return local.id as string;
  }

  private removeLocalSurvey(localId: string): void {
    const updated = this._localSurveys.getValue().filter((s: Survey) => s.id !== localId);
    this._localSurveys.next(updated);
  }

  registerVote(qi: number, oi: number, event: Event): void {
    const q = this.selectedSurvey!.questions[qi];
    const checked = (event.target as HTMLInputElement).checked;
    const changed = q.allow_multiple
      ? (this.applyMultipleChoiceVote(q, qi, oi, checked), true)
      : this.applySingleChoiceVote(q, qi, oi);

    if (!changed) return;
    this.updateLocalSurveyCache();
    this.persistVoteToSupabase();
    localStorage.setItem('poll_app_user_votes', JSON.stringify(this.selectedOptions));
  }

  private persistVoteToSupabase(): void {
    if (String(this.selectedSurvey!.id).startsWith('local-')) return;
    this.supabaseService.submitVote(
      this.selectedSurvey!.id as number,
      this.selectedSurvey!.questions,
    );
  }

  private applyMultipleChoiceVote(q: any, qi: number, oi: number, checked: boolean): void {
    const sId = this.selectedSurvey!.id;
    if (!this.selectedOptions[sId]) {
      this.selectedOptions[sId] = {};
    }
    if (!this.selectedOptions[sId][qi] || typeof this.selectedOptions[sId][qi] !== 'object') {
      this.selectedOptions[sId][qi] = {};
    }

    const questionState = this.selectedOptions[sId][qi] as { [oi: number]: boolean };

    if (checked) {
      q.options[oi].votes = (q.options[oi].votes || 0) + 1;
      questionState[oi] = true;
    } else {
      q.options[oi].votes = Math.max(0, (q.options[oi].votes || 1) - 1);
      questionState[oi] = false;
    }
  }

  private applySingleChoiceVote(q: any, qi: number, oi: number): boolean {
    const sId = this.selectedSurvey!.id;
    if (!this.selectedOptions[sId]) {
      this.selectedOptions[sId] = {};
    }

    const prev = this.selectedOptions[sId][qi];
    if (prev === oi) return false;

    if (prev !== undefined && typeof prev === 'number' && q.options[prev]) {
      q.options[prev].votes = Math.max(0, (q.options[prev].votes || 1) - 1);
    }
    q.options[oi].votes = (q.options[oi].votes || 0) + 1;
    this.selectedOptions[sId][qi] = oi;
    return true;
  }

  private updateLocalSurveyCache(): void {
    const updated = this._localSurveys
      .getValue()
      .map((s: Survey) => (s.id === this.selectedSurvey!.id ? { ...this.selectedSurvey! } : s));
    this._localSurveys.next(updated);
  }
}
