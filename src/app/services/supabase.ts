import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { BehaviorSubject, Observable } from 'rxjs';

export interface PollOption {
  text: string;
  votes: number;
  letter?: string;
}

export interface PollQuestion {
  question_text: string;
  allow_multiple: boolean;
  options: PollOption[];
}

export interface Poll {
  id: number;
  created_at: string;
  title: string;
  description: string;
  category: string;
  ends_at: string | null;
  questions: PollQuestion[];
}

@Injectable({ providedIn: 'root' })
export class SupabaseService {
  private supabase: SupabaseClient;
  private _surveys = new BehaviorSubject<Poll[]>([]);
  public surveys$: Observable<Poll[]> = this._surveys.asObservable();

  private url = 'https://ebfiqojuyoxbhtbqairo.supabase.co';
  private key =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImViZmlxb2p1eW94Ymh0YnFhaXJvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxMDg4MjYsImV4cCI6MjA5NDY4NDgyNn0.9PW9upRYNzzJhy8ZR4XImQJQcLrpqCPNS7e41c0WwsY';

  constructor() {
    this.supabase = createClient(this.url, this.key);
    this.fetchSurveys();
    this.setupRealtime();
  }

  async fetchSurveys(): Promise<void> {
    const { data, error } = await this.supabase
      .from('polls')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('fetchSurveys error:', error);
      return;
    }
    if (data) {
      this._surveys.next(data.map((p: any) => this.normalizePoll(p)));
    }
  }

  async addSurvey(draft: {
    title: string;
    description: string;
    endDate: string;
    category: string;
    questions: Array<{
      questionText: string;
      allowMultiple: boolean;
      options: Array<{ label: string; votes: number }>;
    }>;
  }): Promise<Poll | null> {
    const questions: PollQuestion[] = draft.questions.map((q) => ({
      question_text: q.questionText,
      allow_multiple: q.allowMultiple,
      options: q.options
        .filter((o) => o.label.trim())
        .map((o) => ({ text: o.label.trim(), votes: 0 })),
    }));

    const payload: Record<string, any> = {
      title: draft.title.trim(),
      description: draft.description.trim(),
      category: draft.category.trim() || 'Allgemein',
      questions,
    };

    if (draft.endDate && draft.endDate.trim()) {
      const parts = draft.endDate.trim().split('.');
      if (parts.length === 3) {
        const iso = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
        if (!isNaN(Date.parse(iso))) payload['ends_at'] = new Date(iso).toISOString();
      }
    }

    const { data, error } = await this.supabase.from('polls').insert([payload]).select().single();
    if (error) {
      console.error('addSurvey error:', error);
      return null;
    }
    await this.fetchSurveys();
    return this.normalizePoll(data);
  }

  async submitVote(id: number, updatedQuestions: PollQuestion[]): Promise<void> {
    const { error } = await this.supabase
      .from('polls')
      .update({ questions: updatedQuestions })
      .eq('id', id);
    if (error) console.error('submitVote error:', error);
  }

  private normalizePoll(raw: any): Poll {
    let rawQuestions = raw.questions;

    // JSONB Sicherheits-Parsing
    if (typeof rawQuestions === 'string') {
      try {
        rawQuestions = JSON.parse(rawQuestions);
      } catch (e) {
        console.error('Error parsing questions string:', e);
        rawQuestions = [];
      }
    }

    const questions: PollQuestion[] = (rawQuestions ?? []).map((q: any) => ({
      question_text: q.question_text ?? q.questionText ?? '',
      allow_multiple: q.allow_multiple ?? q.allowMultiple ?? false,
      options: (q.options ?? []).map((o: any, i: number) => ({
        text: o.text ?? o.label ?? '',
        votes: o.votes ?? 0,
        letter: o.letter ?? String.fromCharCode(65 + i),
      })),
    }));

    return {
      id: raw.id,
      created_at: raw.created_at,
      title: raw.title ?? '',
      description: raw.description ?? '',
      category: raw.category ?? 'Allgemein',
      ends_at: raw.ends_at ?? null,
      questions,
    };
  }

  private setupRealtime(): void {
    this.supabase
      .channel('polls-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'polls' }, () =>
        this.fetchSurveys(),
      )
      .subscribe();
  }
}
