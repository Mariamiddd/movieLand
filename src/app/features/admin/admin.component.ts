import { Component, inject, signal, computed, OnInit, effect } from '@angular/core';
import { DatePipe } from '@angular/common';
import { AuthService } from '../../core/services/auth.service';
import { ReportService, Report } from '../../core/services/report.service';
import { NotificationService } from '../../core/services/notification.service';
import { FormsModule } from '@angular/forms';
import { Title } from '@angular/platform-browser';

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [DatePipe, FormsModule],
  templateUrl: './admin.component.html',
  styleUrl: './admin.component.css'
})
export class AdminComponent implements OnInit {
  authService = inject(AuthService);
  reportService = inject(ReportService);
  notificationService = inject(NotificationService);
  title = inject(Title);

  reports = this.reportService.reports;
  pendingCount = computed(() => this.reports().filter((r: Report) => r.status === 'pending').length);

  responses: Record<string, string> = {};
  chatInputs: Record<string, string> = {};
  selectedReportId = signal<string | null>(null);

  selectedReport = computed(() =>
    this.reports().find(r => r.id === this.selectedReportId()) || null
  );

  selectReport(id: string) {
    this.selectedReportId.set(id === this.selectedReportId() ? null : id);
    if (id) this.scrollToBottom();
  }

  constructor() {
    effect(() => {
      this.reportService.messages();
      this.scrollToBottom();
    });
  }

  ngOnInit() {
    this.title.setTitle('Admin | movieLand');
  }

  startWorking(report: Report) {
    this.reportService.updateReportStatus(report.id, 'in-progress', "We've started working on your report.");

    this.reportService.sendMessage({
      senderId: 'admin',
      receiverId: report.userId,
      reportId: report.id,
      message: "Hello! We've received your report and our support team is currently looking into it. We'll let you know as soon as it's fixed!"
    });

    this.notificationService.show('Status Updated', 'Working on it', 'info');
  }

  resolveReport(report: Report) {
    this.reportService.updateReportStatus(report.id, 'resolved', "Your report has been marked as fixed.");

    this.reportService.sendMessage({
      senderId: 'admin',
      receiverId: report.userId,
      reportId: report.id,
      message: "Great news! This problem has been resolved. If you need anything else, just open a new report! Have a cinematic day!"
    });

    this.notificationService.show('Resolved', 'Report marked as resolved', 'success');
  }

  getMessages(reportId: string) {
    return this.reportService.messages()
      .filter((m: any) => m.reportId === reportId)
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  sendChat(report: Report) {
    const msg = this.chatInputs[report.id];
    if (!msg) return;

    this.reportService.sendMessage({
      senderId: 'admin',
      receiverId: report.userId,
      reportId: report.id,
      message: msg
    });

    this.chatInputs[report.id] = '';
    this.scrollToBottom();
  }

  private scrollToBottom() {
    setTimeout(() => {
      const chatContainers = document.querySelectorAll('.chat-logs-modern');
      chatContainers.forEach(container => {
        container.scrollTop = container.scrollHeight;
      });
    }, 100);
  }

  deleteMessage(messageId: string) {
    this.reportService.deleteMessage(messageId);
    this.notificationService.show('Success', 'Message deleted', 'info');
  }

  editMovie(movie: any) {
    this.notificationService.show('Maintenance', `Catalog edit for "${movie.movieTitle}" is currently under maintenance.`, 'info');
  }
}
