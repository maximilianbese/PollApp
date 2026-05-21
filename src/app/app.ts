import { Component, OnInit, ViewEncapsulation } from '@angular/core';
import { SupabaseService } from './services/supabase';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Observable, BehaviorSubject } from 'rxjs';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './app.html',
  styleUrls: ['./app.scss'],
  encapsulation: ViewEncapsulation.None,
})
export class AppComponent implements OnInit {
  private _localSurveys = new BehaviorSubject<any[]>([]);
  surveys$!: Observable<any[]>;

  selectedSurvey: any = null;
  currentFilter: 'active' | 'past' = 'active';
  isCreating: boolean = false;
  newSurvey: any = this.initNewSurveyStructure();

  publishStatus: 'idle' | 'loading' | 'error' = 'idle';
  publishError: string = '';
  showToast: boolean = false;

  selectedOptions: { [qi: number]: number } = {};

  categoryDropdownOpen: boolean = false;
  categories: string[] = [
    'Team Activities',
    'Health & Wellness',
    'Gaming & Entertainment',
    'Education & Learning',
    'Lifestyle & Preferences',
    'Technology & Innovation',
  ];

  toggleCategoryDropdown(): void {
    this.categoryDropdownOpen = !this.categoryDropdownOpen;
  }

  selectCategory(cat: string): void {
    this.newSurvey.category = cat;
    this.categoryDropdownOpen = false;
  }

  constructor(private supabaseService: SupabaseService) {}

  ngOnInit(): void {
    this.surveys$ = this._localSurveys.asObservable();
    this.supabaseService.surveys$.subscribe({
      next: (data) => {
        if (Array.isArray(data)) {
          const onlyLocal = this._localSurveys
            .getValue()
            .filter((s: any) => typeof s.id === 'string' && s.id.startsWith('local-'));
          this._localSurveys.next([...data, ...onlyLocal]);
        }
      },
    });
  }

  // ── FILTER HELPERS ──────────────────────────────────────────────────────

  /** Umfrage ist abgelaufen wenn end_date in der Vergangenheit liegt */
  isSurveyExpired(survey: any): boolean {
    if (!survey.end_date) return false;
    const end = new Date(survey.end_date);
    end.setHours(23, 59, 59, 999);
    return end < new Date();
  }

  /** Aktive Umfragen: kein Enddatum oder Enddatum in der Zukunft */
  getActiveSurveys(surveys: any[]): any[] {
    return surveys.filter((s) => !this.isSurveyExpired(s));
  }

  /** Abgeschlossene Umfragen: Enddatum in der Vergangenheit */
  getPastSurveys(surveys: any[]): any[] {
    return surveys.filter((s) => this.isSurveyExpired(s));
  }

  /** US1: "Ending soon" — nur Umfragen MIT Enddatum, chronologisch sortiert, max 3 */
  getEndingSoonSurveys(surveys: any[]): any[] {
    return surveys
      .filter((s) => s.end_date && !this.isSurveyExpired(s))
      .sort((a, b) => new Date(a.end_date).getTime() - new Date(b.end_date).getTime())
      .slice(0, 3);
  }

  /** Aktuell angezeigte Liste je nach Filter-Tab */
  getFilteredSurveys(surveys: any[]): any[] {
    if (this.currentFilter === 'past') {
      return this.getPastSurveys(surveys);
    }
    return this.getActiveSurveys(surveys);
  }

  // ── CREATE SURVEY ────────────────────────────────────────────────────────

  openCreateMode(): void {
    this.newSurvey = this.initNewSurveyStructure();
    this.isCreating = true;
    this.selectedSurvey = null;
    this.publishStatus = 'idle';
    this.publishError = '';
  }

  cancelCreation(): void {
    this.isCreating = false;
    this.publishStatus = 'idle';
  }

  private initNewSurveyStructure() {
    return {
      title: '',
      description: '',
      endDate: '',
      category: 'Team activities',
      questions: [
        {
          questionText: '',
          allowMultiple: false,
          options: [
            { label: '', votes: 0 },
            { label: '', votes: 0 },
          ],
        },
      ],
    };
  }

  getLetterPrefix(index: number): string {
    return String.fromCharCode(65 + index) + '.';
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
    this.newSurvey.questions.push({
      questionText: '',
      allowMultiple: false,
      options: [
        { label: '', votes: 0 },
        { label: '', votes: 0 },
      ],
    });
  }

  removeQuestion(qi: number): void {
    this.newSurvey.questions.splice(qi, 1);
  }

  private validate(): string | null {
    if (!this.newSurvey.title.trim()) {
      return 'Survey name is required.';
    }
    for (let qi = 0; qi < this.newSurvey.questions.length; qi++) {
      const q = this.newSurvey.questions[qi];
      if (!q.questionText.trim()) {
        return `Question ${qi + 1} text is required.`;
      }
      for (let oi = 0; oi < q.options.length; oi++) {
        if (!q.options[oi].label.trim()) {
          return `Question ${qi + 1}: Answer ${this.getLetterPrefix(oi)} text is required.`;
        }
      }
    }
    return null;
  }

