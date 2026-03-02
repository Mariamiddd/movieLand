import { Injectable, signal, computed, inject } from '@angular/core';
import { NotificationService } from './notification.service';

export interface Report {
    id: string;
    userId: string;
    userEmail: string;
    userName: string;
    movieId: number;
    movieTitle: string;
    reason: string;
    details: string;
    timestamp: Date;
    status: 'pending' | 'in-progress' | 'resolved';
    adminResponse?: string;
}

export interface ChatMessage {
    id: string;
    senderId: string;
    receiverId: string;
    reportId: string;
    message: string;
    timestamp: Date;
    read: boolean;
}

@Injectable({
    providedIn: 'root'
})
export class ReportService {
    private reportsSignal = signal<Report[]>([]);
    private messagesSignal = signal<ChatMessage[]>([]);
    private readonly notificationService = inject(NotificationService);

    reports = computed(() => this.reportsSignal());
    messages = computed(() => this.messagesSignal());
    pendingCount = computed(() => this.reportsSignal().filter(r => r.status === 'pending').length);

    constructor() {
        this.loadData();
    }

    private loadData() {
        const storedReports = localStorage.getItem('reports_data');
        if (storedReports) {
            this.reportsSignal.set(JSON.parse(storedReports).map((r: any) => ({ ...r, timestamp: new Date(r.timestamp) })));
        }

        const storedMessages = localStorage.getItem('chat_messages');
        if (storedMessages) {
            this.messagesSignal.set(JSON.parse(storedMessages).map((m: any) => ({ ...m, timestamp: new Date(m.timestamp) })));
        }
    }

    private saveData() {
        localStorage.setItem('reports_data', JSON.stringify(this.reportsSignal()));
        localStorage.setItem('chat_messages', JSON.stringify(this.messagesSignal()));
    }

    submitReport(report: Omit<Report, 'id' | 'timestamp' | 'status'>) {
        const newReport: Report = {
            ...report,
            id: crypto.randomUUID(),
            timestamp: new Date(),
            status: 'pending'
        };
        this.reportsSignal.update(r => [newReport, ...r]);
        this.saveData();
    }

    updateReportStatus(reportId: string, status: Report['status'], notifyMessage?: string) {
        let userId = '';
        let movieTitle = '';

        this.reportsSignal.update(reports =>
            reports.map(r => {
                if (r.id === reportId) {
                    userId = r.userId;
                    movieTitle = r.movieTitle;
                    return { ...r, status };
                }
                return r;
            })
        );

        if (userId && notifyMessage) {
            this.notificationService.addSystemNotificationForUser(
                userId,
                'Support Update',
                `Update for ${movieTitle}: ${notifyMessage}`
            );
        }

        this.saveData();
    }

    resolveReport(reportId: string, response: string) {
        let userId = '';
        let movieTitle = '';

        this.reportsSignal.update(reports =>
            reports.map(r => {
                if (r.id === reportId) {
                    userId = r.userId;
                    movieTitle = r.movieTitle;
                    return { ...r, status: 'resolved', adminResponse: response };
                }
                return r;
            })
        );

        if (userId) {
            this.notificationService.addSystemNotificationForUser(
                userId,
                'Report Resolved',
                `Official response for ${movieTitle}: ${response.substring(0, 50)}...`
            );
        }

        this.saveData();
    }

    sendMessage(message: Omit<ChatMessage, 'id' | 'timestamp' | 'read'>) {
        const newMessage: ChatMessage = {
            ...message,
            id: crypto.randomUUID(),
            timestamp: new Date(),
            read: false
        };
        this.messagesSignal.update(m => [...m, newMessage]);

        // If admin sends a message, notify the user
        if (message.senderId === 'admin') {
            const report = this.reportsSignal().find(r => r.id === message.reportId);
            this.notificationService.addSystemNotificationForUser(
                message.receiverId,
                'New Message from Admin',
                `Regarding your report for ${report?.movieTitle || 'a movie'}`
            );
        }

        this.saveData();
    }

    deleteMessage(messageId: string) {
        this.messagesSignal.update(messages => messages.filter(m => m.id !== messageId));
        this.saveData();
    }

    getMessagesForReport(reportId: string) {
        return computed(() => this.messagesSignal().filter(m => m.reportId === reportId).sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime()));
    }
}
