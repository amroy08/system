import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import bcrypt from 'bcryptjs';

function request(port, method, requestPath, { body, cookies = [], csrf } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? null : JSON.stringify(body);
    const headers = {};
    if (payload) {
      headers['content-type'] = 'application/json';
      headers['content-length'] = Buffer.byteLength(payload);
    }
    if (cookies.length) headers.cookie = cookies.join('; ');
    if (csrf) headers['x-csrf-token'] = csrf;
    const req = http.request({ hostname: '127.0.0.1', port, path: requestPath, method, headers }, (res) => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { text += chunk; });
      res.on('end', () => {
        const contentType = String(res.headers['content-type'] || '');
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: text && contentType.includes('application/json') ? JSON.parse(text) : text,
        });
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function cookiePair(setCookie) {
  return String(setCookie).split(';', 1)[0];
}

function waitForServer(child) {
  return new Promise((resolve, reject) => {
    let output = '';
    const timeout = setTimeout(() => reject(new Error(`Server startup timed out: ${output}`)), 10_000);
    child.stdout.on('data', (chunk) => {
      output += chunk.toString();
      if (output.includes('School Management API running')) {
        clearTimeout(timeout);
        resolve();
      }
    });
    child.stderr.on('data', (chunk) => { output += chunk.toString(); });
    child.once('exit', (code) => {
      clearTimeout(timeout);
      reject(new Error(`Server exited before startup (${code}): ${output}`));
    });
  });
}

test('cookie sessions enforce CSRF, RBAC, password changes, and lockout', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mvhs-security-'));
  const dataDir = path.join(root, 'data');
  const uploadsDir = path.join(root, 'uploads');
  await fs.mkdir(dataDir, { recursive: true });
  const password = 'Correct-Horse-42!';
  const forcedPassword = 'Temporary-Login-42!';
  const users = [
    { _id: 'admin-test', username: 'secureadmin', fullName: 'Secure Admin', role: 'admin', status: 'active', passwordHash: bcrypt.hashSync(password, 4) },
    { _id: 'clerk-test', username: 'secureclerk', fullName: 'Secure Clerk', role: 'clerk', status: 'active', passwordHash: bcrypt.hashSync(password, 4) },
    { _id: 'teacher-test', username: 'scopedteacher', fullName: 'Scoped Teacher', role: 'teacher', status: 'active', passwordHash: bcrypt.hashSync(password, 4) },
    { _id: 'parent-user-test', username: 'scopedparent', fullName: 'Scoped Parent', role: 'parent', refId: 'parent-test', status: 'active', passwordHash: bcrypt.hashSync(password, 4) },
    { _id: 'forced-test', username: 'forcedchange', fullName: 'Forced Change', role: 'teacher', status: 'active', passwordHash: bcrypt.hashSync(forcedPassword, 4), passwordChangeRequired: true },
    { _id: 'locked-test', username: 'lockme', fullName: 'Lock Test', role: 'teacher', status: 'active', passwordHash: bcrypt.hashSync(password, 4) },
  ];
  await fs.writeFile(path.join(dataDir, 'users.json'), JSON.stringify(users));
  await fs.writeFile(path.join(dataDir, 'classes.json'), JSON.stringify([
    { _id: 'class-test', name: 'Grade 1', section: 'A', academicYear: '2026-2027', status: 'active' },
  ]));
  await fs.writeFile(path.join(dataDir, 'students.json'), JSON.stringify([
    {
      _id: 'student-payment', admissionNo: 'TEST-0001', firstName: 'Payment', lastName: 'Test',
      classId: 'class-test', parentIds: ['parent-test'], status: 'active', totalDemand: 100,
      profilePhoto: { _id: 'private-photo' }, documents: { birthCertificate: { _id: 'private-document' } },
      feeAssignments: [{ components: [{ name: 'Tuition', frequency: 'annual', amount: 100 }] }],
    },
  ]));
  await fs.writeFile(path.join(dataDir, 'parents.json'), JSON.stringify([
    { _id: 'parent-test', name: 'Scoped Parent', status: 'active' },
  ]));
  await fs.writeFile(path.join(dataDir, 'assignments.json'), '[]');
  await fs.writeFile(path.join(dataDir, 'exams.json'), JSON.stringify([
    { _id: 'exam-test', name: 'Scoped Exam', status: 'scheduled', classIds: ['class-test'] },
  ]));
  await fs.writeFile(path.join(dataDir, 'subjects.json'), JSON.stringify([
    { _id: 'subject-test', name: 'Mathematics', maxMarks: 100, passingMarks: 33, classIds: ['class-test'] },
  ]));
  await fs.writeFile(path.join(dataDir, 'substitutes.json'), JSON.stringify([
    { _id: 'substitute-other', absentTeacherId: 'another-teacher', substituteTeacherId: 'third-teacher', status: 'allocated' },
  ]));
  await fs.writeFile(path.join(dataDir, 'helpdesk.json'), JSON.stringify([
    { _id: 'ticket-parent', subject: 'Mine', raisedBy: 'scopedparent', role: 'parent', status: 'open' },
    { _id: 'ticket-other', subject: 'Other', raisedBy: 'another-user', role: 'parent', status: 'open' },
  ]));
  const port = 18_000 + (process.pid % 10_000);
  const child = spawn(process.execPath, ['src/index.js'], {
    cwd: path.resolve('.'),
    env: {
      ...process.env,
      PORT: String(port),
      DATA_DIR: dataDir,
      UPLOADS_DIR: uploadsDir,
      BACKUP_ENABLED: 'false',
      JWT_SECRET: 'integration-test-secret-that-is-long-enough',
      APP_URL: 'http://localhost:5173',
      NODE_ENV: 'test',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  t.after(async () => {
    if (child.exitCode === null) child.kill('SIGTERM');
    await new Promise((resolve) => child.exitCode === null ? child.once('exit', resolve) : resolve());
    await fs.rm(root, { recursive: true, force: true });
  });
  await waitForServer(child);

  const health = await request(port, 'GET', '/api/health');
  assert.equal(health.status, 200);
  assert.equal(health.headers['x-content-type-options'], 'nosniff');

  const login = await request(port, 'POST', '/api/auth/login', { body: { username: 'secureadmin', password } });
  assert.equal(login.status, 200);
  const adminCookies = login.headers['set-cookie'].map(cookiePair);
  const csrf = adminCookies.find((value) => value.startsWith('sms_csrf=')).split('=')[1];

  assert.equal((await request(port, 'GET', '/api/auth/me', { cookies: adminCookies })).status, 200);
  assert.equal((await request(port, 'POST', '/api/backups', { cookies: adminCookies, body: { reason: 'test' } })).status, 403);
  assert.equal((await request(port, 'POST', '/api/users', {
    cookies: adminCookies, csrf,
    body: { username: 'weak-user', password: 'abcdefghijkl', fullName: 'Weak User', role: 'teacher' },
  })).status, 400);
  assert.equal((await request(port, 'POST', '/api/users', {
    cookies: adminCookies, csrf,
    body: { username: 'orphan-parent', password: 'Strong-Portal-42!', fullName: 'Orphan Parent', role: 'parent' },
  })).status, 400);
  assert.equal((await request(port, 'POST', '/api/users/admin-test/status', {
    cookies: adminCookies, csrf, body: { status: 'suspended' },
  })).status, 409);

  const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]).toString('base64');
  const uploaded = await request(port, 'POST', '/api/attachments', {
    cookies: adminCookies,
    csrf,
    body: { fileName: 'proof.png', mimeType: 'image/png', data: png, scope: 'notice' },
  });
  assert.equal(uploaded.status, 201);
  const downloaded = await request(port, 'GET', `/api${uploaded.body.url}`, { cookies: adminCookies });
  assert.equal(downloaded.status, 200);
  assert.equal(downloaded.headers['content-type'], 'image/png');

  const createdAssets = await Promise.all(Array.from({ length: 12 }, (_, index) => request(port, 'POST', '/api/assets', {
    cookies: adminCookies,
    csrf,
    body: { name: `Concurrent asset ${index}` },
  })));
  assert.equal(createdAssets.every((response) => response.status === 201), true);
  assert.equal(new Set(createdAssets.map((response) => response.body.tag)).size, createdAssets.length);

  const paymentRequest = {
    cookies: adminCookies,
    csrf,
    body: { studentId: 'student-payment', amountPaid: 60, mode: 'cash', idempotencyKey: 'integration-payment-1' },
  };
  const duplicatePayments = await Promise.all([
    request(port, 'POST', '/api/fees', paymentRequest),
    request(port, 'POST', '/api/fees', paymentRequest),
  ]);
  assert.equal(duplicatePayments.every((response) => [200, 201].includes(response.status)), true);
  assert.equal(duplicatePayments[0].body._id, duplicatePayments[1].body._id);
  const receipts = await request(port, 'GET', '/api/fees', { cookies: adminCookies });
  assert.equal(receipts.body.length, 1);
  const receiptId = receipts.body[0]._id;
  assert.equal((await request(port, 'POST', `/api/fees/${receiptId}/refund`, {
    cookies: adminCookies, csrf, body: { reason: 'Integration reversal' },
  })).status, 200);
  assert.equal((await request(port, 'POST', `/api/fees/${receiptId}/refund`, {
    cookies: adminCookies, csrf, body: { reason: 'Duplicate reversal' },
  })).status, 409);
  const accounts = await request(port, 'GET', '/api/daily-accounts', { cookies: adminCookies });
  assert.equal(accounts.body.filter((row) => row.category === 'Fees').length, 1);
  assert.equal(accounts.body.filter((row) => row.category === 'Fee Refund').length, 1);
  assert.equal(new Set(accounts.body.map((row) => row.ledgerKey).filter(Boolean)).size, 2);
  const generatedAccount = accounts.body.find((row) => row.receiptId === receiptId);
  assert.equal((await request(port, 'PUT', `/api/daily-accounts/${generatedAccount._id}`, {
    cookies: adminCookies, csrf, body: { amount: 1 },
  })).status, 403);
  assert.equal((await request(port, 'POST', '/api/daily-accounts', {
    cookies: adminCookies, csrf, body: { date: '2026-08-11', type: 'income', category: 'Manual', amount: -1 },
  })).status, 400);

  const inventoryItem = await request(port, 'POST', '/api/inventory', {
    cookies: adminCookies, csrf, body: { name: 'Single stock item', openingStock: 1, reorderLevel: 0 },
  });
  assert.equal(inventoryItem.status, 201);
  const concurrentIssues = await Promise.all([
    request(port, 'POST', `/api/inventory/${inventoryItem.body._id}/move`, {
      cookies: adminCookies, csrf, body: { type: 'issue', quantity: 1, issuedTo: 'First' },
    }),
    request(port, 'POST', `/api/inventory/${inventoryItem.body._id}/move`, {
      cookies: adminCookies, csrf, body: { type: 'issue', quantity: 1, issuedTo: 'Second' },
    }),
  ]);
  assert.deepEqual(concurrentIssues.map((response) => response.status).sort(), [200, 400]);
  const inventory = await request(port, 'GET', '/api/inventory', { cookies: adminCookies });
  assert.equal(inventory.body.find((row) => row._id === inventoryItem.body._id).quantity, 0);

  const attendanceSaves = await Promise.all([
    request(port, 'POST', '/api/attendance', {
      cookies: adminCookies, csrf, body: { classId: 'class-test', date: '2026-08-11', records: [{ studentId: 'student-payment', status: 'present' }] },
    }),
    request(port, 'POST', '/api/attendance', {
      cookies: adminCookies, csrf, body: { classId: 'class-test', date: '2026-08-11', records: [{ studentId: 'student-payment', status: 'late' }] },
    }),
  ]);
  assert.equal(attendanceSaves.every((response) => response.status === 200), true);
  assert.equal(attendanceSaves[0].body._id, attendanceSaves[1].body._id);
  assert.equal((await request(port, 'POST', '/api/attendance', {
    cookies: adminCookies, csrf, body: { classId: 'class-test', date: '2026-08-11', records: [{ studentId: 'student-payment', status: 'invalid' }] },
  })).status, 400);

  const marksSaves = await Promise.all([
    request(port, 'POST', '/api/exams/exam-test/marks', {
      cookies: adminCookies, csrf, body: { classId: 'class-test', subjectId: 'subject-test', action: 'draft', entries: [{ studentId: 'student-payment', marks: 84 }] },
    }),
    request(port, 'POST', '/api/exams/exam-test/marks', {
      cookies: adminCookies, csrf, body: { classId: 'class-test', subjectId: 'subject-test', action: 'draft', entries: [{ studentId: 'student-payment', marks: 85 }] },
    }),
  ]);
  assert.equal(marksSaves.every((response) => response.status === 200), true);
  assert.equal(marksSaves[0].body._id, marksSaves[1].body._id);
  assert.equal((await request(port, 'POST', '/api/exams/exam-test/marks', {
    cookies: adminCookies, csrf, body: { classId: 'class-test', subjectId: 'subject-test', entries: [{ studentId: 'student-payment', marks: 101 }] },
  })).status, 400);

  const salaryCreates = await Promise.all([
    request(port, 'POST', '/api/payroll', {
      cookies: adminCookies, csrf, body: { staffId: 'admin-test', month: '2026-08', basicSalary: 25000, workingDays: 26, presentDays: 26 },
    }),
    request(port, 'POST', '/api/payroll', {
      cookies: adminCookies, csrf, body: { staffId: 'admin-test', month: '2026-08', basicSalary: 25000, workingDays: 26, presentDays: 26 },
    }),
  ]);
  assert.deepEqual(salaryCreates.map((response) => response.status).sort(), [201, 400]);
  const salarySlip = salaryCreates.find((response) => response.status === 201).body;
  const salaryPayments = await Promise.all([
    request(port, 'POST', `/api/payroll/${salarySlip._id}/pay`, { cookies: adminCookies, csrf, body: { mode: 'online' } }),
    request(port, 'POST', `/api/payroll/${salarySlip._id}/pay`, { cookies: adminCookies, csrf, body: { mode: 'online' } }),
  ]);
  assert.deepEqual(salaryPayments.map((response) => response.status).sort(), [200, 409]);
  const accountsAfterSalary = await request(port, 'GET', '/api/daily-accounts', { cookies: adminCookies });
  assert.equal(accountsAfterSalary.body.filter((row) => row.ledgerKey === `salary-expense:${salarySlip._id}`).length, 1);

  const book = await request(port, 'POST', '/api/library/books', {
    cookies: adminCookies, csrf, body: { title: 'Concurrency Book', copies: 1 },
  });
  assert.equal(book.status, 201);
  const libraryIssues = await Promise.all([
    request(port, 'POST', '/api/library/issues', {
      cookies: adminCookies, csrf, body: { bookId: book.body._id, memberType: 'student', memberId: 'student-payment', days: 14 },
    }),
    request(port, 'POST', '/api/library/issues', {
      cookies: adminCookies, csrf, body: { bookId: book.body._id, memberType: 'student', memberId: 'student-payment', days: 14 },
    }),
  ]);
  assert.deepEqual(libraryIssues.map((response) => response.status).sort(), [201, 400]);
  const issue = libraryIssues.find((response) => response.status === 201).body;
  const libraryReturns = await Promise.all([
    request(port, 'POST', `/api/library/issues/${issue._id}/return`, { cookies: adminCookies, csrf }),
    request(port, 'POST', `/api/library/issues/${issue._id}/return`, { cookies: adminCookies, csrf }),
  ]);
  assert.deepEqual(libraryReturns.map((response) => response.status).sort(), [200, 409]);
  const books = await request(port, 'GET', '/api/library/books', { cookies: adminCookies });
  assert.equal(books.body.find((row) => row._id === book.body._id).availableCopies, 1);

  const clerkLogin = await request(port, 'POST', '/api/auth/login', { body: { username: 'secureclerk', password } });
  const clerkCookies = clerkLogin.headers['set-cookie'].map(cookiePair);
  assert.equal((await request(port, 'GET', '/api/backups/health', { cookies: clerkCookies })).status, 403);

  const forcedLogin = await request(port, 'POST', '/api/auth/login', { body: { username: 'forcedchange', password: forcedPassword } });
  const forcedCookies = forcedLogin.headers['set-cookie'].map(cookiePair);
  const forcedCsrf = forcedCookies.find((value) => value.startsWith('sms_csrf=')).split('=')[1];
  assert.equal((await request(port, 'GET', '/api/settings', { cookies: forcedCookies })).status, 200);
  assert.equal((await request(port, 'POST', '/api/auth/change-password', {
    cookies: forcedCookies,
    csrf: forcedCsrf,
    body: { currentPassword: forcedPassword, newPassword: 'Replacement-Login-84!' },
  })).status, 200);

  const parentLogin = await request(port, 'POST', '/api/auth/login', { body: { username: 'scopedparent', password } });
  assert.equal(parentLogin.status, 200);
  const parentCookies = parentLogin.headers['set-cookie'].map(cookiePair);
  const parentCsrf = parentCookies.find((value) => value.startsWith('sms_csrf=')).split('=')[1];
  for (const restrictedPath of [
    '/api/dashboard/stats', '/api/daily-accounts', '/api/payroll',
    '/api/exams/exam-test/results', '/api/attendance/summary/week',
  ]) {
    assert.equal((await request(port, 'GET', restrictedPath, { cookies: parentCookies })).status, 403);
  }
  const ownTickets = await request(port, 'GET', '/api/helpdesk', { cookies: parentCookies });
  assert.deepEqual(ownTickets.body.map((row) => row._id), ['ticket-parent']);
  const submittedTicket = await request(port, 'POST', '/api/helpdesk', {
    cookies: parentCookies,
    csrf: parentCsrf,
    body: { subject: 'Need help', raisedBy: 'secureadmin', role: 'admin', status: 'resolved', assignedTo: 'admin-test' },
  });
  assert.equal(submittedTicket.status, 201);
  assert.equal(submittedTicket.body.raisedBy, 'scopedparent');
  assert.equal(submittedTicket.body.role, 'parent');
  assert.equal(submittedTicket.body.status, 'open');
  assert.equal(submittedTicket.body.assignedTo, undefined);
  assert.equal((await request(port, 'PUT', `/api/helpdesk/${submittedTicket.body._id}`, {
    cookies: parentCookies, csrf: parentCsrf, body: { status: 'resolved' },
  })).status, 403);
  assert.equal((await request(port, 'GET', '/api/timetables/class-test', { cookies: parentCookies })).status, 200);
  assert.equal((await request(port, 'GET', '/api/timetables/unlinked-class', { cookies: parentCookies })).status, 404);
  const parentFees = await request(port, 'GET', '/api/students/student-payment/fees', { cookies: parentCookies });
  assert.equal(parentFees.status, 200);
  assert.equal(parentFees.body.student.profilePhoto, undefined);
  assert.equal(parentFees.body.student.documents, undefined);
  const parentPortal = await request(port, 'GET', '/api/portal/parent', { cookies: parentCookies });
  assert.equal(parentPortal.status, 200);
  assert.equal(parentPortal.body.children[0].student.profilePhoto, undefined);
  assert.equal(parentPortal.body.children[0].student.documents, undefined);
  const parentResults = await request(port, 'GET', '/api/students/student-payment/results', { cookies: parentCookies });
  assert.equal(parentResults.status, 200);
  assert.equal(parentResults.body.student.profilePhoto, undefined);
  assert.equal(parentResults.body.student.documents, undefined);

  const teacherLogin = await request(port, 'POST', '/api/auth/login', { body: { username: 'scopedteacher', password } });
  assert.equal(teacherLogin.status, 200);
  const teacherCookies = teacherLogin.headers['set-cookie'].map(cookiePair);
  const teacherCsrf = teacherCookies.find((value) => value.startsWith('sms_csrf=')).split('=')[1];
  const teacherStudents = await request(port, 'GET', '/api/students', { cookies: teacherCookies });
  assert.equal(teacherStudents.status, 200);
  assert.deepEqual(teacherStudents.body, []);
  assert.equal((await request(port, 'GET', '/api/attendance?classId=class-test&date=2026-08-11', { cookies: teacherCookies })).status, 403);
  assert.equal((await request(port, 'POST', '/api/homework', {
    cookies: teacherCookies,
    csrf: teacherCsrf,
    body: { title: 'Unauthorized', classId: 'class-test', subjectId: 'subject-test', dueDate: '2026-08-12' },
  })).status, 403);
  const teacherAssignments = await request(port, 'GET', '/api/teachers/assignments?teacherId=admin-test', { cookies: teacherCookies });
  assert.equal(teacherAssignments.status, 200);
  assert.deepEqual(teacherAssignments.body, []);
  assert.equal((await request(port, 'GET', '/api/exams/exam-test/hall-tickets?classId=class-test', { cookies: teacherCookies })).status, 403);
  const teacherSearch = await request(port, 'GET', '/api/search?q=Payment', { cookies: teacherCookies });
  assert.equal(teacherSearch.status, 200);
  assert.equal(teacherSearch.body.some((row) => row.type === 'Student'), false);
  const teacherSubstitutes = await request(port, 'GET', '/api/teachers/substitutes', { cookies: teacherCookies });
  assert.equal(teacherSubstitutes.status, 200);
  assert.deepEqual(teacherSubstitutes.body, []);
  assert.equal((await request(port, 'GET', `/api${uploaded.body.url}`, { cookies: teacherCookies })).status, 403);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    await request(port, 'POST', '/api/auth/login', { body: { username: 'lockme', password: 'wrong-password' } });
  }
  assert.equal((await request(port, 'POST', '/api/auth/login', { body: { username: 'lockme', password } })).status, 429);

  assert.equal((await request(port, 'POST', '/api/auth/logout', { cookies: adminCookies, csrf })).status, 200);
});
