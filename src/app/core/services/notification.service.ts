import { Injectable, signal, computed } from '@angular/core';

export interface Notification {
    title: string;
    message: string;
    type: 'info' | 'success' | 'error';
    action?: {
        label: string;
        callback: () => void;
    };
}

export interface InboxItem {
    id: string;
    title: string;
    message: string;
    timestamp: Date;
    read: boolean;
    type: 'purchase' | 'favorite' | 'system';
}

@Injectable({
    providedIn: 'root'
})
export class NotificationService {
    currentNotification = signal<Notification | null>(null);
    private inboxSignal = signal<InboxItem[]>([]);
    private currentUserId: string | null = null;

    inbox = computed(() => this.inboxSignal());
    unreadCount = computed(() => this.inboxSignal().filter(item => !item.read).length);

    constructor() {
        const userStr = localStorage.getItem('current_user');
        if (userStr) {
            try {
                const user = JSON.parse(userStr);
                if (user && user.id) {
                    this.initializeForUser(user.id);
                }
            } catch (e) {
                this.loadInbox();
            }
        } else {
            this.loadInbox();
        }

        // Add storage listener for cross-tab synchronization (important for mock admin notifications)
        window.addEventListener('storage', (event) => {
            if (event.key === this.storageKey) {
                this.loadInbox();
            }
        });
    }

    initializeForUser(userId: string) {
        this.currentUserId = userId;
        this.loadInbox();
    }

    private get storageKey(): string {
        return this.currentUserId ? `inbox_${this.currentUserId}` : 'user_inbox';
    }

    show(title: string, message: string, type: 'info' | 'success' | 'error' = 'info', action?: { label: string; callback: () => void }) {
        this.currentNotification.set({ title, message, type, action });

        if (!action) {
            setTimeout(() => {
                const current = this.currentNotification();
                if (current && current.title === title && current.message === message) {
                    this.clear();
                }
            }, 5000);
        }
    }

    clear() {
        this.currentNotification.set(null);
    }

    // Inbox Management
    addInboxItem(title: string, message: string, type: 'purchase' | 'favorite' | 'system') {
        const newItem: InboxItem = {
            id: crypto.randomUUID(),
            title,
            message,
            timestamp: new Date(),
            read: false,
            type
        };

        this.inboxSignal.update(items => [newItem, ...items]);
        this.saveInbox();

        // Also show a toast notification for immediate feedback
        this.show(title, message, type === 'purchase' || type === 'favorite' ? 'success' : 'info');
    }

    /**
     * Internal mock helper to add a notification to another user's inbox
     * In a real app, this would be a backend push notification/socket event
     */
    addSystemNotificationForUser(userId: string, title: string, message: string) {
        const key = `inbox_${userId}`;
        const stored = localStorage.getItem(key);
        let items: InboxItem[] = [];

        if (stored) {
            try {
                items = JSON.parse(stored);
            } catch (e) {
                items = [];
            }
        }

        const newItem: InboxItem = {
            id: crypto.randomUUID(),
            title,
            message,
            timestamp: new Date(),
            read: false,
            type: 'system'
        };

        items = [newItem, ...items];
        localStorage.setItem(key, JSON.stringify(items));

        // If the current user is the recipient, update the signal
        if (this.currentUserId === userId) {
            this.inboxSignal.set(items.map(i => ({ ...i, timestamp: new Date(i.timestamp) })));
            this.show(title, message, 'info');
        }
    }

    markAsRead(id: string) {
        this.inboxSignal.update(items =>
            items.map(item => item.id === id ? { ...item, read: true } : item)
        );
        this.saveInbox();
    }

    markAllAsRead() {
        this.inboxSignal.update(items =>
            items.map(item => ({ ...item, read: true }))
        );
        this.saveInbox();
    }

    deleteItem(id: string) {
        this.inboxSignal.update(items => items.filter(item => item.id !== id));
        this.saveInbox();
    }

    clearInbox() {
        this.inboxSignal.set([]);
        this.saveInbox();
    }

    reset() {
        this.inboxSignal.set([]);
        this.currentUserId = null;
    }

    private loadInbox() {
        const stored = localStorage.getItem(this.storageKey);
        if (stored) {
            try {
                const parsed = JSON.parse(stored);
                const items = parsed.map((item: any) => ({
                    ...item,
                    timestamp: new Date(item.timestamp)
                }));
                this.inboxSignal.set(items);
            } catch (e) {
                console.error('Failed to parse inbox', e);
                this.inboxSignal.set([]);
            }
        } else {
            this.inboxSignal.set([]);
        }
    }

    private saveInbox() {
        localStorage.setItem(this.storageKey, JSON.stringify(this.inboxSignal()));
    }
}
