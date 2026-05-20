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

  // Tracks welche Option pro Frage gewählt wurde (Single-Choice)
  selectedOptions: { [qi: number]: number } = {};

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
    // Mindestens 2 Antworten behalten
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

  /** Validierung: Gibt Fehlermeldung zurück oder null wenn alles ok */
  private validate(): string | null {
    if (!this.newSurvey.title.trim()) {
      return 'Please enter a survey title.';
    }
    for (let qi = 0; qi < this.newSurvey.questions.length; qi++) {
      const q = this.newSurvey.questions[qi];
      if (!q.questionText.trim()) {
        return `Question ${qi + 1} needs a text.`;
      }
      for (let oi = 0; oi < q.options.length; oi++) {
        if (!q.options[oi].label.trim()) {
          return `Question ${qi + 1}: Answer ${this.getLetterPrefix(oi)} needs a text.`;
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
    // Validierung
    const validationError = this.validate();
    if (validationError) {
      this.publishError = validationError;
      this.publishStatus = 'error';
      return;
    }

    const payload = this.buildPayload(this.newSurvey);
    const surveyToSave = { ...this.newSurvey };

    // SOFORT zur Startseite navigieren — kein await, kein Warten
    this.isCreating = false;
    this.selectedSurvey = null;
    this.publishStatus = 'idle';
    this.newSurvey = this.initNewSurveyStructure();
    this.showToast = true;
    setTimeout(() => {
      this.showToast = false;
    }, 3000);

    // Im Hintergrund speichern (fire & forget)
    this.supabaseService
      .addSurvey(surveyToSave)
      .then((result) => {
        if (result?.error) {
          console.warn('Supabase Fehler:', result.error.message, '→ lokal gespeichert');
          this.saveLocally(payload);
        } else {
          console.log('Erfolgreich gespeichert');
        }
      })
      .catch((e) => {
        console.warn('Fehler beim Speichern:', e);
        this.saveLocally(payload);
      });
  }

  selectSurvey(survey: any): void {
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

    if (q.allow_multiple) {
      q.options[oi].votes = (q.options[oi].votes || 0) + 1;
    } else {
      const prev = this.selectedOptions[qi];
      if (prev === oi) return; // Gleiche Option nochmal → nichts tun
      if (prev !== undefined) {
        q.options[prev].votes = Math.max(0, (q.options[prev].votes || 1) - 1);
      }
      q.options[oi].votes = (q.options[oi].votes || 0) + 1;
      this.selectedOptions[qi] = oi;
    }

    const surveys = this._localSurveys
      .getValue()
      .map((s: any) => (s.id === this.selectedSurvey.id ? { ...this.selectedSurvey } : s));
    this._localSurveys.next(surveys);

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