  private buildPayload(survey: any) {
    return {
      title: survey.title,
      description: survey.description || '',
      category: survey.category,
      end_date: survey.endDate || null,
      questions: survey.questions.map((q: any) => ({
        question_text: q.questionText,
        allow_multiple: q.allowMultiple,
        options: q.options.map((o: any, i: number) => ({
          letter: String.fromCharCode(65 + i),
          text: o.label,
          votes: 0,
        })),
      })),
    };
  }

  private saveLocally(payload: any): void {
    const local = {
      ...payload,
      id: 'local-' + Date.now(),
      created_at: new Date().toISOString(),
    };
    this._localSurveys.next([local, ...this._localSurveys.getValue()]);
  }

  publishSurvey(): void {
    const validationError = this.validate();
    if (validationError) {
      this.publishError = validationError;
      this.publishStatus = 'error';
      return;
    }

    const payload = this.buildPayload(this.newSurvey);
    const surveyToSave = { ...this.newSurvey, questions: [...this.newSurvey.questions] };

    // Sofort zur Startseite
    this.isCreating = false;
    this.selectedSurvey = null;
    this.publishStatus = 'idle';
    this.newSurvey = this.initNewSurveyStructure();
    this.showToast = true;
    setTimeout(() => {
      this.showToast = false;
    }, 3000);

    // Im Hintergrund speichern
    this.supabaseService
      .addSurvey(surveyToSave)
      .then((result) => {
        if (result?.error) {
          console.warn('Supabase Fehler:', result.error.message, '→ lokal gespeichert');
          this.saveLocally(payload);
        }
      })
      .catch((e) => {
        console.warn('Fehler:', e);
        this.saveLocally(payload);
      });
  }

  // ── SURVEY DETAIL ────────────────────────────────────────────────────────

  selectSurvey(survey: any): void {
    // Abgeschlossene Umfragen sind nicht klickbar (US4)
    if (this.isSurveyExpired(survey)) return;
    this.isCreating = false;
    this.selectedSurvey = JSON.parse(JSON.stringify(survey));
    this.selectedOptions = {};
  }

  goBack(): void {
    this.selectedSurvey = null;
    this.selectedOptions = {};
  }

  setFilter(f: 'active' | 'past'): void {
    this.currentFilter = f;
  }

  // ── VOTING ───────────────────────────────────────────────────────────────

  getQuestionTotal(q: any): number {
    if (!q?.options) return 0;
    return q.options.reduce((s: number, o: any) => s + (o.votes || 0), 0);
  }

  getTotalVotesForSurvey(survey: any): number {
    if (!survey?.questions) return 0;
    return survey.questions.reduce((s: number, q: any) => s + this.getQuestionTotal(q), 0);
  }

  getPercentage(votes: number, total: number): number {
    if (!total) return 0;
    return Math.round((votes / total) * 100);
  }

  registerVote(qi: number, oi: number, event: Event): void {
    const q = this.selectedSurvey.questions[qi];
    const checked = (event.target as HTMLInputElement).checked;

    if (q.allow_multiple) {
      if (checked) {
        q.options[oi].votes = (q.options[oi].votes || 0) + 1;
      } else {
        q.options[oi].votes = Math.max(0, (q.options[oi].votes || 1) - 1);
      }
    } else {
      const prev = this.selectedOptions[qi];
      if (prev === oi) return;
      if (prev !== undefined) {
        q.options[prev].votes = Math.max(0, (q.options[prev].votes || 1) - 1);
      }
      q.options[oi].votes = (q.options[oi].votes || 0) + 1;
      this.selectedOptions[qi] = oi;
    }

    // Lokal aktualisieren für sofortige UI-Reaktion
    const surveys = this._localSurveys
      .getValue()
      .map((s: any) => (s.id === this.selectedSurvey.id ? { ...this.selectedSurvey } : s));
    this._localSurveys.next(surveys);

    // In Supabase speichern
    if (!String(this.selectedSurvey.id).startsWith('local-')) {
      this.supabaseService.submitVote(this.selectedSurvey.id, this.selectedSurvey.questions);
    }
  }

  // ── HELPERS ──────────────────────────────────────────────────────────────

  getDaysRemaining(endDate: string): string {
    if (!endDate) return 'No end date';
    const end = new Date(endDate);
    const now = new Date();
    const diff = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (diff < 0) return 'Ended ' + end.toLocaleDateString('de-DE');
    if (diff === 0) return 'Ends today';
    if (diff === 1) return 'Ends in 1 day';
    return `Ends in ${diff} days`;
  }
}
