import { Component, OnInit } from '@angular/core';
import { SupabaseService } from './services/supabase';
import { CommonModule } from '@angular/common';
import { Observable } from 'rxjs';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './app.html',
  styleUrls: ['./app.scss'],
})
export class AppComponent implements OnInit {
  // Erst mal nur definieren, ohne "this" zu nutzen
  polls$!: Observable<any[]>;

  constructor(private supabaseService: SupabaseService) {}

  ngOnInit() {
    // Hier ist der Service bereit, jetzt weisen wir es sicher zu
    this.polls$ = this.supabaseService.polls$;
  }

  onVote(pollId: number, optionColumn: 'votes_a' | 'votes_b', currentVotes: number) {
    this.supabaseService.vote(pollId, optionColumn, currentVotes);
  }
}
