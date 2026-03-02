import { Component, input, inject, computed } from '@angular/core';
import { RouterLink, Router } from '@angular/router';
import { TmdbService, Movie } from '../../../core/services/tmdb.service';
import { WishlistService } from '../../../core/services/wishlist.service';
import { FavoriteService } from '../../../core/services/favorites.service';
import { AuthService } from '../../../core/services/auth.service';
import { NotificationService } from '../../../core/services/notification.service';
import { ThemeService } from '../../../core/services/theme.service';

@Component({
  selector: 'app-movie-card',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './movie-card.component.html',
  styleUrls: ['./movie-card.component.css'],
  host: { 'style': 'display: block;' }
})
export class MovieCardComponent {
  movie = input.required<Movie>();
  type = input<'movie' | 'tv'>('movie');

  private readonly tmdbService = inject(TmdbService);
  private readonly wishlistService = inject(WishlistService);
  private readonly favoriteService = inject(FavoriteService);
  private readonly authService = inject(AuthService);
  private readonly notificationService = inject(NotificationService);
  private readonly themeService = inject(ThemeService);
  private readonly router = inject(Router);

  isInWishlist = computed(() => this.wishlistService.isInWishlist(this.movie().id));
  isInFavorites = computed(() => this.favoriteService.isInFavorites(this.movie().id));

  displayType = computed(() => {
    const contentType = this.movie().media_type || this.type();
    return contentType === 'tv' ? 'SERIES' : 'FILM';
  });

  getPosterUrl(path: string | null): string {
    return this.tmdbService.getPosterUrl(path);
  }

  getYear(date?: string): string {
    return this.tmdbService.getYear(date);
  }

  getLanguageName(code?: string): string {
    return this.tmdbService.getLanguageName(code);
  }

  getContentLink(): string[] {
    const contentType = this.movie().media_type || this.type();
    return [contentType === 'movie' ? '/movie' : '/tv', this.movie().id.toString()];
  }

  toggleWishlist(event: Event): void {
    event.stopPropagation();
    event.preventDefault();

    if (!this.checkAuth()) return;

    if (this.isInWishlist()) {
      this.wishlistService.removeFromWishlist(this.movie().id);
    } else {
      this.wishlistService.addToWishlist(
        this.movie().id,
        this.movie().title || this.movie().name || 'Unknown',
        this.movie().poster_path,
        this.movie().vote_average,
        this.movie().release_date || this.movie().first_air_date,
        this.type()
      );
    }
  }

  toggleFavorite(event: Event): void {
    event.stopPropagation();
    event.preventDefault();

    if (!this.checkAuth()) return;

    if (this.isInFavorites()) {
      this.favoriteService.removeFromFavorites(this.movie().id);
    } else {
      this.favoriteService.addToFavorites(
        this.movie().id,
        this.movie().title || this.movie().name || 'Unknown',
        this.movie().poster_path,
        this.movie().vote_average,
        this.movie().release_date || this.movie().first_air_date,
        this.type()
      );
    }
  }

  private checkAuth(): boolean {
    if (!this.authService.isAuthenticated()) {
      this.notificationService.show(
        'Authentication',
        'Please sign in to add movies to your lists.',
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
