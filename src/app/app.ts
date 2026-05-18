import { Component, OnInit, ViewEncapsulation } from '@angular/core';
import { SupabaseService } from './services/supabase';
import { CommonModule } from '@angular/common';
import { Observable } from 'rxjs';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule],
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

  /**
   * Injiziert den benötigten SupabaseService.
   * @param supabaseService - Der Daten-Service für Supabase.
   */
  constructor(private supabaseService: SupabaseService) {}

  /**
   * Initialisiert die Komponente, triggert das Laden und bindet den Datenstrom.
   */
  ngOnInit(): void {
    // 1. Datenstrom direkt an die Service-Variable koppeln
    this.surveys$ = this.supabaseService.surveys$;

    // 2. Unbemerkt im Hintergrund die Ladefunktion anstoßen (verhindert TS-Fehlermeldungen)
    const service = this.supabaseService as any;
    if (typeof service.loadSurveys === 'function') {
      service.loadSurveys();
    } else if (typeof service.fetchSurveys === 'function') {
      service.fetchSurveys();
    } else if (typeof service.getSurveys === 'function') {
      service.getSurveys();
    }

    // 3. Kontroll-Log für dich im Browser-Entwicklermodus (F12)
    this.surveys$.subscribe({
      next: (data) => console.log('SURVEY DETECTOR: Daten erfolgreich geladen:', data),
      error: (err) => console.error('SURVEY DETECTOR ERROR:', err),
    });
  }

  /**
   * Setzt die ausgewählte Umfrage für die Detailansicht.
   * @param survey - Das ausgewählte Umfrageobjekt.
   */
  selectSurvey(survey: any): void {
    this.selectedSurvey = JSON.parse(JSON.stringify(survey));
  }

  /**
   * Setzt die Detailansicht zurück und kehrt zum Dashboard zurück.
   */
  goBack(): void {
    this.selectedSurvey = null;
  }

  /**
   * Ändert den aktiven Dashboard-Filter.
   * @param filter - Der gewünschte Filterzustand.
   */
  setFilter(filter: 'active' | 'past'): void {
    this.currentFilter = filter;
  }

  /**
   * Berechnet die Gesamtstimmen für eine bestimmte Frage.
   * @param question - Das Frageobjekt mit seinen Optionen.
   * @returns Die Summe aller Stimmen.
   */
  getQuestionTotal(question: any): number {
    if (!question || !question.options) return 0;
    return question.options.reduce((sum: number, opt: any) => sum + (opt.votes || 0), 0);
  }

  /**
   * Berechnet den prozentualen Anteil einer Option an der Gesamtzahl.
   * @param votes - Stimmen der Option.
   * @param total - Gesamtstimmen der Frage.
   * @returns Der gerundete Prozentsatz.
   */
  getPercentage(votes: number, total: number): number {
    if (total === 0) return 0;
    return Math.round((votes / total) * 100);
  }

  /**
   * Erhöht die Stimmanzahl einer Option lokal und sendet sie an Supabase.
   * @param questionIndex - Index der geänderten Frage.
   * @param optionIndex - Index der gewählten Option.
   */
  registerVote(questionIndex: number, optionIndex: number): void {
    const q = this.selectedSurvey.questions[questionIndex];
    q.options[optionIndex].votes = (q.options[optionIndex].votes || 0) + 1;
    this.supabaseService.submitVote(this.selectedSurvey.id, this.selectedSurvey.questions);
  }
}
