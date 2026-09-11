import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// Execution flag: pass --execute to apply changes
const isExecute = process.argv.includes('--execute');

const deduplicationMap = [
  // 1. Mayank M Chaurasiya (Grade 8 A)
  {
    name: 'Mayank M Chaurasiya',
    class: 'Grade 8 A',
    primaryId: 'E7zI3PE4BXvL', // Adm: 2026-00000201 (Paid: ₹9,500)
    duplicateIds: ['OKBzb5lNJ_7g'] // Adm: 2026-00000202 (Paid: ₹0)
  },
  // 2. Ramesh Mali (Grade 8 A)
  {
    name: 'Ramesh Mali',
    class: 'Grade 8 A',
    primaryId: 'LUWag4BzYidp', // Adm: 2026-00000205
    duplicateIds: [
      'c2XmAdQSm9wb', // Adm: 2026-00000206
      'XWprRRNc2Ox9', // Adm: 2026-00000207
      'hilXCBX3_B0S'  // Adm: 2026-00000215
    ]
  },
  // 3. Himesh Jiglesh Jain (Grade 6 A)
  {
    name: 'Himesh Jiglesh Jain',
    class: 'Grade 6 A',
    primaryId: 'mNG81A0G39Gr', // Adm: 2026-00000180 (Paid: ₹11,000)
    duplicateIds: ['u51-B9hQvijh'] // Adm: 2026-00000181 (Paid: ₹0)
  },
  // 4. Ritika T Singh (Grade 6 A)
  {
    name: 'Ritika T Singh',
    class: 'Grade 6 A',
    primaryId: '1OrwVECksrdQ', // Adm: 2026-00000177 (Paid: ₹15,000)
    duplicateIds: ['p9KP6q_wXRHN'] // Adm: 2026-00000178 (Paid: ₹0)
  },
  // 5. Ishan Mithapara (Grade 6 A)
  {
    name: 'Ishan Mithapara',
    class: 'Grade 6 A',
    primaryId: 'ndIiUq9wQOEz', // Adm: 2026-00000190 (Paid: ₹0)
    duplicateIds: ['0w3jGm0w96tW'] // Adm: 2026-00000191 (Paid: ₹0)
  },
  // 6. Jeetu Vagta Ram (Grade 7 A)
  {
    name: 'Jeetu Vagta Ram',
    class: 'Grade 7 A',
    primaryId: 'F8oZVBSLpDrL', // Adm: 2026-00000196 (Paid: ₹2,200)
    duplicateIds: ['M7sULpwSvku3'] // Adm: 2026-00000195 (Paid: ₹0)
  },
  // 7. Nandani D Maurya (Grade 7 A)
  {
    name: 'Nandani D Maurya',
    class: 'Grade 7 A',
    primaryId: 'PCC2rNGrcWj5', // Adm: 2026-00000194 (Paid: ₹12,000)
    duplicateIds: ['4E8Wk8Ms8RRS'] // Adm: 2026-00000193 (Paid: ₹0)
  },
  // 8. Gautam S Suthar (Grade 5 A)
  {
    name: 'Gautam S Suthar',
    class: 'Grade 5 A',
    primaryId: 'Sz2viXtd2qGS', // Adm: 2026-00000173 (Paid: ₹0)
    duplicateIds: ['ggEvfT5vaqcd'] // Adm: 2026-00000174 (Paid: ₹0)
  },
  // 9. Ramesh Mali (Grade 9 A)
  {
    name: 'Ramesh Mali',
    class: 'Grade 9 A',
    primaryId: '_vGv7XxtJTdK', // Adm: 2026-00000208
    duplicateIds: [
      'DiVcK384lW7Z', // Adm: 2026-00000209
      '51J2gGb5KC3a', // Adm: 2026-00000210
      'czkX3rjWG8nB', // Adm: 2026-00000211
      'dAaZXj80-EIc', // Adm: 2026-00000212
      'wzjMn06omLxs', // Adm: 2026-00000213
      'yvQ0Uz92yPVD'  // Adm: 2026-00000214
    ]
  }
];

