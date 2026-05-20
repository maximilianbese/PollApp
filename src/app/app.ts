import { Component, OnInit, ViewEncapsulation } from '@angular/core';
import { SupabaseService, Poll, PollQuestion } from './services/supabase';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
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
  surveys$!: Observable<Poll[]>;
  selectedSurvey: Poll | null = null;
  currentFilter: 'active' | 'past' = 'active';
  isCreating = false;
  showPublishOverlay = false;
  isPublishing = false;

  newSurvey = this.initNewSurveyStructure();

  constructor(private supabaseService: SupabaseService) {}

  ngOnInit(): void {
    this.surveys$ = this.supabaseService.surveys$;
  }

  // ─── Navigation ────────────────────────────────────────────────────────────

  openCreateMode(): void {
    this.newSurvey = this.initNewSurveyStructure();
    this.isCreating = true;
    this.selectedSurvey = null;
  }

  cancelCreation(): void {
    this.isCreating = false;
    this.newSurvey = this.initNewSurveyStructure();
  }

  selectSurvey(survey: Poll): void {
    this.isCreating = false;
    this.selectedSurvey = JSON.parse(JSON.stringify(survey));
  }

  goBack(): void {
    this.selectedSurvey = null;
    this.isCreating = false;
  }

  setFilter(filter: 'active' | 'past'): void {
    this.currentFilter = filter;
  }

  // ─── Formular-Hilfsmethoden ────────────────────────────────────────────────

  private initNewSurveyStructure() {
    return {
      title: '',
      description: '',
      endDate: '',
      category: 'Allgemein',
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

  addAnswerOption(qIdx: number): void {
    this.newSurvey.questions[qIdx].options.push({ label: '', votes: 0 });
  }

  removeAnswerOption(qIdx: number, oIdx: number): void {
    this.newSurvey.questions[qIdx].options.splice(oIdx, 1);
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

  removeQuestion(qIdx: number): void {
    this.newSurvey.questions.splice(qIdx, 1);
  }

  // ─── Publish ───────────────────────────────────────────────────────────────

  async publishSurvey(): Promise<void> {
    if (!this.newSurvey.title.trim()) return;
    this.isPublishing = true;

    const created = await this.supabaseService.addSurvey(this.newSurvey);

    this.isPublishing = false;
    this.isCreating = false;
    this.newSurvey = this.initNewSurveyStructure();

    if (created) {
      this.showPublishOverlay = true;
      setTimeout(() => (this.showPublishOverlay = false), 4000);
      this.selectedSurvey = created;
    }
  }

  // ─── Voting ────────────────────────────────────────────────────────────────

  registerVote(qIdx: number, oIdx: number): void {
    if (!this.selectedSurvey) return;

    const q = this.selectedSurvey.questions[qIdx];

    // Logik für Single Choice (Radio Buttons): Setzt andere Votes zurück, falls gewünscht.
    // Da wir aber inkrementell zählen, passen wir den aktuellen Klick an:
    q.options[oIdx].votes = (q.options[oIdx].votes || 0) + 1;

    this.supabaseService.submitVote(this.selectedSurvey.id, this.selectedSurvey.questions);
  }

  // ─── Berechnungen ──────────────────────────────────────────────────────────

  getQuestionTotal(question: PollQuestion): number {
    if (!question || !question.options) return 0;
    return question.options.reduce((sum, o) => sum + (o.votes || 0), 0);
  }

  getPercentage(votes: number, total: number): number {
    if (total === 0) return 0;
    return Math.round((votes / total) * 100);
  }

  getTotalVotes(survey: Poll | null): number {
    if (!survey || !survey.questions) return 0;
    return survey.questions.reduce((sum, q) => sum + this.getQuestionTotal(q), 0);
  }

  formatDate(isoString: string | null): string {
    if (!isoString) return 'Unbegrenzt';
    return new Date(isoString).toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  }

  isActive(survey: Poll): boolean {
    if (!survey.ends_at) return true; // Ohne Enddatum immer aktiv
    return new Date(survey.ends_at) > new Date();
  }

  getFilteredSurveys(surveys: Poll[]): Poll[] {
    if (!surveys) return [];
    return surveys.filter((s) =>
      this.currentFilter === 'active' ? this.isActive(s) : !this.isActive(s),
    );
  }

  daysUntilEnd(endsAt: string | null): string {
    if (!endsAt) return 'Open End';
    const diff = Math.ceil((new Date(endsAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    if (diff < 0) return 'Abgelaufen';
    if (diff === 0) return 'Endet heute';
    if (diff === 1) return 'Endet morgen';
    return `Endet in ${diff} Tagen`;
  }
}
