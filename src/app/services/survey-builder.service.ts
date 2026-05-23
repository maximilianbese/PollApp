import { Injectable } from '@angular/core';
import { NewOptionDraft, NewQuestionDraft, NewSurveyDraft } from '../models/surveys.models';

@Injectable({ providedIn: 'root' })
export class SurveyBuilderService {
  readonly MAX_QUESTIONS = 3;

  getLetterPrefix(index: number): string {
    return `${String.fromCharCode(65 + index)}.`;
  }

  createEmptyQuestion(): NewQuestionDraft {
    return {
      questionText: '',
      allowMultiple: false,
      options: [
        { label: '', votes: 0 },
        { label: '', votes: 0 },
      ],
    };
  }

  createEmptySurveyDraft(): NewSurveyDraft {
    return {
      title: '',
      description: '',
      endDate: '',
      category: 'Team activities',
      questions: [this.createEmptyQuestion()],
    };
  }

  private mapOption(option: NewOptionDraft, index: number) {
    return {
      letter: String.fromCharCode(65 + index),
      text: option.label,
      votes: 0,
    };
  }

  private mapQuestion(question: NewQuestionDraft) {
    return {
      question_text: question.questionText,
      allow_multiple: question.allowMultiple,
      options: question.options.map((o, i) => this.mapOption(o, i)),
    };
  }

  private toIsoTimestamp(dateString: string): string {
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
      const [y, m, d] = dateString.split('-').map((v) => parseInt(v, 10));
      return new Date(y, m - 1, d).toISOString();
    }
    return new Date(dateString).toISOString();
  }

  buildSurveyPayload(survey: NewSurveyDraft) {
    return {
      title: survey.title,
      description: survey.description || '',
      category: survey.category,
      end_date:
        survey.endDate && survey.endDate.trim() !== '' ? this.toIsoTimestamp(survey.endDate) : null,
      questions: survey.questions.map((q) => this.mapQuestion(q)),
    };
  }

  validateSurveyDraft(survey: NewSurveyDraft): string | null {
    if (!survey.title.trim()) return 'Survey name is required.';

    if (survey.endDate && survey.endDate.trim() !== '') {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const end = new Date(survey.endDate);
      end.setHours(0, 0, 0, 0);
      if (end < today) return 'The end date cannot be in the past.';
    }

    for (let qi = 0; qi < survey.questions.length; qi++) {
      const q = survey.questions[qi];
      if (!q.questionText.trim()) return `Question ${qi + 1} text is required.`;

      for (let oi = 0; oi < q.options.length; oi++) {
        if (!q.options[oi].label.trim()) {
          return `Question ${qi + 1}: Answer ${this.getLetterPrefix(oi)} text is required.`;
        }
      }
    }

    return null;
  }
}