async function run() {
  const client = new MongoClient(process.env.MONGO_URI);
  try {
    await client.connect();
    const db = client.db(process.env.MONGO_DB_NAME || 'mvhs_production');
    console.log(`[db] Connected to ${db.databaseName} (Mode: ${isExecute ? 'EXECUTE' : 'DRY RUN'})`);

    const studentsCol = db.collection('students');
    const feeReceiptsCol = db.collection('feeReceipts');
    const archivedReceiptsCol = db.collection('archivedFeeReceipts');
    const parentsCol = db.collection('parents');
    const usersCol = db.collection('users');

    // Baseline metrics
    const initialStudentsCount = await studentsCol.countDocuments();
    const initialReceiptsCount = await feeReceiptsCol.countDocuments();
    const initialArchivedCount = await archivedReceiptsCol.countDocuments();
    
    const allReceiptsBefore = await feeReceiptsCol.find({ status: { $ne: 'refunded' } }).toArray();
    const totalCollectedBefore = allReceiptsBefore.reduce((acc, r) => acc + (r.amountPaid || 0), 0);

    console.log('\n--- BASELINE METRICS BEFORE DEDUPLICATION ---');
    console.log(`Total Students: ${initialStudentsCount}`);
    console.log(`Total Live Receipts: ${initialReceiptsCount}`);
    console.log(`Total Archived Receipts: ${initialArchivedCount}`);
    console.log(`Total Collected Fees: ₹${totalCollectedBefore.toLocaleString()}`);

    let totalRemoved = 0;
    let totalReLinked = 0;

    for (const group of deduplicationMap) {
      console.log(`\nProcessing: ${group.name} (${group.class})`);
      const primaryDoc = await studentsCol.findOne({ _id: group.primaryId });
      if (!primaryDoc) {
        throw new Error(`Primary document not found for ID: ${group.primaryId}`);
      }
      console.log(`  Keeping Primary: Adm ${primaryDoc.admissionNo} (ID: ${primaryDoc._id})`);

      for (const dupId of group.duplicateIds) {
        const dupDoc = await studentsCol.findOne({ _id: dupId });
        if (!dupDoc) {
          console.log(`  Duplicate ID ${dupId} already absent. Skipping.`);
          continue;
        }

        // 1. Check & re-point fee receipts
        const liveReceipts = await feeReceiptsCol.find({ studentId: dupId }).toArray();
        if (liveReceipts.length > 0) {
          console.log(`    Transferring ${liveReceipts.length} live receipt(s) from ${dupId} -> ${group.primaryId}`);
          if (isExecute) {
            await feeReceiptsCol.updateMany(
              { studentId: dupId },
              { $set: { studentId: group.primaryId, studentName: `${primaryDoc.firstName} ${primaryDoc.lastName || ''}`.trim(), admissionNo: primaryDoc.admissionNo } }
            );
          }
          totalReLinked += liveReceipts.length;
        }

        // 2. Check & re-point archived receipts
        const archReceipts = await archivedReceiptsCol.find({ studentId: dupId }).toArray();
        if (archReceipts.length > 0) {
          console.log(`    Transferring ${archReceipts.length} archived receipt(s) from ${dupId} -> ${group.primaryId}`);
          if (isExecute) {
            await archivedReceiptsCol.updateMany(
              { studentId: dupId },
              { $set: { studentId: group.primaryId } }
            );
          }
          totalReLinked += archReceipts.length;
        }

        // 3. Check & re-point parents
        const parents = await parentsCol.find({ studentIds: dupId }).toArray();
        if (parents.length > 0) {
          console.log(`    Updating ${parents.length} parent record(s) referencing ${dupId}`);
          if (isExecute) {
            for (const p of parents) {
              const updatedIds = [...new Set(p.studentIds.map(id => id === dupId ? group.primaryId : id))];
              await parentsCol.updateOne({ _id: p._id }, { $set: { studentIds: updatedIds } });
            }
          }
        }

        // 4. Check & re-point users
        const linkedUsers = await usersCol.find({ studentId: dupId }).toArray();
        if (linkedUsers.length > 0) {
          console.log(`    Updating ${linkedUsers.length} user account(s) referencing ${dupId}`);
          if (isExecute) {
            await usersCol.updateMany({ studentId: dupId }, { $set: { studentId: group.primaryId } });
          }
        }

        // 5. Delete duplicate ghost student document
        console.log(`  Deleting duplicate ghost record: Adm ${dupDoc.admissionNo} (ID: ${dupId})`);
        if (isExecute) {
          await studentsCol.deleteOne({ _id: dupId });
        }
        totalRemoved++;
      }
    }

    console.log(`\n==============================================`);
    console.log(`Total duplicate documents ${isExecute ? 'deleted' : 'to delete'}: ${totalRemoved}`);
    console.log(`Total references transferred: ${totalReLinked}`);

    if (isExecute) {
      // Verify consistency after execution
      const finalStudentsCount = await studentsCol.countDocuments();
      const finalReceiptsCount = await feeReceiptsCol.countDocuments();
      const finalArchivedCount = await archivedReceiptsCol.countDocuments();

      const allReceiptsAfter = await feeReceiptsCol.find({ status: { $ne: 'refunded' } }).toArray();
      const totalCollectedAfter = allReceiptsAfter.reduce((acc, r) => acc + (r.amountPaid || 0), 0);

      console.log('\n--- VERIFICATION METRICS AFTER DEDUPLICATION ---');
      console.log(`Total Students: ${finalStudentsCount} (Expected: ${initialStudentsCount - totalRemoved})`);
      console.log(`Total Live Receipts: ${finalReceiptsCount} (Must equal ${initialReceiptsCount})`);
      console.log(`Total Archived Receipts: ${finalArchivedCount} (Must equal ${initialArchivedCount})`);
      console.log(`Total Collected Fees: ₹${totalCollectedAfter.toLocaleString()} (Must equal ₹${totalCollectedBefore.toLocaleString()})`);

      if (finalReceiptsCount !== initialReceiptsCount || totalCollectedAfter !== totalCollectedBefore) {
        throw new Error('FATAL: Financial consistency mismatch detected!');
      }

      console.log('\nSUCCESS: 100% data consistency verified! Zero financial discrepancies.');
    } else {
      console.log('\nDRY RUN COMPLETE: Run with --execute to apply changes.');
    }

  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  } finally {
    await client.close();
  }
}

run();
