import { Router } from 'express';
import { authRequired } from '../middleware/auth.js';
import { runSync } from '../services/sync.js';

const router = Router();
router.use(authRequired);

// Pull the latest metrics from every connected platform and run the automation
// rules. Returns how many campaign-days were synced plus any alerts raised.
router.post('/', async (req, res, next) => {
  try {
    const result = await runSync({ trigger: 'manual' });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
