import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { BehaviorSubject, Observable } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class SupabaseService {
  /** Die Verbindung zum Supabase-Client. */
  private supabase: SupabaseClient;

  /** Interner Speicher für die geladenen Umfragen. */
  private _surveys = new BehaviorSubject<any[]>([]);

  /** Stream der Umfragen für die Komponenten. */
  public surveys$: Observable<any[]> = this._surveys.asObservable();

  /** Die API-URL deiner Supabase-Instanz. */
  private url = 'https://ebfiqojuyoxbhtbqairo.supabase.co';
  /** Der öffentliche API-Schlüssel deiner Supabase-Instanz. */
  private key = 'sb_publishable_d2V6A5e94S0lFLOExRHp3g_5zCF2gfT';

  /**
   * Initialisiert den Supabase-Client und startet die Datenströme.
   */
  constructor() {
    this.supabase = createClient(this.url, this.key);
    this.fetchSurveys();
    this.setupRealtime();
  }

  /**
   * Lädt alle Umfragen aus der Datenbank absteigend nach Erstelldatum.
   * @returns Ein Promise, das den Ladevorgang abbildet.
   */
  async fetchSurveys(): Promise<void> {
    const { data, error } = await this.supabase
      .from('polls')
      .select('*')
      .order('created_at', { ascending: false });
    if (!error && data) {
      this._surveys.next(data);
    }
  }

  /**
   * Aktualisiert das Fragen-JSON einer Umfrage nach einer Stimmabgabe.
   * @param id - Die ID der zu aktualisierenden Umfrage.
   * @param updatedQuestions - Das modifizierte JSON-Objekt der Fragen.
   * @returns Ein Promise ohne Rückgabewert.
   */
  async submitVote(id: number, updatedQuestions: any[]): Promise<void> {
    await this.supabase.from('polls').update({ questions: updatedQuestions }).eq('id', id);
  }

  /**
   * Abonniert die Postgres-Änderungen, um Echtzeit-Updates zu garantieren.
   */
  private setupRealtime(): void {
    this.supabase
      .channel('schema-db-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'polls' }, () => {
        this.fetchSurveys();
      })
      .subscribe();
  }
}
