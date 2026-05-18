import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app';

/**
 * Startet die Angular-Anwendung mit der korrekten Hauptkomponente.
 */
bootstrapApplication(AppComponent, appConfig).catch((err) => console.error(err));
