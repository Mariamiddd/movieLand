import { Component, inject, signal, HostListener, ElementRef, viewChild } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { LayoutService } from '../../../core/services/layout.service';
import { NotificationService } from '../../../core/services/notification.service';
import { SearchService } from '../../../core/services/search.service';
import { TmdbService, Movie } from '../../../core/services/tmdb.service';
import { ReportService } from '../../../core/services/report.service';
import { FormsModule } from '@angular/forms';
import { debounceTime, distinctUntilChanged, Subject, switchMap, of } from 'rxjs';
import { toObservable } from '@angular/core/rxjs-interop';

@Component({
  selector: 'app-topbar',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, FormsModule],
  templateUrl: './topbar.component.html',
  styleUrl: './topbar.component.css',
  host: { 'style': 'display: block; position: relative; z-index: 2100;' }
})
export class TopbarComponent {
  readonly authService = inject(AuthService);
  readonly layout = inject(LayoutService);
  readonly notificationService = inject(NotificationService);
  readonly searchService = inject(SearchService);
  readonly tmdb = inject(TmdbService);
  readonly reportService = inject(ReportService);
  private readonly el = inject(ElementRef);
  private readonly router = inject(Router);

  showInbox = signal(false);
  showResults = signal(false);
  isSearchOpen = signal(false);
  searchResults = signal<Movie[]>([]);
  selectedIndex = signal(-1);
  searchInput = viewChild<ElementRef>('searchInput');

  toggleSearch() {
    this.isSearchOpen.update(v => !v);
    if (!this.isSearchOpen()) {
      this.clearSearch();
    } else {
      this.selectedIndex.set(-1);
      setTimeout(() => this.searchInput()?.nativeElement.focus(), 100);
    }
  }


  private searchSubject = new Subject<string>();

  constructor() {
    this.searchSubject.pipe(
      debounceTime(300),
      distinctUntilChanged(),
      switchMap(query => {
        if (!query.trim()) return of([]);
        return this.tmdb.multiSearch(query);
      })
    ).subscribe(results => {
      this.searchResults.set(results);
    });
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    const target = event.target as HTMLElement;

    if (!target.closest('.notification-wrapper')) {
      this.showInbox.set(false);
    }

    if (!this.el.nativeElement.contains(target)) {
      this.showResults.set(false);
    }
  }

  onSearchInput(query: string) {
    this.searchService.setQuery(query);
    this.searchSubject.next(query);
    this.showResults.set(true);
    this.selectedIndex.set(-1);
  }

  onKeyDown(event: KeyboardEvent) {
    if (!this.isSearchOpen() || this.searchResults().length === 0) return;

    const results = this.searchResults().slice(0, 8);

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.selectedIndex.update(i => (i + 1) % results.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.selectedIndex.update(i => (i - 1 + results.length) % results.length);
    } else if (event.key === 'Enter') {
      if (this.selectedIndex() >= 0) {
        event.preventDefault();
        const selected = results[this.selectedIndex()];
        const link = this.getContentLink(selected);
        this.router.navigate(link);
        this.closeAll();
      }
    } else if (event.key === 'Escape') {
      this.toggleSearch();
    }
  }

  onSearchFocus() {
    if (this.searchService.query()) {
      this.showResults.set(true);
    }
  }

  clearSearch() {
    this.searchService.setQuery('');
    this.searchResults.set([]);
    this.showResults.set(false);
  }

  closeAll() {
    this.showResults.set(false);
    this.isSearchOpen.set(false); // Close search when navigating
    this.layout.closeSidebar();
  }

  getContentLink(movie: Movie): string[] {
    return [movie.media_type === 'tv' ? '/tv' : '/movie', movie.id.toString()];
  }

  toggleInbox() {
    if (!this.authService.isAuthenticated()) {
      this.router.navigate(['/auth/sign-in']);
      this.closeAll();
      return;
    }
    this.showInbox.update(v => !v);
  }

  openMessageTab(reportId?: string) {
    this.showInbox.set(false);
    this.router.navigate(['/auth/profile'], {
      queryParams: { tab: 'messages', reportId: reportId }
    });
  }

  onNotificationClick(item: any) {
    this.notificationService.markAsRead(item.id);
    // If it's a system message, it's likely support-related
    if (item.type === 'system' || item.title.includes('Message') || item.title.includes('Report')) {
      this.openMessageTab();
    }
  }


  formatTime(date: Date): string {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);

    if (minutes < 1) return 'now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return date.toLocaleDateString();
  }
}

