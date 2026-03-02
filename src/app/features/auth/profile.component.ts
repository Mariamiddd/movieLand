import { Component, inject, signal, computed, OnInit, effect } from '@angular/core';
import { Router, RouterLink, ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthService, User } from '../../core/services/auth.service';
import { PurchaseService } from '../../core/services/purchase.service';
import { WishlistService } from '../../core/services/wishlist.service';
import { FavoriteService } from '../../core/services/favorites.service';
import { TmdbService, Movie } from '../../core/services/tmdb.service';
import { ReportService } from '../../core/services/report.service';
import { NotificationService } from '../../core/services/notification.service';
import { MovieCardComponent } from '../../shared/components/movie-card/movie-card.component';
import { DatePipe } from '@angular/common';
import { Title, Meta } from '@angular/platform-browser';

import { ProfileHeaderComponent } from './components/profile-header/profile-header.component';
import { ProfileSidebarComponent } from './components/profile-sidebar/profile-sidebar.component';
import { AccountSettingsComponent } from './components/account-settings/account-settings.component';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [
    FormsModule,
    RouterLink,
    MovieCardComponent,
    DatePipe,
    ProfileHeaderComponent,
    ProfileSidebarComponent,
    AccountSettingsComponent
  ],
  templateUrl: './profile.component.html',
  styleUrls: ['./auth.css', './profile.component.css']
})
export class ProfileComponent {
  readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly tmdbService = inject(TmdbService);
  private readonly purchaseService = inject(PurchaseService);
  private readonly wishlistService = inject(WishlistService);
  private readonly favoriteService = inject(FavoriteService);
  private readonly reportService = inject(ReportService);
  private readonly notificationService = inject(NotificationService);
  private readonly titleService = inject(Title);
  private readonly metaService = inject(Meta);

  user = this.authService.currentUser;
  activeTab = signal<'purchases' | 'watchlist' | 'favorites' | 'settings' | 'messages'>('purchases');

  purchases = computed(() => this.purchaseService.getPurchases());
  wishlistItems = computed(() => this.wishlistService.getWishlist());
  favoriteItems = computed(() => this.favoriteService.getFavorites());

  purchaseCount = computed(() => this.purchases().length);
  wishlistCount = computed(() => this.wishlistItems().length);
  favoriteCount = computed(() => this.favoriteItems().length);

  myReports = computed(() => this.reportService.reports().filter(r => r.userId === this.user()?.id));
  unreadMessages = computed(() => this.reportService.messages().filter(m => m.receiverId === this.user()?.id && !m.read).length);

  constructor() {
    effect(() => {
      this.reportService.messages();
      this.scrollToBottom();
    });
  }

  selectedPurchase = signal<any | null>(null);
  reportForm = { reason: 'Movie isn\'t playing', details: '' };
  chatInputs: Record<string, string> = {};

  formData: Partial<User> = {};
  passwordData = {
    oldPassword: '',
    newPassword: ''
  };

  isUpdating = signal(false);
  isChangingPassword = signal(false);
  isDeleting = signal(false);
  successMessage = signal<string | null>(null);
  errorMessage = signal<string | null>(null);

  ngOnInit() {
    this.titleService.setTitle('My Profile | Movieland');
    this.metaService.updateTag({ name: 'description', content: 'Manage your library, watchlist, and account settings.' });

    // Listen for tab changes via query params
    this.route.queryParams.subscribe(params => {
      const tab = params['tab'];
      if (tab && ['purchases', 'watchlist', 'favorites', 'settings', 'messages'].includes(tab)) {
        this.activeTab.set(tab as any);
        if (tab === 'messages') this.scrollToBottom();
      }
    });

    // Load form data
    const currentUser = this.user();
    if (currentUser) {
      this.formData = { ...currentUser };
    }

    // Always attempt to recover posters and ratings if we have any
    this.recoverMissingPosters();
    this.recoverMissingRatings();
  }

  private recoverMissingPosters() {
    const currentPurchases = this.purchases();
    currentPurchases.forEach(purchase => {
      if (!purchase.posterPath) {
        // Try movie first
        this.tmdbService.getMovieDetails(purchase.movieId.toString()).subscribe({
          next: (movie) => {
            if (movie.poster_path) {
              this.purchaseService.updatePurchasePoster(purchase.movieId, movie.poster_path);
            }
          },
          error: () => {
            // If movie fails, try TV
            this.tmdbService.getTvDetails(purchase.movieId.toString()).subscribe({
              next: (tv) => {
                if (tv.poster_path) {
                  this.purchaseService.updatePurchasePoster(purchase.movieId, tv.poster_path);
                }
              }
            });
          }
        });
      }
    });
  }

