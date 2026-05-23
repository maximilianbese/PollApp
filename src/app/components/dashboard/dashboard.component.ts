/**
 * @fileoverview Dashboard component rendering the hero section,
 * "Ending soon" cards, filter tabs, and the main surveys grid.
 */

import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from '@angular/core';
import { NgFor, NgIf } from '@angular/common';
import { Survey, SurveyFilter } from '../../models/surveys.models';
import { getActiveSurveys, getPastSurveys, getEndingSoonSurveys } from '../../utils/survey.utils';
import { EndingSoonCardComponent } from '../ending-soon-card/ending-soon-card.component';
import { FilterBarComponent } from '../filter-bar/filter-bar.component';
import { SurveyCardComponent } from '../survey-card/survey-card.component';

/**
 * Top-level dashboard view.
 * Displays the hero banner, ending-soon highlights, filter tabs, and the
 * full paginated survey list. All navigation events are emitted to the root
 * component for state management.
 *
 * @example
 * ```html
 * <app-dashboard
 *   [surveys]="surveys$ | async"
 *   [currentFilter]="filter"
 *   (filterChanged)="filter = $event"
 *   (surveySelected)="openSurvey($event)"
 *   (createClicked)="openCreateMode()"
 * />
 * ```
 */
@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [NgFor, NgIf, EndingSoonCardComponent, FilterBarComponent, SurveyCardComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './dashboard.component.html',
})
export class DashboardComponent {
  /** Full list of surveys loaded from the reactive stream. */
  @Input({ required: true }) surveys!: Survey[];

  /** Currently active filter tab. */
  @Input({ required: true }) currentFilter!: SurveyFilter;

  /** Emits the newly selected filter when the user switches tabs. */
  @Output() filterChanged = new EventEmitter<SurveyFilter>();

  /** Emits the survey the user wants to open. */
  @Output() surveySelected = new EventEmitter<Survey>();

  /** Emits when the user clicks the "New survey" button in the hero. */
  @Output() createClicked = new EventEmitter<void>();

  /** Surveys whose deadline is approaching soonest (max 3). */
  get endingSoon(): Survey[] {
    return getEndingSoonSurveys(this.surveys);
  }

  /** Surveys matching the currently selected filter tab. */
  get filteredSurveys(): Survey[] {
    return this.currentFilter === 'past'
      ? getPastSurveys(this.surveys)
      : getActiveSurveys(this.surveys);
  }

  /** Label shown in the empty-state message when no surveys match the filter. */
  get emptyStateMessage(): string {
    return this.currentFilter === 'past' ? 'No past surveys yet.' : 'No active surveys yet.';
  }
}
