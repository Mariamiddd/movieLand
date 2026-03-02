import { Component, inject, signal, computed, OnInit, effect, ViewChild, ElementRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TmdbService, Movie, Genre } from '../../core/services/tmdb.service';
import { MovieCardComponent } from '../../shared/components/movie-card/movie-card.component';
import { FigmaSelectComponent, SelectOption } from '../../shared/components/figma-select/figma-select.component';
import { LoaderComponent } from '../../shared/components/loader/loader.component';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { SearchService } from '../../core/services/search.service';
import { ThemeService, MOODS } from '../../core/services/theme.service';
import { Title, Meta } from '@angular/platform-browser';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [FormsModule, MovieCardComponent, RouterLink, FigmaSelectComponent, LoaderComponent],
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.css'],
})
export class HomeComponent implements OnInit {
  @ViewChild('scrollContainer') scrollContainer!: ElementRef<HTMLDivElement>;

  // Dependencies using inject()
  private tmdbService = inject(TmdbService);
  readonly authService = inject(AuthService);
  readonly searchService = inject(SearchService);
  readonly themeService = inject(ThemeService);
  private titleService = inject(Title);
  private metaService = inject(Meta);

  scrollMovies(direction: 'left' | 'right') {
    const container = this.scrollContainer.nativeElement;
    const scrollAmount = container.clientWidth * 0.8;
    container.scrollBy({
      left: direction === 'left' ? -scrollAmount : scrollAmount,
      behavior: 'smooth'
    });
  }

  moods = MOODS;
  currentMood = this.themeService.currentMood;
  movies = signal<Movie[]>([]);
  isLoading = signal(false);
  isLoadingMore = signal(false);
  errorMessage = signal<string | null>(null);
  currentPage = signal(1);
  intensity = signal<'Standard' | 'Premium' | 'Masterpiece'>('Premium');

  // For the genre pills
  allGenres = signal<Genre[]>([]);
  activeGenre = signal<string | null>(null);

  // Computed state for structured layout
  // We filter out movies without posters for a premium look
  validMovies = computed(() => this.movies().filter(m => !!m.poster_path));

  featuredMovie = computed(() => this.validMovies().length > 0 ? this.validMovies()[0] : null);

  // Computed Options for Figma Select
  moodOptions: SelectOption[] = MOODS.map(m => ({
    label: m.label,
    value: m.id
  }));

  intensityOptions: SelectOption[] = [
    { label: 'Standard', value: 'Standard' },
    { label: 'Premium', value: 'Premium' },
    { label: 'Masterpiece', value: 'Masterpiece' }
  ];

  subGenreOptions = computed<SelectOption[]>(() => [
    { label: 'All', value: '' },
    ...this.getMoodGenres().map(g => ({ label: g.name, value: g.id.toString() }))
  ]);



  constructor() {


    // React to mood or intensity changes
    effect(() => {
      const mood = this.currentMood();
      const level = this.intensity();
      // Update global glow based on mood color
      // this.themeService.setActiveColor(mood.color); // Removed to prevent background color changes on refresh

      this.currentPage.set(1);
      this.activeGenre.set(null); // Reset sub-filter on main mood change
      this.loadData('');
    });
  }

  ngOnInit() {
    this.titleService.setTitle('movieLand | Premium Cinematic Workspace');
    this.metaService.updateTag({ name: 'description', content: 'Experience movies through your mood with our high-fidelity selector.' });

    // Load available genres for the pills
    this.tmdbService.getGenres('movie').subscribe(genres => this.allGenres.set(genres));

    // Ensure state is fresh when landing on home
    this.searchService.setQuery('');
    this.loadData('');
  }

  private loadData(query: string, append: boolean = false) {
    if (append) {
      this.isLoadingMore.set(true);
    } else {
      this.isLoading.set(true);
    }
    this.errorMessage.set(null);

    let request$;
    if (query.trim()) {
      request$ = this.tmdbService.multiSearch(query, this.currentPage());
    } else {
      // If no query, we use the mood to filter trending or discover movies
      const mood = this.currentMood();
      const level = this.intensity();

      // Map quality tier to API parameters
      const config = {
        'Standard': { minRating: '6.0', minVoteCount: '100' },
        'Premium': { minRating: '7.2', minVoteCount: '500' },
        'Masterpiece': { minRating: '8.2', minVoteCount: '1500' }
      }[level];

      request$ = this.tmdbService.getMovies({
        genreId: this.activeGenre() || mood.genres.join('|'),
        sortBy: 'vote_average.desc',
        minRating: config.minRating,
        minVoteCount: config.minVoteCount
      }, this.currentPage());
    }

    request$.subscribe({
      next: (data) => {
        if (append) {
          this.movies.update(prev => {
            const combined = [...prev, ...data];
            // Deduplicate by ID
            return Array.from(new Map(combined.map(movie => [movie.id, movie])).values());
          });
        } else {
          // Even for a single page, ensure uniqueness
          const unique = Array.from(new Map(data.map(movie => [movie.id, movie])).values());
          this.movies.set(unique);
        }
        setTimeout(() => {
          this.isLoading.set(false);
          this.isLoadingMore.set(false);
        }, 350);
      },
      error: () => {
        this.errorMessage.set('Failed to load content. Please check your connection.');
        setTimeout(() => {
          this.isLoading.set(false);
          this.isLoadingMore.set(false);
        }, 350);
      }
    });
  }

  loadMore() {
    this.currentPage.update(p => p + 1);
    this.loadData(this.searchService.query(), true);
  }

  refreshContent() {
    this.searchService.setQuery('');
    this.currentPage.set(1);
    this.loadData('');
  }

  getMoodGenres(): Genre[] {
    const moodGenreIds = this.currentMood().genres;
    return this.allGenres().filter(g => moodGenreIds.includes(g.id.toString()));
  }

  setIntensity(level: 'Standard' | 'Premium' | 'Masterpiece') {
    this.intensity.set(level);
  }

  toggleGenre(genreId: string) {
    if (this.activeGenre() === genreId) {
      this.activeGenre.set(null);
    } else {
      this.activeGenre.set(genreId);
    }
    this.currentPage.set(1);
    this.loadData('');
  }
}
