import { Component, OnInit, ViewEncapsulation } from '@angular/core';
import { SupabaseService } from './services/supabase';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms'; // Wichtig für zwei-Wege-Binding im Formular
import { Observable } from 'rxjs';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './app.html',
  styleUrls: ['./app.scss'],
  encapsulation: ViewEncapsulation.None,
})
export class AppComponent implements OnInit {
  /** Datenstrom aller verfügbaren Umfragen aus der Datenbank. */
  surveys$!: Observable<any[]>;
  /** Die aktuell ausgewählte Umfrage für die Detailansicht. */
  selectedSurvey: any = null;
  /** Filter für das Dashboard ('active' or 'past'). */
  currentFilter: 'active' | 'past' = 'active';

  /** Steuerungs-Flag für die Erstellungsansicht */
  isCreating: boolean = false;
  /** Datenmodell für die neu zu erstellende Umfrage */
  newSurvey: any = this.initNewSurveyStructure();

  /**
   * Injiziert den benötigten SupabaseService.
   * @param supabaseService - Der Daten-Service für Supabase.
   */
  constructor(private supabaseService: SupabaseService) {}

  /**
   * Initialisiert die Komponente, triggert das Laden und bindet den Datenstrom.
   */
  ngOnInit(): void {
    this.surveys$ = this.supabaseService.surveys$;

    const service = this.supabaseService as any;
    if (typeof service.loadSurveys === 'function') {
      service.loadSurveys();
    } else if (typeof service.fetchSurveys === 'function') {
      service.fetchSurveys();
    } else if (typeof service.getSurveys === 'function') {
      service.getSurveys();
    }

    this.surveys$.subscribe({
      next: (data) => console.log('SURVEY DETECTOR: Daten erfolgreich geladen:', data),
      error: (err) => console.error('SURVEY DETECTOR ERROR:', err),
    });
  }

  /** Wechselt in den Modus zum Erstellen einer neuen Umfrage */
  openCreateMode(): void {
    this.newSurvey = this.initNewSurveyStructure();
    this.isCreating = true;
    this.selectedSurvey = null;
  }

  /** Bricht das Erstellen ab und kehrt zum Dashboard zurück */
  cancelCreation(): void {
    this.isCreating = false;
    this.newSurvey = this.initNewSurveyStructure();
  }

  /** Generiert ein leeres Standard-Template für eine neue Umfrage */
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

  /** Wandelt einen Index in fortlaufende Alphabet-Präfixe um (0 -> A., 1 -> B., etc.) */
  getLetterPrefix(index: number): string {
    return String.fromCharCode(65 + index) + '.';
  }

  /** Fügt einer bestimmten Frage eine neue Antwortoption hinzu */
  addAnswerOption(questionIndex: number): void {
    this.newSurvey.questions[questionIndex].options.push({ label: '', votes: 0 });
  }

  /** Entfernt eine Antwortoption aus einer Frage */
  removeAnswerOption(questionIndex: number, optionIndex: number): void {
    this.newSurvey.questions[questionIndex].options.splice(optionIndex, 1);
  }

  /** Fügt dem Umfrageblock eine weitere Frage hinzu */
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

  /** Entfernt eine Frage komplett aus der Liste */
  removeQuestion(questionIndex: number): void {
    this.newSurvey.questions.splice(questionIndex, 1);
  }

  /** Übermittelt die erstellte Umfrage an Supabase */
  publishSurvey(): void {
    console.log('Publishing valid structural survey object:', this.newSurvey);
    // Hier folgt deine Logik, z.B. this.supabaseService.addSurvey(this.newSurvey);
    this.isCreating = false;
  }

  /** Setzt die ausgewählte Umfrage für die Detailansicht. */
  selectSurvey(survey: any): void {
    this.isCreating = false;
    this.selectedSurvey = JSON.parse(JSON.stringify(survey));
  }

  /** Setzt die Detailansicht zurück und kehrt zum Dashboard zurück. */
  goBack(): void {
    this.selectedSurvey = null;
  }

  /** Ändert den aktiven Dashboard-Filter. */
  setFilter(filter: 'active' | 'past'): void {
    this.currentFilter = filter;
  }

  /** Berechnet die Gesamtstimmen für eine bestimmte Frage. */
  getQuestionTotal(question: any): number {
    if (!question || !question.options) return 0;
    return question.options.reduce((sum: number, opt: any) => sum + (opt.votes || 0), 0);
  }

  /** Berechnet den prozentualen Anteil einer Option an der Gesamtzahl. */
  getPercentage(votes: number, total: number): number {
    if (total === 0) return 0;
    return Math.round((votes / total) * 100);
  }

  /** Erhöht die Stimmanzahl einer Option lokal und sendet sie an Supabase. */
  registerVote(questionIndex: number, optionIndex: number): void {
    const q = this.selectedSurvey.questions[questionIndex];
    q.options[optionIndex].votes = (q.options[optionIndex].votes || 0) + 1;
    this.supabaseService.submitVote(this.selectedSurvey.id, this.selectedSurvey.questions);
  }
}
