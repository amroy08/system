import nodemailer from 'nodemailer';
import { config } from '../config.js';
import { displayClassName } from './classNames.js';

let transporter = null;

// Initialize Transporter
if (config.smtpHost && config.smtpUser && config.smtpPass) {
  transporter = nodemailer.createTransport({
    host: config.smtpHost,
    port: config.smtpPort,
    secure: config.smtpPort === 465, // True for 465, false for other ports
    auth: {
      user: config.smtpUser,
      pass: config.smtpPass,
    },
  });
  console.log('[Email] SMTP transporter initialized');
} else {
  // Fallback Mock Transporter
  transporter = {
    sendMail: async (mailOptions) => {
      console.log(`[Email Mock] Simulated email: ${String(mailOptions.subject || '').replace(/[\r\n]+/g, ' ')}`);
      return { messageId: 'mock-msg-' + Date.now() };
    }
  };
  console.log('[Email] Mock transporter initialized; email content and recipients will not be logged');
}

async function sendMail(options) {
  options.subject = String(options.subject || '').replace(/[\r\n]+/g, ' ').trim();
  if (options.to) {
    const list = String(options.to).split(',').map((e) => e.trim()).filter((e) => e && !e.toLowerCase().endsWith('@mvhs.edu.in'));
    if (list.length === 0) {
      console.log("[Email] Skipped dummy recipient address");
      return { messageId: 'mock-skipped-dummy' };
    }
    options.to = list.join(', ');
  }
  return transporter.sendMail(options);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function safeActionUrl(value) {
  try {
    const url = new URL(String(value), config.appUrl);
    if (!['https:', 'http:'].includes(url.protocol)) return config.appUrl;
    return url.toString();
  } catch {
    return config.appUrl;
  }
}

export async function getEmailHealth() {
  const configured = Boolean(config.smtpHost && config.smtpUser && config.smtpPass);
  if (!configured) return { configured: false, reachable: false, mode: 'mock', from: config.emailFrom, appUrl: config.appUrl };
  try {
    await transporter.verify();
    return { configured: true, reachable: true, mode: 'smtp', from: config.emailFrom, appUrl: config.appUrl };
  } catch (error) {
    return { configured: true, reachable: false, mode: 'smtp', from: config.emailFrom, appUrl: config.appUrl, error: error.message };
  }
}

/**
 * Helper to wrap email content in a professional HTML frame matching MVHS branding
 */
function wrapHtmlTemplate(title, bodyHtml, actionUrl = null, actionText = 'Open Portal') {
  const primaryColor = '#0f2248';
  const accentColor = '#16a34a';

  const actionButtonHtml = actionUrl
    ? `<div style="text-align: center; margin: 30px 0 15px;">
         <a href="${escapeHtml(safeActionUrl(actionUrl))}" style="background-color: ${accentColor}; color: #ffffff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 14px; display: inline-block; box-shadow: 0 4px 12px rgba(22, 163, 74, 0.3);">${escapeHtml(actionText)}</a>
       </div>`
    : '';

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${escapeHtml(title)}</title>
      <style>
        body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f8fafc; color: #1e293b; margin: 0; padding: 0; }
        .wrapper { max-width: 600px; margin: 20px auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 8px 30px rgba(15, 23, 42, 0.04); }
        .header { background: linear-gradient(135deg, ${primaryColor}, #1e3a8a); color: #ffffff; padding: 30px 24px; text-align: center; }
        .header h1 { margin: 0; font-size: 20px; font-weight: 800; letter-spacing: 0.5px; text-transform: uppercase; }
        .header p { margin: 5px 0 0; font-size: 12px; opacity: 0.85; }
        .content { padding: 30px 24px; line-height: 1.6; }
        .content h2 { margin-top: 0; font-size: 18px; color: ${primaryColor}; font-weight: 700; }
        .meta-table { width: 100%; border-collapse: collapse; margin: 20px 0; background-color: #f1f5f9; border-radius: 8px; overflow: hidden; }
        .meta-table td { padding: 12px 16px; border-bottom: 1px solid #e2e8f0; font-size: 13px; }
        .meta-table tr:last-child td { border-bottom: none; }
        .meta-label { font-weight: bold; color: #475569; width: 35%; }
        .meta-value { color: #1e293b; }
        .footer { background-color: #f1f5f9; padding: 24px; text-align: center; font-size: 11px; color: #64748b; border-top: 1px solid #e2e8f0; line-height: 1.5; }
        .footer a { color: ${accentColor}; text-decoration: none; font-weight: 600; }
      </style>
    </head>
    <body>
      <div class="wrapper">
        <div class="header">
          <h1>M.V HIGH SCHOOL</h1>
          <p>School Management ERP Portal</p>
        </div>
        <div class="content">
          ${bodyHtml}
          ${actionButtonHtml}
        </div>
        <div class="footer">
          <div>© ${new Date().getFullYear()} M.V HIGH SCHOOL. All rights reserved.</div>
          <div style="margin-top: 4px;">Mumbai, Maharashtra · +91 22 2385 1414</div>
          <div style="margin-top: 4px;"><a href="mailto:info@mvhs.edu.in">info@mvhs.edu.in</a> · <a href="${escapeHtml(safeActionUrl(config.appUrl))}">ERP Login</a></div>
        </div>
      </div>
    </body>
    </html>
  `;
}

/**
 * 1. Send Fee Payment Receipt Confirmation
 */
export async function sendReceiptEmail(parentEmail, data) {
  const title = `Receipt Confirmation — Receipt #${data.receiptNo}`;
  const className = displayClassName(data.className);
  const bodyHtml = `
    <h2>Fee Payment Received</h2>
    <p>Dear Parent,</p>
    <p>We are pleased to inform you that we have successfully received your fee payment. Below is the confirmation of receipt for your records:</p>

    <table class="meta-table">
      <tr>
        <td class="meta-label">Receipt Number</td>
        <td class="meta-value" style="font-family: monospace; font-weight: bold;">${escapeHtml(data.receiptNo)}</td>
      </tr>
      <tr>
        <td class="meta-label">Student Name</td>
        <td class="meta-value"><b>${escapeHtml(data.studentName)}</b></td>
      </tr>
      <tr>
        <td class="meta-label">Grade / Section</td>
        <td class="meta-value">${escapeHtml(className)}</td>
      </tr>
      <tr>
        <td class="meta-label">Payment Date</td>
        <td class="meta-value">${escapeHtml(data.date)}</td>
      </tr>
      <tr>
        <td class="meta-label">Payment Mode</td>
        <td class="meta-value" style="text-transform: uppercase;">${escapeHtml(data.mode)}</td>
      </tr>
      ${data.reference ? `<tr><td class="meta-label">Reference No</td><td class="meta-value">${escapeHtml(data.reference)}</td></tr>` : ''}
      <tr style="background-color: #e2e8f0;">
        <td class="meta-label" style="color: #1e2248;">Amount Paid</td>
        <td class="meta-value" style="font-size: 15px; font-weight: bold; color: #16a34a;">₹${data.amountPaid.toLocaleString()}</td>
      </tr>
      <tr>
        <td class="meta-label">Remaining Balance</td>
        <td class="meta-value" style="font-weight: bold; color: #dc2626;">₹${data.balance.toLocaleString()}</td>
      </tr>
    </table>

    <p>You can view and print the A4 receipt from the fee history tab inside the Parent Portal.</p>
  `;

  const html = wrapHtmlTemplate(title, bodyHtml, `${config.appUrl}/login`, 'Login to Parent Portal');
  const text = `Fee Payment Received!\n\nReceipt: ${data.receiptNo}\nStudent: ${data.studentName}\nClass: ${className}\nAmount Paid: ₹${data.amountPaid}\nRemaining Balance: ₹${data.balance}\n\nLogin to portal: ${config.appUrl}/login`;

  return sendMail({
    from: config.emailFrom,
    to: parentEmail,
    subject: `[Receipt] Fee Payment Received — ${data.studentName}`,
    text,
    html,
  });
}

/**
 * 2. Send School Notice Notification
 */
export async function sendNoticeEmail(parentEmails, notice) {
  if (!parentEmails.length) return;
  const title = `School Notice: ${notice.title}`;

  const bodyHtml = `
    <div style="border-left: 4px solid #16a34a; padding-left: 14px; margin: 15px 0;">
      <span style="font-size: 11px; text-transform: uppercase; font-weight: bold; color: #16a34a; background-color: #dcfce7; padding: 2px 8px; border-radius: 4px;">
        ${escapeHtml(notice.category || 'General')}
      </span>
      <h2 style="margin: 8px 0 4px; font-size: 18px;">${escapeHtml(notice.title)}</h2>
      <div style="font-size: 11px; color: #64748b;">Published: ${escapeHtml(notice.date)}</div>
    </div>

    <p>Dear Parents,</p>
    <p style="white-space: pre-line; background-color: #f8fafc; padding: 16px; border-radius: 8px; border: 1px solid #e2e8f0; font-size: 13.5px;">${escapeHtml(notice.content || notice.body || '')}</p>

    <p>Please log in to the Parent Portal to review all upcoming events, notices, and class updates.</p>
  `;

  const html = wrapHtmlTemplate(title, bodyHtml, `${config.appUrl}/login`, 'View Notices on Portal');
  const text = `School Notice Announcement!\n\nTitle: ${notice.title}\nCategory: ${notice.category}\nDate: ${notice.date}\n\nContent:\n${notice.content || notice.body || ''}\n\nView on Portal: ${config.appUrl}/login`;

  return sendMail({
    from: config.emailFrom,
    to: parentEmails.join(', '),
    subject: `[Notice] ${notice.title} — MVHS`,
    text,
    html,
  });
}

/**
 * 3. Send Academic Document Upload Notification
 */
export async function sendDocumentEmail(parentEmails, doc) {
  if (!parentEmails.length) return;
  const title = `Academic Circular Shared: ${doc.title}`;

  const bodyHtml = `
    <h2>New Academic Document Uploaded</h2>
    <p>Dear Parents,</p>
    <p>A new circular/document has been shared with the selected audience:</p>

    <table class="meta-table">
      <tr>
        <td class="meta-label">Title</td>
        <td class="meta-value"><b>${escapeHtml(doc.title)}</b></td>
      </tr>
      <tr>
        <td class="meta-label">Audience</td>
        <td class="meta-value">${escapeHtml(displayClassName(doc.className || 'General'))}</td>
      </tr>
      <tr>
        <td class="meta-label">Description</td>
        <td class="meta-value">${escapeHtml(doc.description || 'No description provided.')}</td>
      </tr>
      <tr>
        <td class="meta-label">Date Shared</td>
        <td class="meta-value">${escapeHtml(new Date(doc.createdAt).toLocaleDateString())}</td>
      </tr>
    </table>

    <p>You can download or view this circular from the Documents section inside the ERP portal.</p>
  `;

  const documentUrl = doc.link && doc.link !== '#' ? doc.link : `${config.appUrl}/documents`;
  const html = wrapHtmlTemplate(title, bodyHtml, documentUrl, 'Download Circular');
  const text = `Circular Shared!\n\nTitle: ${doc.title}\nAudience: ${displayClassName(doc.className)}\nDescription: ${doc.description || ''}\n\nOpen: ${documentUrl}`;

  return sendMail({
    from: config.emailFrom,
    to: parentEmails.join(', '),
    subject: `[Circular] ${doc.title} shared`,
    text,
    html,
  });
}

/**
 * 4. Send Exam Schedule Announcement
 */
export async function sendExamEmail(parentEmails, exam, scheduleList = []) {
  if (!parentEmails.length) return;
  const title = `Exam Announcement: ${exam.name}`;
  const className = displayClassName(exam.className);

  let scheduleRowsHtml = '';
  if (scheduleList.length > 0) {
    scheduleRowsHtml = scheduleList.map(s => `
      <tr style="border-bottom: 1px solid #e2e8f0;">
        <td style="padding: 10px; font-weight: bold;">${escapeHtml(s.subjectName)}</td>
        <td style="padding: 10px; text-align: center;">${escapeHtml(s.date)}</td>
        <td style="padding: 10px; text-align: center;">${escapeHtml(s.timeStart)} - ${escapeHtml(s.timeEnd)}</td>
        <td style="padding: 10px; text-align: right;">${escapeHtml(s.marksMax)}</td>
      </tr>
    `).join('');
  }

  const scheduleTableHtml = scheduleList.length > 0
    ? `
      <h3 style="color: #0f2248; font-size: 14px; margin-top: 20px;">Exam Timetable</h3>
      <table style="width: 100%; font-size: 12px; border-collapse: collapse; margin-bottom: 15px;">
        <thead>
          <tr style="background-color: #0f2248; color: #ffffff;">
            <th style="padding: 10px; text-align: left;">Subject</th>
            <th style="padding: 10px; text-align: center;">Date</th>
            <th style="padding: 10px; text-align: center;">Time</th>
            <th style="padding: 10px; text-align: right;">Max Marks</th>
          </tr>
        </thead>
        <tbody>
          ${scheduleRowsHtml}
        </tbody>
      </table>
    `
    : '';

  const bodyHtml = `
    <h2>Exam Timetable & Instructions</h2>
    <p>Dear Parents,</p>
    <p>An exam schedule has been officially published for your child's class:</p>

    <table class="meta-table">
      <tr>
        <td class="meta-label">Exam Name</td>
        <td class="meta-value" style="font-weight: bold;">${escapeHtml(exam.name)}</td>
      </tr>
      <tr>
        <td class="meta-label">Class / Grade</td>
        <td class="meta-value">${escapeHtml(className)}</td>
      </tr>
      <tr>
        <td class="meta-label">Term</td>
        <td class="meta-value" style="text-transform: uppercase;">${escapeHtml(exam.term || exam.type || '')}</td>
      </tr>
      <tr>
        <td class="meta-label">Academic Year</td>
        <td class="meta-value">${escapeHtml(exam.academicYear)}</td>
      </tr>
      <tr>
        <td class="meta-label">Exam Dates</td>
        <td class="meta-value">${escapeHtml(exam.startDate || 'To be announced')}${exam.endDate ? ` to ${escapeHtml(exam.endDate)}` : ''}</td>
      </tr>
    </table>

    ${scheduleTableHtml}

    <p>Please ensure your child prepares according to the timetable. Hall tickets and results will be accessible inside the Parent Portal.</p>
  `;

  const html = wrapHtmlTemplate(title, bodyHtml, `${config.appUrl}/exams`, 'Open Portal');
  const text = `Exam Schedule Announced!\n\nExam: ${exam.name}\nClass: ${className}\nTerm: ${exam.term || exam.type || ''}\nStart: ${exam.startDate || ''}\nEnd: ${exam.endDate || ''}\n\nReview timetable on Parent Portal: ${config.appUrl}/exams`;

  return sendMail({
    from: config.emailFrom,
    to: parentEmails.join(', '),
    subject: `[Exam schedule] ${exam.name} announced`,
    text,
    html,
  });
}

/**
 * 5. Send Outstanding Fee Dues Reminder
 */
export async function sendFeeReminderEmail(parentEmail, data) {
  const title = `Fee Reminder — Outstanding Balance`;
  const className = displayClassName(data.className);
  const bodyHtml = `
    <h2>Fee Payment Pending Reminder</h2>
    <p>Dear Parent,</p>
    <p>This is a gentle reminder regarding the pending outstanding fee balance for your child. Please review the details below:</p>

    <table class="meta-table">
      <tr>
        <td class="meta-label">Student Name</td>
        <td class="meta-value"><b>${escapeHtml(data.studentName)}</b></td>
      </tr>
      <tr>
        <td class="meta-label">Grade / Section</td>
        <td class="meta-value">${escapeHtml(className)}</td>
      </tr>
      <tr>
        <td class="meta-label">GR Number</td>
        <td class="meta-value" style="font-family: monospace;">${escapeHtml(data.grNumber)}</td>
      </tr>
      <tr>
        <td class="meta-label">Total Fee Demand</td>
        <td class="meta-value">₹${data.totalDemand.toLocaleString()}</td>
      </tr>
      <tr>
        <td class="meta-label">Total Amount Paid</td>
        <td class="meta-value" style="color: #16a34a; font-weight: bold;">₹${data.totalPaid.toLocaleString()}</td>
      </tr>
      <tr style="background-color: #fee2e2;">
        <td class="meta-label" style="color: #7f1d1d;">Outstanding Balance</td>
        <td class="meta-value" style="font-size: 15px; font-weight: bold; color: #dc2626;">₹${data.outstanding.toLocaleString()}</td>
      </tr>
    </table>

    <p>Kindly clear the outstanding dues at the earliest. You can log in to the portal and view the detailed fee breakdown to make a payment.</p>
  `;

  const html = wrapHtmlTemplate(title, bodyHtml, `${config.appUrl}/fees`, 'Pay Outstanding Dues');
  const text = `Fee Reminder!\n\nStudent: ${data.studentName}\nClass: ${className}\nOutstanding Balance: ₹${data.outstanding}\n\nPay online: ${config.appUrl}/fees`;

  return sendMail({
    from: config.emailFrom,
    to: parentEmail,
    subject: `[Fee Reminder] Outstanding Dues for ${data.studentName}`,
    text,
    html,
  });
}

/**
 * 5. Send Homework / Classwork Assignment Alert
 */
export async function sendHomeworkEmail(parentEmails, task, classNameStr, subjectNameStr) {
  if (!parentEmails.length) return;
  const title = `New Assignment Alert: ${task.title}`;
  const className = displayClassName(classNameStr);

  const bodyHtml = `
    <h2>New ${escapeHtml(task.type)} Posted</h2>
    <p>Dear Parents,</p>
    <p>A new assignment has been posted for your child's class:</p>

    <table class="meta-table" style="width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 13px;">
      <tr style="border-bottom: 1px solid #e2e8f0;">
        <td style="padding: 8px 0; color: #64748b; font-weight: 500;">Title</td>
        <td style="padding: 8px 0; font-weight: bold; color: #0f2248; text-align: right;">${escapeHtml(task.title)}</td>
      </tr>
      <tr style="border-bottom: 1px solid #e2e8f0;">
        <td style="padding: 8px 0; color: #64748b; font-weight: 500;">Type</td>
        <td style="padding: 8px 0; font-weight: bold; text-align: right; text-transform: capitalize;">${escapeHtml(task.type)}</td>
      </tr>
      <tr style="border-bottom: 1px solid #e2e8f0;">
        <td style="padding: 8px 0; color: #64748b; font-weight: 500;">Class / Grade</td>
        <td style="padding: 8px 0; font-weight: bold; text-align: right;">${escapeHtml(className)}</td>
      </tr>
      <tr style="border-bottom: 1px solid #e2e8f0;">
        <td style="padding: 8px 0; color: #64748b; font-weight: 500;">Subject</td>
        <td style="padding: 8px 0; font-weight: bold; text-align: right;">${escapeHtml(subjectNameStr)}</td>
      </tr>
      <tr style="border-bottom: 1px solid #e2e8f0;">
        <td style="padding: 8px 0; color: #64748b; font-weight: 500;">Assigned Date</td>
        <td style="padding: 8px 0; font-weight: bold; text-align: right;">${escapeHtml(task.assignedDate)}</td>
      </tr>
      <tr style="border-bottom: 1px solid #e2e8f0;">
        <td style="padding: 8px 0; color: #64748b; font-weight: 500;">Submission Due Date</td>
        <td style="padding: 8px 0; font-weight: bold; color: #ef4444; text-align: right;">${escapeHtml(task.dueDate)}</td>
      </tr>
    </table>

    <div style="background-color: #f8fafc; border-left: 4px solid #0f2248; padding: 15px; margin: 20px 0; border-radius: 4px;">
      <h3 style="margin-top: 0; font-size: 13px; color: #0f2248; margin-bottom: 8px;">Instructions / Details:</h3>
      <p style="font-size: 12px; margin-bottom: 0; white-space: pre-wrap; line-height: 1.5; color: #334155;">${escapeHtml(task.description || 'No detailed instructions provided.')}</p>
    </div>

    <p>Please guide your child to complete and submit this work by the due date. You can review the details anytime in the student/parent portal.</p>
  `;

  const html = wrapHtmlTemplate(title, bodyHtml, `${config.appUrl || 'http://localhost:5173'}/homework`, 'View Assignments');

  return sendMail({
    from: config.emailFrom,
    to: parentEmails.join(', '),
    subject: `[Assignment Notification] ${task.type}: ${task.title} (Due: ${task.dueDate})`,
    html,
  });
}

/**
 * Send a PTM invitation to parents in the selected grade.
 */
export async function sendPTMEmail(parentEmails, meeting, gradeLabel) {
  if (!parentEmails.length) return;

  const notificationType = meeting.notificationType || 'ptm-scheduled';
  const isCancelled = notificationType === 'ptm-cancelled';
  const isRescheduled = notificationType === 'ptm-rescheduled';
  const stateLabel = isCancelled ? 'Cancelled' : isRescheduled ? 'Rescheduled' : 'Scheduled';
  const title = `Parent-Teacher Meeting ${stateLabel}: ${meeting.title}`;
  const bodyHtml = `
    <h2>Parent-Teacher Meeting ${stateLabel}</h2>
    <p>Dear Parent,</p>
    <p>${isCancelled ? 'The following parent-teacher meeting has been cancelled:' : isRescheduled ? 'The following parent-teacher meeting has updated schedule details:' : 'You are invited to attend the following parent-teacher meeting:'}</p>
    <table class="meta-table">
      <tr><td class="meta-label">Meeting</td><td class="meta-value"><b>${escapeHtml(meeting.title)}</b></td></tr>
      <tr><td class="meta-label">Grade / Section</td><td class="meta-value">${escapeHtml(gradeLabel)}</td></tr>
      <tr><td class="meta-label">Date</td><td class="meta-value">${escapeHtml(meeting.date)}</td></tr>
      <tr><td class="meta-label">Slot Details</td><td class="meta-value">${escapeHtml(meeting.slots || 'Contact the school office for timing.')}</td></tr>
    </table>
    ${meeting.notes ? `<p style="white-space: pre-line; background-color: #f8fafc; padding: 16px; border-radius: 8px; border: 1px solid #e2e8f0;">${escapeHtml(meeting.notes)}</p>` : ''}
    ${isCancelled ? '<p>No attendance is required for this cancelled meeting.</p>' : '<p>Please attend during the stated time so teachers can discuss your child\'s academic progress.</p>'}
  `;
  const html = wrapHtmlTemplate(title, bodyHtml, `${config.appUrl}/ptm`, 'Open Parent Portal');
  const text = `Parent-Teacher Meeting ${stateLabel}\n\nMeeting: ${meeting.title}\nGrade: ${gradeLabel}\nDate: ${meeting.date}\nSlots: ${meeting.slots || 'Contact the school office'}\n\n${meeting.notes || ''}`;

  return sendMail({
    from: config.emailFrom,
    to: parentEmails.join(', '),
    subject: `[PTM ${stateLabel}] ${meeting.title} — ${gradeLabel}`,
    text,
    html,
  });
}

export async function sendActivityEmail(parentEmails, activity, gradeLabel) {
  if (!parentEmails.length) return;

  const notificationType = activity.notificationType || 'activity-scheduled';
  const isCancelled = notificationType === 'activity-cancelled';
  const isRescheduled = notificationType === 'activity-rescheduled';
  const stateLabel = isCancelled ? 'Cancelled' : isRescheduled ? 'Updated' : 'Scheduled';
  const title = `School Activity ${stateLabel}: ${activity.title}`;
  const bodyHtml = `
    <h2>Activity ${stateLabel}</h2>
    <p>Dear Parent,</p>
    <p>${isCancelled ? 'The following school activity has been cancelled:' : isRescheduled ? 'The following school activity has updated details:' : 'A school activity has been scheduled for your child:'}</p>
    <table class="meta-table">
      <tr><td class="meta-label">Activity</td><td class="meta-value"><b>${escapeHtml(activity.title)}</b></td></tr>
      <tr><td class="meta-label">Type</td><td class="meta-value">${escapeHtml(activity.type || 'General')}</td></tr>
      <tr><td class="meta-label">Grade / Section</td><td class="meta-value">${escapeHtml(gradeLabel)}</td></tr>
      <tr><td class="meta-label">Date</td><td class="meta-value">${escapeHtml(activity.date)}</td></tr>
      <tr><td class="meta-label">In-charge</td><td class="meta-value">${escapeHtml(activity.inCharge || 'School Administration')}</td></tr>
    </table>
    ${activity.description ? `<p style="white-space: pre-line; background-color: #f8fafc; padding: 16px; border-radius: 8px; border: 1px solid #e2e8f0;">${escapeHtml(activity.description)}</p>` : ''}
  `;
  const html = wrapHtmlTemplate(title, bodyHtml, `${config.appUrl}/activities`, 'View Activities');
  const text = `Activity ${stateLabel}\n\nActivity: ${activity.title}\nType: ${activity.type || 'General'}\nGrade: ${gradeLabel}\nDate: ${activity.date}\nIn-charge: ${activity.inCharge || 'School Administration'}\n\n${activity.description || ''}`;

  return sendMail({
    from: config.emailFrom,
    to: parentEmails.join(', '),
    subject: `[Activity ${stateLabel}] ${activity.title} — ${gradeLabel}`,
    text,
    html,
  });
}

export async function sendCalendarEmail(parentEmails, event, gradeLabel) {
  if (!parentEmails.length) return;

  const notificationType = event.notificationType || 'calendar-scheduled';
  const isRescheduled = notificationType === 'calendar-rescheduled';
  const stateLabel = isRescheduled ? 'Updated' : 'Scheduled';
  const title = `School Event ${stateLabel}: ${event.title}`;
  const bodyHtml = `
    <h2>School Event ${stateLabel}</h2>
    <p>Dear Parent,</p>
    <p>${isRescheduled ? 'The following school event has updated details:' : 'A school event has been scheduled for your child:'}</p>
    <table class="meta-table">
      <tr><td class="meta-label">Event</td><td class="meta-value"><b>${escapeHtml(event.title)}</b></td></tr>
      <tr><td class="meta-label">Type</td><td class="meta-value">${escapeHtml(event.type || 'Event')}</td></tr>
      <tr><td class="meta-label">Grade / Section</td><td class="meta-value">${escapeHtml(gradeLabel)}</td></tr>
      <tr><td class="meta-label">Date</td><td class="meta-value">${escapeHtml(event.date)}</td></tr>
    </table>
    ${event.description ? `<p style="white-space: pre-line; background-color: #f8fafc; padding: 16px; border-radius: 8px; border: 1px solid #e2e8f0;">${escapeHtml(event.description)}</p>` : ''}
  `;
  const html = wrapHtmlTemplate(title, bodyHtml, `${config.appUrl}/calendar`, 'View Calendar');
  const text = `School Event ${stateLabel}\n\nEvent: ${event.title}\nType: ${event.type || 'Event'}\nGrade: ${gradeLabel}\nDate: ${event.date}\n\n${event.description || ''}`;

  return sendMail({
    from: config.emailFrom,
    to: parentEmails.join(', '),
    subject: `[Event ${stateLabel}] ${event.title} — ${gradeLabel}`,
    text,
    html,
  });
}

export async function sendTestEmail(recipient, data = {}) {
  const html = wrapHtmlTemplate('Email Configuration Test', '<h2>Email delivery is working</h2><p>This test was requested by an administrator from the School ERP email diagnostics page.</p>', config.appUrl, 'Open ERP');
  return sendMail({ from: config.emailFrom, to: recipient, subject: '[Test] School ERP email configuration', text: `School ERP email delivery test requested by ${data.requestedBy || 'an administrator'}.`, html });
}

export async function sendEmailByType(eventType, recipient, payload) {
  switch (eventType) {
    case 'receipt': return sendReceiptEmail(recipient, payload);
    case 'notice': return sendNoticeEmail([recipient], payload);
    case 'document': return sendDocumentEmail([recipient], payload);
    case 'exam-schedule': return sendExamEmail([recipient], payload.exam || payload, payload.scheduleList || []);
    case 'homework': return sendHomeworkEmail([recipient], payload.task, payload.className, payload.subjectName);
    case 'ptm-scheduled':
    case 'ptm-rescheduled':
    case 'ptm-cancelled': return sendPTMEmail([recipient], { ...payload.meeting, notificationType: eventType }, payload.gradeLabel);
    case 'activity-scheduled':
    case 'activity-rescheduled':
    case 'activity-cancelled': return sendActivityEmail([recipient], { ...payload.activity, notificationType: eventType }, payload.gradeLabel);
    case 'calendar-scheduled':
    case 'calendar-rescheduled': return sendCalendarEmail([recipient], { ...payload.event, notificationType: eventType }, payload.gradeLabel);
    case 'test': return sendTestEmail(recipient, payload);
    default: throw new Error(`Unsupported email event type: ${eventType}`);
  }
}
