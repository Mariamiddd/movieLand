import { Component, inject, signal, computed, OnInit, input, effect } from '@angular/core';
import { DatePipe, UpperCasePipe, DecimalPipe } from '@angular/common';
import { ActivatedRoute, RouterLink, Router } from '@angular/router';
import { Location } from '@angular/common';
import { TmdbService, Movie, Cast } from '../../core/services/tmdb.service';
import { AuthService } from '../../core/services/auth.service';
import { PurchaseService } from '../../core/services/purchase.service';
import { WishlistService } from '../../core/services/wishlist.service';
import { FavoriteService } from '../../core/services/favorites.service';
import { NotificationService } from '../../core/services/notification.service';
import { LoaderComponent } from '../../shared/components/loader/loader.component';
import { DomSanitizer, SafeResourceUrl, Title, Meta } from '@angular/platform-browser';

@Component({
  selector: 'app-movie-details',
  standalone: true,
  imports: [DatePipe, UpperCasePipe, DecimalPipe, LoaderComponent],
  templateUrl: './movie-details.component.html',
  styleUrls: ['./movie-details.component.css']
})
export class MovieDetailsComponent implements OnInit {
  // Signal Inputs (Bound via Router)
  id = input.required<string>();
  type = input<'movie' | 'tv'>('movie');

  // Dependencies using inject()
  private readonly tmdbService = inject(TmdbService);
  private readonly location = inject(Location);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly purchaseService = inject(PurchaseService);
  private readonly wishlistService = inject(WishlistService);
  private readonly favoriteService = inject(FavoriteService);
  private readonly notificationService = inject(NotificationService);
  private readonly router = inject(Router);
  private readonly titleService = inject(Title);
  private readonly metaService = inject(Meta);
  readonly authService = inject(AuthService);

  // State using Signals
  movie = signal<Movie | null>(null);
  cast = signal<Cast[]>([]);
  isLoading = signal(false);
  errorMessage = signal<string | null>(null);

  isPurchasing = signal(false);
  showTrailer = signal(false);
  trailerKey = signal<string | null>(null);

  constructor() {
    // Automatically reload data when inputs change
    effect(() => {
      this.loadData(this.id(), this.type());
    });
  }

  // Computed state
  isInWishlist = computed(() => {
    const m = this.movie();
    return m ? this.wishlistService.isInWishlist(m.id) : false;
  });

  isInFavorites = computed(() => {
    const m = this.movie();
    return m ? this.favoriteService.isInFavorites(m.id) : false;
  });

  hasPurchased = computed(() => {
    const m = this.movie();
    return m ? this.purchaseService.hasPurchased(m.id) : false;
  });

  ngOnInit() {
    // Meta updates handled in effect or directly here
  }

  private loadData(id: string, type: 'movie' | 'tv') {

    this.isLoading.set(true);
    this.errorMessage.set(null);

    const request$ = type === 'tv'
      ? this.tmdbService.getTvDetails(id)
      : this.tmdbService.getMovieDetails(id);

    request$.subscribe({
      next: (data) => {
        this.movie.set(data);
        if (data) {
          const title = data.title || data.name || 'Details';
          this.titleService.setTitle(`${title} | Movieland`);
          this.metaService.updateTag({ name: 'description', content: data.overview || `View details for ${title}` });

          this.loadTrailer(data.id, type);
          this.loadCredits(data.id, type);
        }
        setTimeout(() => this.isLoading.set(false), 350);
      },
      error: () => {
        this.errorMessage.set('Failed to load details. Please try again.');
        setTimeout(() => this.isLoading.set(false), 350);
      }
    });
  }

  private loadCredits(id: number, type: 'movie' | 'tv') {
    this.tmdbService.getCredits(id, type).subscribe({
      next: (cast) => this.cast.set(cast.slice(0, 10)),
      error: () => this.cast.set([])
    });
  }

  getPosterUrl(path: string | null): string {
    return this.tmdbService.getPosterUrl(path);
  }

  getCastImageUrl(path: string | null): string {
    return path ? `https://image.tmdb.org/t/p/w185${path}` : 'https://via.placeholder.com/185x278.png?text=No+Photo';
  }

  getBackdropUrl(path: string | null | undefined): string {
    const p = path || this.movie()?.backdrop_path;
    return p ? `https://image.tmdb.org/t/p/original${p}` : '';
  }

  goBack(): void {
    this.location.back();
  }

  purchaseMovie(): void {
    const m = this.movie();
    if (!m || !this.checkAuth('purchase movies')) return;

    this.isPurchasing.set(true);

    setTimeout(() => {
      const success = this.purchaseService.purchaseMovie(
        m.id,
        m.title || m.name || 'Unknown',
        m.poster_path,
        4.99,
        this.type() // Use component type input
      );

      this.isPurchasing.set(false);

      if (success) {
        this.notificationService.show(
          'Purchase Successful',
          `You can now watch "${m.title || m.name}"`,
          'success'
        );
        this.showTrailer.set(true);
      }
    }, 1500);
  }

  toggleTrailer(): void {
    this.showTrailer.update(v => !v);
  }

  toggleWishlist(): void {
    const m = this.movie();
    if (!m || !this.checkAuth('add movies to your wishlist')) return;

    if (this.isInWishlist()) {
      this.wishlistService.removeFromWishlist(m.id);
    } else {
      this.wishlistService.addToWishlist(
        m.id,
        m.title || m.name || 'Unknown',
        m.poster_path,
        m.vote_average,
        m.release_date || m.first_air_date,
        this.type()
      );
    }
  }

  toggleFavorite(): void {
    const m = this.movie();
    if (!m || !this.checkAuth('add movies to your favorites')) return;

    if (this.isInFavorites()) {
      this.favoriteService.removeFromFavorites(m.id);
    } else {
      this.favoriteService.addToFavorites(
        m.id,
        m.title || m.name || 'Unknown',
        m.poster_path,
        m.vote_average,
        m.release_date || m.first_air_date,
        this.type()
      );
    }
  }

  getTrailerUrl(): SafeResourceUrl {
    const key = this.trailerKey();
    if (!key) {
      return this.sanitizer.bypassSecurityTrustResourceUrl('');
    }
    return this.sanitizer.bypassSecurityTrustResourceUrl(
      `https://www.youtube.com/embed/${key}?autoplay=1&rel=0`
    );
  }

  private loadTrailer(movieId: number, type: 'movie' | 'tv'): void {
    this.tmdbService.getBestTrailer(movieId, type).subscribe({
      next: key => this.trailerKey.set(key),
      error: () => this.trailerKey.set(null),
    });
  }

  private checkAuth(action: string): boolean {
    if (!this.authService.isAuthenticated()) {
      this.notificationService.show(
        'Authentication Required',
        `Please sign in to ${action}.`,
        'info',
        {
          label: 'Sign In',
          callback: () => this.router.navigate(['/auth/sign-in']),
        }
      );
      return false;
    }
    return true;
  }
}
