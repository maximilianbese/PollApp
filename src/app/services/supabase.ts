import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { BehaviorSubject } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class SupabaseService {
  private supabase: SupabaseClient;

  // Hier werden unsere Umfragen gespeichert, damit Komponenten darauf zugreifen können
  private _polls = new BehaviorSubject<any[]>([]);
  public polls$ = this._polls.asObservable();

  // ⚠️ ERSETZE DIESE BEIDEN STRINGS MIT DEINEN ECHTEN ZUGANGSDATEN AUS SUPABASE
  private supabaseUrl = 'https://ebfiqojuyoxbhtbqairo.supabase.co';
  private supabaseKey = 'sb_publishable_d2V6A5e94S0lFLOExRHp3g_5zCF2gfT';

  constructor() {
    // Verbindung zu Supabase herstellen
    this.supabase = createClient(this.supabaseUrl, this.supabaseKey);

    // Direkt beim Start Daten laden und Echtzeit-Updates aktivieren
    this.fetchPolls();
    this.setupRealtime();
  }

  // 1. Daten live aus der Datenbank abfragen
  async fetchPolls() {
    const { data, error } = await this.supabase
      .from('polls') // Name deiner Tabelle
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Fehler beim Laden der Polls:', error);
    } else {
      this._polls.next(data || []);
    }
  }

  // 2. Voting-Funktion: Stimme in der DB um 1 erhöhen
  async vote(pollId: number, optionColumn: 'votes_a' | 'votes_b', currentVotes: number) {
    const updateData: { [key: string]: number } = {};
    updateData[optionColumn] = currentVotes + 1;

    const { error } = await this.supabase.from('polls').update(updateData).eq('id', pollId);

    if (error) {
      console.error('Fehler beim Abstimmen:', error);
    }
  }

  // 3. Realtime: Sofort reagieren, wenn in der DB abgestimmt wird
  private setupRealtime() {
    this.supabase
      .channel('schema-db-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'polls' }, () => {
        // Bei jeder Änderung in der DB laden wir die Daten automatisch neu
        this.fetchPolls();
      })
      .subscribe();
  }
}