  private recoverMissingRatings() {
    this.wishlistItems().forEach(item => {
      // Check for missing rating OR missing release date
      if (!item.rating || item.rating === 0 || !item.releaseDate) {
        this.tmdbService.getMovieDetails(item.movieId.toString()).subscribe({
          next: (m) => {
            if (!item.rating) this.wishlistService.updateRating(item.movieId, m.vote_average);
            if (!item.releaseDate && m.release_date) this.wishlistService.updateMetadata(item.movieId, m.release_date, 'movie');
          },
          error: () => {
            this.tmdbService.getTvDetails(item.movieId.toString()).subscribe({
              next: (tv) => {
                if (!item.rating) this.wishlistService.updateRating(item.movieId, tv.vote_average);
                if (!item.releaseDate && tv.first_air_date) this.wishlistService.updateMetadata(item.movieId, tv.first_air_date, 'tv');
              }
            });
          }
        });
      }
    });

    this.favoriteItems().forEach(item => {
      if (!item.rating || item.rating === 0 || !item.releaseDate) {
        this.tmdbService.getMovieDetails(item.movieId.toString()).subscribe({
          next: (m) => {
            if (!item.rating) this.favoriteService.updateRating(item.movieId, m.vote_average);
            if (!item.releaseDate && m.release_date) {
              this.favoriteService.updateMetadata(item.movieId, m.release_date, 'movie');
            } else if (!item.mediaType && item.releaseDate) {
              this.favoriteService.updateMetadata(item.movieId, item.releaseDate, 'movie');
            }
          },
          error: () => {
            this.tmdbService.getTvDetails(item.movieId.toString()).subscribe({
              next: (tv) => {
                if (!item.rating) this.favoriteService.updateRating(item.movieId, tv.vote_average);
                if (!item.releaseDate && tv.first_air_date) {
                  this.favoriteService.updateMetadata(item.movieId, tv.first_air_date, 'tv');
                } else if (!item.mediaType && item.releaseDate) {
                  this.favoriteService.updateMetadata(item.movieId, item.releaseDate, 'tv');
                }
              }
            });
          }
        });
      }
    });
  }



  getPosterUrl(path: string | null): string {
    return this.tmdbService.getPosterUrl(path);
  }

  getPurchaseLink(purchase: any): string[] {
    const type = purchase.mediaType || 'movie';
    return [type === 'movie' ? '/movie' : '/tv', purchase.movieId.toString()];
  }

  formatDate(date: Date): string {
    const now = new Date();
    const diff = now.getTime() - new Date(date).getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days} days ago`;
    if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
    return new Date(date).toLocaleDateString();
  }

  updateProfile() {
    this.isUpdating.set(true);
    this.successMessage.set(null);
    this.errorMessage.set(null);

    // Filter out immutable fields that the API rejects
    const { id, _id, email, role, ...updateData } = this.formData as any;

    this.authService.updateProfile(updateData).subscribe({
      next: () => {
        this.isUpdating.set(false);
        this.successMessage.set('Profile updated successfully!');
        setTimeout(() => this.successMessage.set(null), 3000);
      },
      error: (error) => {
        this.isUpdating.set(false);
        this.errorMessage.set(
          error.error?.error ||
          error.error?.message ||
          (typeof error.error === 'string' ? error.error : 'Failed to update profile')
        );
      }
    });
  }

  changePassword() {
    if (!this.passwordData.oldPassword || !this.passwordData.newPassword) {
      this.errorMessage.set('Please fill in all password fields');
      return;
    }

    if (this.passwordData.newPassword.length < 8) {
      this.errorMessage.set('New password must be at least 8 characters');
      return;
    }

    this.isChangingPassword.set(true);
    this.successMessage.set(null);
    this.errorMessage.set(null);

    this.authService.changePassword(
      this.passwordData.oldPassword,
      this.passwordData.newPassword
    ).subscribe({
      next: () => {
        this.isChangingPassword.set(false);
        this.successMessage.set('Password changed successfully!');
        this.passwordData = { oldPassword: '', newPassword: '' };
        setTimeout(() => this.successMessage.set(null), 3000);
      },
      error: (error) => {
        this.isChangingPassword.set(false);
        this.errorMessage.set(
          error.error?.error ||
          error.error?.message ||
          (typeof error.error === 'string' ? error.error : 'Failed to change password')
        );
      }
    });
  }

  confirmDelete() {
    const confirmed = confirm(
      'Are you sure you want to delete your account? This action cannot be undone.'
    );

    if (confirmed) {
      this.isDeleting.set(true);
      this.authService.deleteAccount().subscribe({
        error: (error) => {
          this.isDeleting.set(false);
          this.errorMessage.set(error.error?.error || 'Failed to delete account');
        }
      });
    }
  }

  openReportModal(purchase: any) {
    this.selectedPurchase.set(purchase);
    this.reportForm = { reason: 'Movie isn\'t playing', details: '' };
  }

  submitReport() {
    const user = this.user();
    const purchase = this.selectedPurchase();
    if (!user || !purchase) return;

    this.reportService.submitReport({
      userId: user.id,
      userEmail: user.email,
      userName: `${user.firstName} ${user.lastName}`,
      movieId: purchase.movieId,
      movieTitle: purchase.movieTitle,
      reason: this.reportForm.reason,
      details: this.reportForm.details
    });

    this.notificationService.show('Report Submitted', 'We will review it shortly.', 'success');
    this.selectedPurchase.set(null);
  }

  getMessages(reportId: string) {
    return this.reportService.messages()
      .filter(m => m.reportId === reportId)
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  sendReply(report: any) {
    const msg = this.chatInputs[report.id];
    if (!msg) return;

    this.reportService.sendMessage({
      senderId: this.user()?.id || 'unknown',
      receiverId: 'admin',
      reportId: report.id,
      message: msg
    });

    this.chatInputs[report.id] = '';
    this.scrollToBottom();
  }

  private scrollToBottom() {
    setTimeout(() => {
      const chatContainers = document.querySelectorAll('.chat-bubbles');
      chatContainers.forEach(container => {
        container.scrollTop = container.scrollHeight;
      });
    }, 100);
  }

  deleteMessage(messageId: string) {
    this.reportService.deleteMessage(messageId);
    this.notificationService.show('Success', 'Message deleted', 'info');
  }

  removePurchase(movieId: number) {
    const purchase = this.purchaseService.getPurchase(movieId);
    if (!purchase) return;

    if (confirm(`Remove "${purchase.movieTitle}" from your library? This action cannot be undone.`)) {
      this.purchaseService.removePurchase(movieId);
      this.notificationService.show('Success', 'Movie removed from library', 'success');
    }
  }
}
