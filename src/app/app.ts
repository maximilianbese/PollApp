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

  publishStatus: 'idle' | 'loading' | 'success' | 'error' = 'idle';
  publishError: string = '';

  constructor(private supabaseService: SupabaseService) {}

  ngOnInit(): void {
    this.surveys$ = this._localSurveys.asObservable();

    this.supabaseService.surveys$.subscribe({
      next: (data) => {
        if (Array.isArray(data)) {
          const remoteIds = new Set(data.map((s: any) => s.id));
          const onlyLocal = this._localSurveys
            .getValue()
            .filter((s: any) => typeof s.id === 'string' && s.id.startsWith('local-'));
          this._localSurveys.next([...data, ...onlyLocal]);
        }
      },
    });
  }

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
          questionText: 'Which date would work best for you?',
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
    this.newSurvey.questions[qi].options.splice(oi, 1);
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

  private finishPublish(): void {
    this.publishStatus = 'success';
    setTimeout(() => {
      // Zurück zur Startseite
      this.isCreating = false;
      this.selectedSurvey = null;
      this.publishStatus = 'idle';
      this.newSurvey = this.initNewSurveyStructure();
    }, 1500);
  }

  async publishSurvey(): Promise<void> {
    if (!this.newSurvey.title.trim()) {
      this.publishError = 'Please enter a survey title.';
      this.publishStatus = 'error';
      return;
    }

    this.publishStatus = 'loading';
    this.publishError = '';

    const payload = this.buildPayload(this.newSurvey);

    // Timeout nach 6 Sekunden → lokal speichern und weitermachen
    const timeout = new Promise<{ data: null; error: { message: string } }>((resolve) =>
      setTimeout(() => resolve({ data: null, error: { message: 'Timeout' } }), 6000),
    );

    try {
      const result = await Promise.race([this.supabaseService.addSurvey(this.newSurvey), timeout]);

      if (result.error) {
        console.warn('Supabase nicht erreichbar:', result.error.message, '→ lokal gespeichert');
        this.saveLocally(payload);
      }
      // Egal ob Fehler oder Erfolg → immer weitergehen
      this.finishPublish();
    } catch (e) {
      console.warn('Unerwarteter Fehler:', e);
      this.saveLocally(payload);
      this.finishPublish();
    }
  }

  selectSurvey(survey: any): void {
    this.isCreating = false;
    this.selectedSurvey = JSON.parse(JSON.stringify(survey));
  }

  goBack(): void {
    this.selectedSurvey = null;
  }

  setFilter(f: 'active' | 'past'): void {
    this.currentFilter = f;
  }

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

  registerVote(qi: number, oi: number): void {
    const q = this.selectedSurvey.questions[qi];
    q.options[oi].votes = (q.options[oi].votes || 0) + 1;

    // Lokal aktualisieren
    const surveys = this._localSurveys
      .getValue()
      .map((s: any) => (s.id === this.selectedSurvey.id ? { ...this.selectedSurvey } : s));
    this._localSurveys.next(surveys);

    // In Supabase speichern wenn echte ID
    if (!String(this.selectedSurvey.id).startsWith('local-')) {
      this.supabaseService.submitVote(this.selectedSurvey.id, this.selectedSurvey.questions);
    }
  }

  getDaysRemaining(endDate: string): string {
    if (!endDate) return 'No end date';
    const end = new Date(endDate);
    const now = new Date();
    const diff = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (diff < 0) return 'Ends on ' + end.toLocaleDateString('de-DE');
    if (diff === 0) return 'Ends today';
    if (diff === 1) return 'Ends in 1 day';
    return `Ends in ${diff} days`;
  }
}
