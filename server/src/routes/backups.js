import { spawn } from 'node:child_process';
import { Router } from 'express';
import { authRequired, allowRoles } from '../middleware/auth.js';
import {
  createBackup,
  getBackupDirectory,
  getBackupHealth,
  listBackups,
  restoreBackup,
  verifyBackup,
} from '../utils/backupService.js';

const router = Router();
router.use(authRequired, allowRoles('admin'));

router.get('/health', (req, res) => res.json(getBackupHealth()));

router.get('/', (req, res) => res.json(listBackups()));

router.post('/', async (req, res) => {
  try {
    const backup = await createBackup({
      type: 'manual',
      createdBy: req.user.name || req.user.username || 'Administrator',
      reason: req.body.reason || 'Manual administrator snapshot',
    });
    res.status(201).json(backup);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/:id/verify', (req, res) => {
  try {
    res.json(verifyBackup(req.params.id));
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.get('/:id/download', (req, res) => {
  try {
    verifyBackup(req.params.id);
    const directory = getBackupDirectory(req.params.id);
    res.attachment(`${req.params.id}.tar.gz`);
    res.type('application/gzip');
    const archive = spawn('tar', ['-czf', '-', '-C', directory, '.']);
    archive.stdout.pipe(res);
    archive.stderr.on('data', (chunk) => console.error('[Backup Download]', chunk.toString().trim()));
    archive.on('error', (error) => res.destroy(error));
    archive.on('close', (code) => { if (code !== 0) res.destroy(new Error('Backup archive could not be created')); });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/:id/restore', async (req, res) => {
  if (req.body.confirmation !== req.params.id) {
    return res.status(400).json({ error: 'Restore confirmation does not match the selected backup' });
  }
  try {
    const result = await restoreBackup(req.params.id, {
      restoredBy: req.user.name || req.user.username || 'Administrator',
      reason: req.body.reason || 'Administrator restore',
    });
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

export default router;
