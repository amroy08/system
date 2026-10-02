import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import { nanoid } from 'nanoid';
import { execSync } from 'child_process';
import { initDb, col, closeDb, flushDb } from '../db/index.js';

const execute = process.argv.includes('--execute');
const rawFilePath = path.resolve('scratch/raw_submissions.txt');
const excelFilePath = '/Users/amroy/Downloads/parentstudentusernameandpassword.xlsx';

function normalize(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, ' ').trim();
}

function parseDob(value) {
  if (!value) return '';
  const str = String(value).trim();
  const mdy = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdy) {
    const month = mdy[1].padStart(2, '0');
    const day = mdy[2].padStart(2, '0');
    const year = parseInt(mdy[3], 10);
    // If year was entered as 2026 mistakenly by clicking today in calendar, don't use it as DOB
    if (year >= 2026) return '';
    return `${year}-${month}-${day}`;
  }
  return str;
}

try {
  await initDb();

  const text = fs.readFileSync(rawFilePath, 'utf8');
  const lines = text.trim().split('\n').filter(Boolean);
  const parsed = [];

  lines.forEach((line, idx) => {
    const p = line.split('\t').map((s) => s.trim());
    let gradeIdx = p.findIndex((val, i) => i > 1 && /^Grade\s+\d+/i.test(val));
    if (gradeIdx === -1) return;
    parsed.push({
      lineNum: idx + 1,
      timestamp: p[0],
      formEmail: p[1],
      studentName: p.slice(2, gradeIdx).filter(Boolean).join(' '),
      grade: p[gradeIdx],
      section: p[gradeIdx + 1] || 'A',
      rollNo: p[gradeIdx + 2],
      parentName: p[gradeIdx + 3],
      relation: p[gradeIdx + 4] || 'Parent',
      mobile: p[gradeIdx + 5]?.replace(/\D/g, '').slice(-10),
      parentEmail: p[gradeIdx + 6] || p[1],
      dob: p[gradeIdx + 7] || '',
    });
  });

  const classes = await col('classes').find({});
  const students = await col('students').find({});
  const parents = await col('parents').find({});
  const users = await col('users').find({});

  function findStudent(sub) {
    const subName = normalize(sub.studentName);
    const subWords = subName.split(/\s+/).filter((w) => w.length > 2);
    const subMob = sub.mobile;
    const subRoll = parseInt(sub.rollNo.replace(/\D/g, ''), 10);
    const subGrade = normalize(sub.grade);

    // Direct mappings
    if (subName.includes('janvi') && subName.includes('patel') && subGrade.includes('8')) return students.find((s) => s.admissionNo === '2026-00000444');
    if (subMob === '7208178562' || subName.includes('parizad')) return students.find((s) => s.admissionNo === '2026-00000289');
    if (subName.includes('ravi') && subGrade.includes('6') && (sub.parentName.toLowerCase().includes('laxman') || subMob === '9029584436')) return students.find((s) => s.admissionNo === '2026-00000185');
    if (subName.includes('krishna') && subName.includes('gupta') && subGrade.includes('9')) return students.find((s) => s.admissionNo === '2026-00000372');
    if (subName.includes('devansh') && subGrade.includes('10')) return students.find((s) => s.admissionNo === '2026-00000303');
    if (subName.includes('bhawna') && subGrade.includes('10')) return students.find((s) => s.admissionNo === '2026-00000293');
    if (subName.includes('vikash') && subGrade.includes('10')) return students.find((s) => s.admissionNo === '2026-00000304');
    if (subName.includes('sakshi') && subGrade.includes('10')) return students.find((s) => s.admissionNo === '2026-00000282');
    if (subName.includes('seema') && subGrade.includes('10')) return students.find((s) => s.admissionNo === '2026-00000290');
    if (subName.includes('pooja') && subGrade.includes('10')) return students.find((s) => s.admissionNo === '2026-00000250');
    if (subName.includes('ritik') && subGrade.includes('10')) return students.find((s) => s.admissionNo === '2026-00000265');
    if (subName.includes('drishti') && subGrade.includes('10')) return students.find((s) => s.admissionNo === '2026-00000322');
    if (subName.includes('somnath') && subGrade.includes('10')) return students.find((s) => s.admissionNo === '2026-00000275');
    if (subName.includes('janhvi') && subGrade.includes('10')) return students.find((s) => s.admissionNo === '2026-00000315');
    if (subName.includes('hamid') && subGrade.includes('10')) return students.find((s) => s.admissionNo === '2026-00000306');
    if (subName.includes('kailash') && subGrade.includes('10')) return students.find((s) => s.admissionNo === '2026-00000302');
    if (subName.includes('atikur') && subGrade.includes('10')) return students.find((s) => s.admissionNo === '2026-00000272');
    if (subName.includes('samruddhi') && subGrade.includes('10')) return students.find((s) => s.admissionNo === '2026-00000292');
    if (subName.includes('bhavya') && subGrade.includes('10')) return students.find((s) => s.admissionNo === '2026-00000309');
    if (subMob === '7014908771') return students.find((s) => s.admissionNo === '2026-00000294');
    if (subName.includes('piyush') && subGrade.includes('10')) return students.find((s) => s.admissionNo === '2026-00000299');
    if (subName.includes('roshani') && subGrade.includes('10')) return students.find((s) => s.admissionNo === '2026-00000321');
    if (subName.includes('ayushi') && subGrade.includes('10')) return students.find((s) => s.admissionNo === '2026-00000251');
    if (subName.includes('kajal') && subGrade.includes('10')) return students.find((s) => s.admissionNo === '2026-00000320');
    if (subName.includes('mahendra') && subGrade.includes('10')) return students.find((s) => s.admissionNo === '2026-00000301');
    if (subMob === '7498292075' || subName.includes('asuram')) return students.find((s) => s.admissionNo === '2026-00000368');
    if (subMob === '9079842148' || (subName.includes('mamta') && subGrade.includes('6'))) return students.find((s) => s.admissionNo === '2026-00000555');

    const targetClasses = classes.filter((c) => normalize(c.name) === subGrade);
    const targetClassIds = new Set(targetClasses.map((c) => c._id));
    const classStudents = students.filter((s) => targetClassIds.has(s.classId));

    if (subMob) {
      const mobMatch = classStudents.find((s) => {
        const sm = String(s.parentMobile || s.mobile || '').replace(/\D/g, '').slice(-10);
        return sm === subMob;
      });
      if (mobMatch) return mobMatch;
    }

    if (subRoll) {
      const rollMatch = classStudents.find((s) => {
        const sRoll = parseInt(s.rollNo, 10);
        if (sRoll !== subRoll) return false;
        const sName = normalize(`${s.firstName} ${s.lastName}`);
        return subWords.some((w) => sName.includes(w));
      });
      if (rollMatch) return rollMatch;
    }

    const nameMatches = classStudents.filter((s) => {
      const sName = normalize(`${s.firstName} ${s.lastName}`);
      const matchedCount = subWords.filter((w) => sName.includes(w)).length;
      return matchedCount >= Math.min(2, subWords.length);
    });
    if (nameMatches.length === 1) return nameMatches[0];

    const allNameMatches = students.filter((s) => {
      const sName = normalize(`${s.firstName} ${s.lastName}`);
      const matchedCount = subWords.filter((w) => sName.includes(w)).length;
      return matchedCount >= Math.min(2, subWords.length) && matchedCount >= 2;
    });
    if (allNameMatches.length === 1) return allNameMatches[0];

    if (subMob) {
      const allMob = students.filter((s) => {
        const sm = String(s.parentMobile || s.mobile || '').replace(/\D/g, '').slice(-10);
        return sm === subMob;
      });
      if (allMob.length === 1) return allMob[0];
    }

    return null;
  }

  // Deduplicate submissions per student
  const studentSubmissions = new Map();
  let nishthaSub = null;

  for (const sub of parsed) {
    if (normalize(sub.studentName).includes('nishtha')) {
      nishthaSub = sub;
      continue;
    }
    const st = findStudent(sub);
    if (st) {
      studentSubmissions.set(st._id, { sub, student: st });
    }
  }

  console.log(`Parsed ${parsed.length} submissions.`);
  console.log(`Matched ${studentSubmissions.size} distinct existing students.`);
  if (nishthaSub) console.log(`Found 1 private student to register: ${nishthaSub.studentName}`);

  // Determine next admission number for Nishtha if executing
  let maxAdmInt = 0;
  students.forEach((s) => {
    const m = String(s.admissionNo || '').match(/2026-(\d+)/);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n > maxAdmInt) maxAdmInt = n;
    }
  });

  const grade10Class = classes.find((c) => c.name === 'Grade 10' && (c.section === 'A' || !c.section));
  let nishthaStudent = students.find((s) => normalize(`${s.firstName} ${s.lastName}`).includes('nishtha'));

  const now = new Date().toISOString();

  if (execute) {
    // 1. Create Nishtha if not exists
    if (!nishthaStudent && nishthaSub) {
      const newAdm = `2026-${String(maxAdmInt + 1).padStart(8, '0')}`;
      nishthaStudent = {
        _id: nanoid(12),
        admissionNo: newAdm,
        firstName: 'Nishtha',
        lastName: 'Manish Parmar',
        gender: 'Female',
        dob: parseDob(nishthaSub.dob) || '2011-04-21',
        nationality: 'Indian',
        curriculum: 'State Board',
        englishLevel: 'FLUENT',
        house: '',
        classId: grade10Class?._id,
        rollNo: 'Pvt4',
        admissionDate: now.slice(0, 10),
        academicYear: '2026-2027',
        status: 'active',
        parentIds: [],
        parentName: nishthaSub.parentName,
        parentRelation: nishthaSub.relation || 'Mother',
        parentMobile: nishthaSub.mobile,
        parentEmail: nishthaSub.parentEmail,
        alternateContact: '',
        address: '',
        admissionCategory: 'PRIVATE',
        totalDemand: 0,
        createdAt: now,
        updatedAt: now,
      };
      await col('students').insertOne(nishthaStudent);
      console.log(`Registered new student: ${nishthaStudent.firstName} ${nishthaStudent.lastName} (${nishthaStudent.admissionNo})`);
    }

    if (nishthaStudent && nishthaSub) {
      studentSubmissions.set(nishthaStudent._id, { sub: nishthaSub, student: nishthaStudent });
    }

    const existingParents = await col('parents').find({ status: { $ne: 'deleted' } });
    const existingUsers = await col('users').find({ status: { $ne: 'deleted' } });

    const parentByMobile = new Map();
    existingParents.forEach((p) => {
      const mob = String(p.mobile || '').replace(/\D/g, '').slice(-10);
      if (mob) parentByMobile.set(mob, p);
    });

    const userByUsername = new Map();
    existingUsers.forEach((u) => userByUsername.set(u.username, u));

    let parentsUpserted = 0;
    let studentsUpdated = 0;
    let studentUsersSynced = 0;
    let parentUsersSynced = 0;

    const studentPasswordHash = bcrypt.hashSync('Student@2026!', 12);
    const parentPasswordHash = bcrypt.hashSync('Parent@2026!', 12);

    for (const [studentId, { sub, student }] of studentSubmissions.entries()) {
      const mob = sub.mobile;
      let parent = mob ? parentByMobile.get(mob) : null;

      // Upsert parent record
      if (!parent) {
        parent = {
          _id: nanoid(12),
          name: sub.parentName || `${student.firstName} Parent`,
          relation: sub.relation || 'Parent',
          mobile: mob || '',
          alternateMobile: '',
          email: sub.parentEmail || sub.formEmail || '',
          address: '',
          status: 'active',
          source: 'google-form-submission',
          createdAt: now,
          updatedAt: now,
        };
        await col('parents').insertOne(parent);
        if (mob) parentByMobile.set(mob, parent);
        parentsUpserted++;
      } else {
        // Update parent details if needed
        const updates = {};
        if (sub.parentName && (!parent.name || parent.name.endsWith('Parent'))) updates.name = sub.parentName;
        if (sub.relation && (!parent.relation || parent.relation === 'Guardian')) updates.relation = sub.relation;
        if (sub.parentEmail && !parent.email) updates.email = sub.parentEmail;
        if (Object.keys(updates).length > 0) {
          updates.updatedAt = now;
          await col('parents').updateOne({ _id: parent._id }, updates);
          Object.assign(parent, updates);
          parentsUpserted++;
        }
      }

      // Link parent to student and update student dob / contacts
      const parentIds = Array.isArray(student.parentIds) ? [...student.parentIds] : [];
      if (!parentIds.includes(parent._id)) parentIds.push(parent._id);

      const parsedDob = parseDob(sub.dob);
      const studentUpdates = {
        parentIds,
        parentName: sub.parentName || student.parentName,
        parentRelation: sub.relation || student.parentRelation,
        parentMobile: mob || student.parentMobile,
        parentEmail: sub.parentEmail || sub.formEmail || student.parentEmail,
        updatedAt: now,
      };
      if (parsedDob && (!student.dob || student.dob.startsWith('2026') || student.dob === '')) {
        studentUpdates.dob = parsedDob;
      }
      await col('students').updateOne({ _id: studentId }, studentUpdates);
      studentsUpdated++;

      // Student User
      const sUsername = `student${String(student.admissionNo || '').replace(/\D/g, '')}`;
      const existingSUser = userByUsername.get(sUsername) || existingUsers.find((u) => u.role === 'student' && u.refId === studentId);

      const sProfile = {
        username: sUsername,
        role: 'student',
        refId: studentId,
        fullName: `${student.firstName || ''} ${student.lastName || ''}`.trim() || student.admissionNo,
        email: student.email || '',
        mobile: mob || student.parentMobile || '',
        gender: student.gender || '',
        status: 'active',
        passwordHash: studentPasswordHash,
        passwordChangeRequired: false,
        credentialVersion: 2,
        updatedAt: now,
      };

      if (existingSUser) {
        await col('users').updateOne({ _id: existingSUser._id }, sProfile);
        Object.assign(existingSUser, sProfile);
      } else {
        const dbCheck = await col('users').findOne({ username: sUsername });
        if (dbCheck) {
          await col('users').updateOne({ _id: dbCheck._id }, sProfile);
          userByUsername.set(sUsername, { ...dbCheck, ...sProfile });
        } else {
          const newSUser = {
            _id: nanoid(12),
            joined: student.admissionDate || now.slice(0, 10),
            lastLogin: null,
            createdAt: now,
            ...sProfile,
          };
          await col('users').insertOne(newSUser);
          userByUsername.set(sUsername, newSUser);
        }
      }
      studentUsersSynced++;

      // Parent User
      const pUsername = mob ? `parent${mob}` : `parent_${parent._id}`;
      const existingPUser = userByUsername.get(pUsername) || existingUsers.find((u) => u.role === 'parent' && u.refId === parent._id);

      const pProfile = {
        username: pUsername,
        role: 'parent',
        refId: parent._id,
        fullName: parent.name,
        email: parent.email || sub.parentEmail || sub.formEmail || '',
        mobile: mob || '',
        gender: parent.gender || '',
        status: 'active',
        passwordHash: parentPasswordHash,
        passwordChangeRequired: false,
        credentialVersion: 2,
        updatedAt: now,
      };

      if (existingPUser) {
        await col('users').updateOne({ _id: existingPUser._id }, pProfile);
        Object.assign(existingPUser, pProfile);
      } else {
        const dbCheck = await col('users').findOne({ username: pUsername });
        if (dbCheck) {
          await col('users').updateOne({ _id: dbCheck._id }, pProfile);
          userByUsername.set(pUsername, { ...dbCheck, ...pProfile });
        } else {
          const newPUser = {
            _id: nanoid(12),
            joined: parent.createdAt?.slice(0, 10) || now.slice(0, 10),
            lastLogin: null,
            createdAt: now,
            ...pProfile,
          };
          await col('users').insertOne(newPUser);
          userByUsername.set(pUsername, newPUser);
        }
      }
      parentUsersSynced++;
    }

    await flushDb();

    console.log(`\n=== DATABASE SYNC COMPLETED ===`);
    console.log(`Parents upserted: ${parentsUpserted}`);
    console.log(`Students updated: ${studentsUpdated}`);
    console.log(`Student users synced: ${studentUsersSynced}`);
    console.log(`Parent users synced: ${parentUsersSynced}`);

    // Update Excel file
    console.log(`\nSyncing Excel file: ${excelFilePath}...`);
    const pyScript = `
import openpyxl

wb = openpyxl.load_workbook("${excelFilePath}")
ws = wb.active

excel_adms = set()
for r in range(1, ws.max_row + 1):
    vals = [cell.value for cell in ws[r]]
    for v in vals:
        if v and str(v).startswith('2026-0000'):
            excel_adms.add(str(v).strip())

items_to_add = []
with open("scratch/excel_append_data.json") as f:
    import json
    items_to_add = json.load(f)

added_count = 0
for item in items_to_add:
    adm = item["admissionNo"]
    if adm in excel_adms:
        continue
    
    # Format row:
    # A: Grade & Section
    # B: Roll
    # C: Student Name
    # D: Admission No
    # E: Student Username
    # F: Student Password
    # G: Parent / Guardian
    # H: Parent Username
    # I: Parent Password
    # J: Note
    row_data = [
        item["gradeSection"],
        item["rollNo"],
        item["studentName"],
        item["admissionNo"],
        item["studentUsername"],
        item["studentPassword"],
        item["parentGuardian"],
        item["parentUsername"],
        item["parentPassword"],
        item["emailNote"]
    ]
    ws.append(row_data)
    excel_adms.add(adm)
    added_count += 1

wb.save("${excelFilePath}")
print(f"Appended {added_count} new student rows to Excel.")
`;

    // Prepare JSON for python script
    const excelAppendData = [];
    for (const [studentId, { sub, student }] of studentSubmissions.entries()) {
      const cl = classes.find((c) => c._id === student.classId);
      const gradeSection = `${sub.grade} ${sub.section || cl?.section || 'A'}`;
      const rollNo = sub.rollNo || student.rollNo;
      const sName = student.firstName ? `${student.firstName} ${student.lastName || ''}`.trim() : sub.studentName;
      const adm = student.admissionNo;
      const sUser = `student${adm.replace(/\D/g, '')}`;
      const pGuardian = `${sub.parentName} (${sub.relation || 'Parent'})`;
      const pUser = `parent${sub.mobile}`;
      const emailNote = sub.parentEmail ? `(or ${sub.parentEmail})` : '';

      excelAppendData.push({
        gradeSection,
        rollNo,
        studentName: sName,
        admissionNo: adm,
        studentUsername: sUser,
        studentPassword: 'Student@2026!',
        parentGuardian: pGuardian,
        parentUsername: pUser,
        parentPassword: 'Parent@2026!',
        emailNote,
      });
    }

    fs.writeFileSync('scratch/excel_append_data.json', JSON.stringify(excelAppendData, null, 2));
    fs.writeFileSync('scratch/sync_excel.py', pyScript);

    const pyResult = execSync('python3 scratch/sync_excel.py').toString();
    console.log(pyResult.trim());
  } else {
    console.log('\n[Dry-run mode] Re-run with --execute to commit changes to MongoDB Atlas and Excel.');
  }

  await closeDb();
} catch (err) {
  console.error('Error during execution:', err);
  process.exit(1);
}
