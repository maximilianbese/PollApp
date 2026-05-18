import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app'; // Von 'App' zu 'AppComponent' geändert

bootstrapApplication(AppComponent, appConfig).catch((err) => console.error(err));
