import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { BehaviorSubject, Observable } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class SupabaseService {
  private supabase: SupabaseClient;
  private _surveys = new BehaviorSubject<any[]>([]);
  public surveys$: Observable<any[]> = this._surveys.asObservable();

  // Deinen anon-Key hier eintragen (beginnt mit eyJ...)
  private url = 'https://ebfiqojuyoxbhtbqairo.supabase.co';
  private key =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImViZmlxb2p1eW94Ymh0YnFhaXJvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxMDg4MjYsImV4cCI6MjA5NDY4NDgyNn0.9PW9upRYNzzJhy8ZR4XImQJQcLrpqCPNS7e41c0WwsY';

  // Welche optionalen Spalten tatsächlich existieren (wird beim ersten Fetch ermittelt)
  private hasEndDate = false;
  private hasDescription = false;
  private hasCategory = false;

  constructor() {
    this.supabase = createClient(this.url, this.key);
    this.fetchSurveys();
    this.setupRealtime();
  }

  async fetchSurveys(): Promise<void> {
    try {
      const { data, error } = await this.supabase
        .from('polls')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.warn('Supabase fetchSurveys Fehler:', error.message);
        return;
      }

      if (data) {
        // Beim ersten Datensatz prüfen welche Spalten vorhanden sind
        if (data.length > 0) {
          const cols = Object.keys(data[0]);
          this.hasEndDate = cols.includes('end_date');
          this.hasDescription = cols.includes('description');
          this.hasCategory = cols.includes('category');
          console.log('Verfügbare Spalten:', cols);
        }
        this._surveys.next(data);
      }
    } catch (e) {
      console.warn('Netzwerkfehler beim Laden:', e);
    }
  }

  async addSurvey(survey: any): Promise<{ data: any; error: any }> {
    const questions = survey.questions.map((q: any) => ({
      question_text: q.questionText,
      allow_multiple: q.allowMultiple,
      options: q.options.map((o: any, i: number) => ({
        letter: String.fromCharCode(65 + i),
        text: o.label,
        votes: 0,
      })),
    }));

    // Basis-Payload — nur Spalten die garantiert existieren
    const payload: any = {
      title: survey.title,
      questions,
    };

    // Optionale Spalten nur hinzufügen wenn sie existieren
    if (this.hasDescription) payload.description = survey.description || '';
    if (this.hasCategory) payload.category = survey.category;
    if (this.hasEndDate) payload.end_date = survey.endDate || null;

    console.log('INSERT payload:', payload);

    try {
      const { data, error } = await this.supabase.from('polls').insert([payload]).select();

      if (error) {
        console.warn('Supabase Insert-Fehler:', error.message);

        // Fallback: Ohne optionale Felder nochmal versuchen
        console.log('Versuche minimalen Insert (nur title + questions)...');
        const { data: d2, error: e2 } = await this.supabase
          .from('polls')
          .insert([{ title: survey.title, questions }])
          .select();

        if (e2) {
          console.warn('Minimaler Insert auch fehlgeschlagen:', e2.message);
          return { data: null, error: e2 };
        }

        await this.fetchSurveys();
        return { data: d2, error: null };
      }

      await this.fetchSurveys();
      return { data, error: null };
    } catch (e: any) {
      console.warn('Netzwerkfehler bei addSurvey:', e);
      return { data: null, error: { message: e?.message || 'Netzwerkfehler' } };
    }
  }

  async submitVote(id: number, updatedQuestions: any[]): Promise<void> {
    try {
      const { error } = await this.supabase
        .from('polls')
        .update({ questions: updatedQuestions })
        .eq('id', id);

      if (error) {
        console.warn('Fehler beim Abstimmen:', error.message);
      } else {
        await this.fetchSurveys();
      }
    } catch (e) {
      console.warn('Netzwerkfehler bei submitVote:', e);
    }
  }

  private setupRealtime(): void {
    this.supabase
      .channel('polls-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'polls' }, () => {
        this.fetchSurveys();
      })
      .subscribe();
  }
}
